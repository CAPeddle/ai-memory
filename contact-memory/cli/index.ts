import type { AgentRuntime } from "../runtime/agent.ts";
import {
  type CaptureThoughtCommitter,
  commitContactShardCandidates,
} from "../commit/captureThoughtAdapter.ts";
import { extractContactMemory } from "../parser/extractor.ts";
import {
  type ContactExtraction,
  createContactShardCandidates,
  type ExtractionItem,
  type ReviewDecision,
  validateExtractionItem,
  validateReviewDecision,
  type WhatsAppChat,
} from "../parser/types.ts";
import { parseWhatsAppChat } from "../parser/whatsapp.ts";

export interface TerminalIO {
  write(message: string): void;
  prompt(message: string): Promise<string | null>;
}

export interface RunContactMemoryCliOptions {
  args: string[];
  runtime: AgentRuntime;
  commit: CaptureThoughtCommitter;
  io: TerminalIO;
  now?: () => Date;
}

interface ParsedArgs {
  filePath: string;
  contactName: string;
  project: string;
  from?: string;
  to?: string;
  messageCap: number;
  sessionId?: string;
}

const DEFAULT_PROJECT = "contact-memory";
const DEFAULT_MESSAGE_CAP = 250;

export async function runContactMemoryCli(
  options: RunContactMemoryCliOptions,
): Promise<number> {
  const parsedArgs = parseArgs(options.args);
  if (!parsedArgs.ok) {
    options.io.write(`${parsedArgs.message}\n${usage()}\n`);
    return 1;
  }

  let rawText: string;
  try {
    rawText = await Deno.readTextFile(parsedArgs.value.filePath);
  } catch {
    options.io.write(`Could not read file: ${parsedArgs.value.filePath}\n`);
    return 1;
  }
  const sessionId = parsedArgs.value.sessionId ??
    stableSessionId(parsedArgs.value.filePath);
  const parsed = parseWhatsAppChat(rawText, { session_id: sessionId });
  if (!parsed.ok) {
    options.io.write(`Parse failed: ${parsed.message}\n`);
    return 1;
  }

  if (requiresTargetConfirmation(parsed.value, parsedArgs.value.contactName)) {
    const confirm = await options.io.prompt(
      `Target contact "${parsedArgs.value.contactName}" is ambiguous for this chat. Continue? [y/N] `,
    );
    if (!isYes(confirm)) return 1;
  }

  let extraction: ContactExtraction;
  try {
    extraction = await extractContactMemory(parsed.value, options.runtime, {
      contactName: parsedArgs.value.contactName,
      from: parsedArgs.value.from,
      to: parsedArgs.value.to,
      messageCap: parsedArgs.value.messageCap,
    });
  } catch (error) {
    options.io.write(`Extraction failed: ${categoryOf(error)}\n`);
    return 1;
  }

  if (extraction.items.length === 0) {
    options.io.write("No reviewable items found.\n");
    return 0;
  }

  const decisions = await reviewItems(extraction, parsed.value, options);
  if (!decisions.ok) return decisions.code;

  const candidates = createContactShardCandidates({
    extraction,
    decisions: decisions.value,
    source: "whatsapp_export",
    agent_context: "contact-memory-cli",
  });
  if (!candidates.ok) {
    options.io.write(`Review validation failed: ${candidates.message}\n`);
    return 1;
  }

  writePreCommitSummary(
    options.io,
    parsedArgs.value,
    extraction,
    decisions.value,
    candidates.value.length,
  );
  const confirm = await options.io.prompt(
    "Commit approved/edited shards? Type yes to continue: ",
  );
  if (confirm !== "yes") {
    options.io.write("Commit cancelled before writes.\n");
    return 1;
  }

  const results = await commitContactShardCandidates(candidates.value, {
    project: parsedArgs.value.project,
    commit: options.commit,
  });
  for (const result of results) {
    options.io.write(
      result.ok
        ? `Committed item_id=${result.item_id}\n`
        : `Commit failed item_id=${result.item_id} category=${result.category}\n`,
    );
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

async function reviewItems(
  extraction: ContactExtraction,
  chat: WhatsAppChat,
  options: RunContactMemoryCliOptions,
): Promise<
  { ok: true; value: ReviewDecision[] } | { ok: false; code: number }
> {
  const decisions: ReviewDecision[] = [];
  const messageById = new Map(
    chat.messages.map((message) => [message.message_id, message]),
  );

  for (const item of extraction.items) {
    while (true) {
      writeReviewItem(options.io, item, messageById);
      const answer = await options.io.prompt(
        "Approve, edit, reject, or quit? [a/e/r/q] ",
      );
      if (answer === null || answer.toLowerCase() === "q") {
        options.io.write("Review cancelled before writes.\n");
        return { ok: false, code: 1 };
      }

      if (answer.toLowerCase() === "a") {
        const decision = makeDecision(item, "approve", options.now);
        if (tryRecordDecision(options.io, decisions, decision)) break;
        continue;
      }

      if (answer.toLowerCase() === "r") {
        const reason = await options.io.prompt("Reject reason (optional): ");
        const decision = makeDecision(item, "reject", options.now, {
          rejection_reason: reason?.trim() || undefined,
        });
        if (tryRecordDecision(options.io, decisions, decision)) break;
        continue;
      }

      if (answer.toLowerCase() === "e") {
        const edited = await options.io.prompt("Paste replacement item JSON: ");
        if (edited === null) return { ok: false, code: 1 };
        const replacement = parseEditedItem(edited, item);
        if (!replacement.ok) {
          options.io.write(`Invalid edit: ${replacement.message}\n`);
          continue;
        }
        const decision = makeDecision(item, "edit", options.now, {
          replacement_item: replacement.value,
          edit_rationale: "local terminal edit",
        });
        if (tryRecordDecision(options.io, decisions, decision, "Invalid edit")) {
          break;
        }
        continue;
      }
    }
  }

  return { ok: true, value: decisions };
}

function tryRecordDecision(
  io: TerminalIO,
  decisions: ReviewDecision[],
  decision: ReviewDecision,
  invalidLabel = "Review decision invalid",
): boolean {
  const valid = validateReviewDecision(decision);
  if (!valid.ok) {
    io.write(`${invalidLabel}: ${valid.message}\n`);
    return false;
  }
  decisions.push(valid.value);
  return true;
}

function writeReviewItem(
  io: TerminalIO,
  item: ExtractionItem,
  messageById: Map<string, WhatsAppChat["messages"][number]>,
): void {
  io.write(
    `\nItem ${item.item_id} (${item.kind}) confidence=${item.confidence}\n`,
  );
  io.write(`${sanitizeForTerminal(JSON.stringify(item, null, 2))}\n`);
  for (const evidence of item.evidence) {
    for (const messageId of evidence.message_ids) {
      const message = messageById.get(messageId);
      if (message) {
        io.write(
          `Evidence ${messageId} sender=${
            sanitizeForTerminal(message.sender)
          }\n${sanitizeForTerminal(message.body)}\n`,
        );
      } else {
        io.write(`Evidence ${messageId} missing from parsed chat\n`);
      }
    }
  }
}

function parseEditedItem(
  raw: string,
  original: ExtractionItem,
): { ok: true; value: ExtractionItem } | { ok: false; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "edit_json_invalid" };
  }
  const valid = validateExtractionItem(parsed);
  if (!valid.ok) return { ok: false, message: valid.message };
  if (
    valid.value.item_id !== original.item_id ||
    valid.value.extraction_id !== original.extraction_id ||
    valid.value.kind !== original.kind
  ) {
    return { ok: false, message: "edit_identity_changed" };
  }
  return { ok: true, value: valid.value };
}

