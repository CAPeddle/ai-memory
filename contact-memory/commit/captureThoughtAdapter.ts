import type { ContactShardCandidate } from "../parser/types.ts";

export interface CaptureThoughtArguments {
  content: string;
  memory_type: "shard";
  context: string;
}

export interface CaptureThoughtCommitResult {
  item_id: string;
  ok: boolean;
  result?: unknown;
  category?: "content_too_large" | "mcp_commit_failed";
}

export type CaptureThoughtCommitter = (
  args: CaptureThoughtArguments,
) => Promise<unknown>;

export interface CommitContactShardOptions {
  project: string;
  commit: CaptureThoughtCommitter;
}

export const CONTACT_PROVENANCE_DELIMITER = "---cmv1---";
const MAX_CAPTURE_CONTENT_LENGTH = 32_000;
const DEFAULT_MCP_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 30_000;

export function toCaptureThoughtArguments(
  candidate: ContactShardCandidate,
  project: string,
): CaptureThoughtArguments {
  return {
    content: renderCaptureContent(candidate),
    memory_type: "shard",
    context: renderContext(project, candidate.tags),
  };
}

export async function commitContactShardCandidates(
  candidates: ContactShardCandidate[],
  options: CommitContactShardOptions,
): Promise<CaptureThoughtCommitResult[]> {
  const results: CaptureThoughtCommitResult[] = [];

  for (const candidate of candidates) {
    const args = toCaptureThoughtArguments(candidate, options.project);
    if (args.content.length > MAX_CAPTURE_CONTENT_LENGTH) {
      results.push({
        item_id: candidate.item_id,
        ok: false,
        category: "content_too_large",
      });
      continue;
    }

    try {
      const result = await options.commit(args);
      results.push({ item_id: candidate.item_id, ok: true, result });
    } catch {
      results.push({
        item_id: candidate.item_id,
        ok: false,
        category: "mcp_commit_failed",
      });
    }
  }

  return results;
}

export function createMcpCaptureThoughtCommitter(options: {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
} = {}): CaptureThoughtCommitter {
  const baseUrl = options.baseUrl ??
    Deno.env.get("CONTACT_MCP_BASE_URL") ??
    Deno.env.get("MCP_BASE_URL") ?? DEFAULT_MCP_BASE_URL;
  const apiKey = options.apiKey ?? Deno.env.get("MEMORY_API_KEY") ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (args: CaptureThoughtArguments): Promise<unknown> => {
    if (!apiKey) throw new Error("mcp_config_missing");
    const id = crypto.randomUUID();
    const response = await fetchImpl(`${baseUrl}/mcp`, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "capture_thought", arguments: args },
      }),
    });

    if (!response.ok) throw new Error("mcp_commit_failed");
    const contentType = response.headers.get("content-type") ?? "";
    let message: unknown;
    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      const messages = text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5).trim()));
      if (!messages.length) throw new Error("mcp_commit_failed");
      message = messages.find((entry) => entry.id === id) ?? messages[0];
    } else {
      message = await response.json();
    }
    assertMcpToolSucceeded(message);
    return message;
  };
}

function assertMcpToolSucceeded(message: unknown): void {
  const parsed = message as {
    error?: unknown;
    result?: { isError?: boolean };
  };
  if (parsed?.error !== undefined || parsed?.result?.isError === true) {
    throw new Error("mcp_commit_failed");
  }
}

function renderCaptureContent(candidate: ContactShardCandidate): string {
  const firstEvidence = candidate.evidence[0];
  const metadata: Record<string, string> = {
    source: candidate.source,
    session_id: candidate.session_id,
    extraction_id: candidate.extraction_id,
    item_id: candidate.item_id,
    item_kind: candidate.item_kind,
    review_decision_id: candidate.review.decision_id,
    review_outcome: candidate.review.outcome,
    evidence_message_ids: firstEvidence?.message_ids.join(",") ?? "",
  };
  if (firstEvidence?.quote) {
    metadata.evidence_quote = firstEvidence.quote.slice(0, 500);
  }

  const provenance = Object.entries(metadata)
    .map(([key, value]) => `${key}:${encodeURIComponent(value)}`)
    .join("|");

  return `${candidate.content}\n${CONTACT_PROVENANCE_DELIMITER}\n${provenance}`;
}

function renderContext(project: string, tags: readonly string[]): string {
  const trimmedProject = project.trim() || "contact-memory";
  return `project:${trimmedProject},tags:${tags.join(";")}`;
}