function makeDecision(
  item: ExtractionItem,
  outcome: "approve" | "edit" | "reject",
  now: (() => Date) | undefined,
  extra: Record<string, unknown> = {},
): ReviewDecision {
  return {
    decision_id: `decision-${item.item_id}-${outcome}`,
    extraction_id: item.extraction_id,
    item_id: item.item_id,
    outcome,
    reviewed_at: (now?.() ?? new Date()).toISOString(),
    reviewer_context: "local-cli",
    ...extra,
  } as ReviewDecision;
}

function writePreCommitSummary(
  io: TerminalIO,
  args: ParsedArgs,
  extraction: ContactExtraction,
  decisions: ReviewDecision[],
  candidateCount: number,
): void {
  const counts = {
    approve:
      decisions.filter((decision) => decision.outcome === "approve").length,
    edit: decisions.filter((decision) => decision.outcome === "edit").length,
    reject:
      decisions.filter((decision) => decision.outcome === "reject").length,
  };
  io.write("\nPre-commit summary\n");
  io.write(`Target contact: ${args.contactName}\n`);
  io.write(`Project: ${args.project}\n`);
  io.write(`Session: ${extraction.session_id}\n`);
  io.write(
    `approve=${counts.approve} edit=${counts.edit} reject=${counts.reject} candidates=${candidateCount}\n`,
  );
  const committedItemIds = new Set(
    decisions
      .filter((decision) => decision.outcome !== "reject")
      .map((decision) => decision.item_id),
  );
  for (const item of extraction.items) {
    if (!committedItemIds.has(item.item_id)) continue;
    io.write(`Candidate item_id=${item.item_id} kind=${item.kind}\n`);
  }
}

function parseArgs(
  args: string[],
): { ok: true; value: ParsedArgs } | { ok: false; message: string } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const [key, inlineValue] = arg.split("=", 2);
      const value = inlineValue ?? args[++index];
      if (!value) return { ok: false, message: `Missing value for ${key}` };
      flags.set(key, value);
    } else {
      positional.push(arg);
    }
  }
  const filePath = positional[0] ?? flags.get("--file");
  const contactName = positional[1] ?? flags.get("--contact");
  if (!filePath || !contactName) {
    return { ok: false, message: "Missing file path or contact name" };
  }
  const messageCap = Number(flags.get("--message-cap") ?? DEFAULT_MESSAGE_CAP);
  if (!Number.isInteger(messageCap) || messageCap < 1) {
    return { ok: false, message: "--message-cap must be a positive integer" };
  }
  const from = flags.get("--from");
  if (from !== undefined && Number.isNaN(Date.parse(from))) {
    return { ok: false, message: "--from must be a parseable date" };
  }
  const to = flags.get("--to");
  if (to !== undefined && Number.isNaN(Date.parse(to))) {
    return { ok: false, message: "--to must be a parseable date" };
  }
  return {
    ok: true,
    value: {
      filePath,
      contactName,
      project: flags.get("--project") ?? DEFAULT_PROJECT,
      from,
      to,
      messageCap,
      sessionId: flags.get("--session-id"),
    },
  };
}

function requiresTargetConfirmation(
  chat: WhatsAppChat,
  contactName: string,
): boolean {
  if (chat.kind !== "one_to_one") return true;
  const participants = chat.participants ?? [];
  return participants.length > 0 && !participants.includes(contactName);
}

function stableSessionId(filePath: string): string {
  let hash = 0;
  for (const char of filePath) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `whatsapp-${hash.toString(16)}`;
}

// deno-lint-ignore no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function sanitizeForTerminal(text: string): string {
  return text.replace(CONTROL_CHAR_PATTERN, "");
}

function categoryOf(error: unknown): string {
  if (typeof error === "object" && error && "category" in error) {
    return String((error as { category: unknown }).category);
  }
  return "unknown";
}

function isYes(value: string | null): boolean {
  return value?.toLowerCase() === "y" || value?.toLowerCase() === "yes";
}

function usage(): string {
  return "Usage: deno run --allow-read --allow-env --allow-net cli/index.ts <export.txt> <contact-name> [--project contact-memory] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--message-cap 250]";
}

if (import.meta.main) {
  // Deliberately deferred (dynamic) import: this entrypoint is the one place
  // allowed to wire a concrete provider, but it must stay a runtime binding,
  // not a static import, so agent.ts/extractor.ts/this file's own module
  // graph carries no compile-time Anthropic dependency (see U1 boundary test).
  const providerModule = await import("../runtime/providers/anthropic.ts");
  const commitModule = await import("../commit/captureThoughtAdapter.ts");
  const runtime: AgentRuntime = new providerModule.AnthropicStructuredRuntime();
  const io: TerminalIO = {
    write: (message) =>
      Deno.stdout.writeSync(new TextEncoder().encode(message)),
    prompt: (message) => Promise.resolve(prompt(message)),
  };
  let commit: CaptureThoughtCommitter;
  try {
    commit = commitModule.createMcpCaptureThoughtCommitter();
  } catch {
    io.write("MCP commit is not configured (missing MEMORY_API_KEY).\n");
    Deno.exit(1);
  }
  const code = await runContactMemoryCli({
    args: Deno.args,
    runtime,
    commit,
    io,
  });
  Deno.exit(code);
}
