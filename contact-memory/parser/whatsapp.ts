import {
  type ChatKind,
  validateWhatsAppChat,
  type ValidationResult,
  type WhatsAppChat,
  type WhatsAppMessage,
} from "./types.ts";

export const WHATSAPP_SYSTEM_SENDER = "__whatsapp_system__";

export type WhatsAppParseErrorCategory =
  | "invalid_raw_text"
  | "missing_session_id"
  | "no_timestamp_boundaries"
  | "leading_unparseable_line"
  | "unsupported_timestamp_format"
  | "invalid_timestamp"
  | "missing_sender"
  | "reserved_sender_collision";

export interface ParseWhatsAppChatOptions {
  session_id: string;
}

interface ParsedBoundary {
  timestamp: string;
  text: string;
}

const OBSERVED_BOUNDARY =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{2}):(\d{2}) - (.*)$/;
const BRACKETED_BOUNDARY = /^\[\d{1,2}\/\d{1,2}\/\d{4}, .+\]/;
const SECONDS_BOUNDARY = /^\d{1,2}\/\d{1,2}\/\d{4}, \d{2}:\d{2}:\d{2} - /;
const AM_PM_BOUNDARY =
  /^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}\s?(?:AM|PM) - /i;
const MIN_WHATSAPP_YEAR = 2009;

export function parseWhatsAppChat(
  rawText: string,
  options: ParseWhatsAppChatOptions,
): ValidationResult<WhatsAppChat> {
  if (typeof rawText !== "string") return fail("invalid_raw_text");
  if (!options || !isNonEmptyString(options.session_id)) {
    return fail("missing_session_id", "session_id");
  }

  const normalized = normalizeInput(rawText);
  if (normalized.trim().length === 0) {
    return validateWhatsAppChat({
      session_id: options.session_id,
      kind: "unknown",
      messages: [],
      participants: [],
    });
  }

  const lines = stripTerminalLineEnding(normalized).split("\n");
  const hasSupportedBoundary = lines.some((line) => parseBoundary(line).ok);
  const messages: WhatsAppMessage[] = [];
  const participants = new Set<string>();
  let current: WhatsAppMessage | undefined;
  let seenBoundary = false;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const boundary = parseBoundary(line);

    if (boundary.ok) {
      seenBoundary = true;
      const started = startMessage(
        boundary.value,
        participants,
        lineNumber,
      );
      if (!started.ok) return started;
      messages.push(started.value);
      current = started.value;
      continue;
    }

    if (boundary.category === "unsupported_timestamp_format" && !current) {
      return fail(boundary.category, `line.${lineNumber}`);
    }

    if (
      boundary.category !== "not_boundary" &&
      boundary.category !== "unsupported_timestamp_format"
    ) {
      return fail(boundary.category, `line.${lineNumber}`);
    }

    if (!current) {
      if (!hasSupportedBoundary) return fail("no_timestamp_boundaries");
      return fail("leading_unparseable_line", `line.${lineNumber}`);
    }

    current.body += `\n${line}`;
  }

  if (!seenBoundary) return fail("no_timestamp_boundaries");
  assignMessageIds(messages, options.session_id);

  const chat: WhatsAppChat = {
    session_id: options.session_id,
    kind: inferKind(participants.size),
    messages,
    participants: [...participants],
    date_range: buildDateRange(messages),
  };

  return validateWhatsAppChat(chat);
}

function startMessage(
  boundary: ParsedBoundary,
  participants: Set<string>,
  lineNumber: number,
): ValidationResult<WhatsAppMessage> {
  if (isKnownColonSystemMessage(boundary.text)) {
    const sender = WHATSAPP_SYSTEM_SENDER;
    const body = boundary.text;
    return {
      ok: true,
      value: {
        message_id: "pending",
        timestamp: boundary.timestamp,
        sender,
        body,
      },
    };
  }

  const separator = boundary.text.indexOf(":");

  if (separator === -1) {
    const sender = WHATSAPP_SYSTEM_SENDER;
    const body = boundary.text;
    return {
      ok: true,
      value: {
        message_id: "pending",
        timestamp: boundary.timestamp,
        sender,
        body,
      },
    };
  }

  const sender = boundary.text.slice(0, separator).trim();
  if (!isNonEmptyString(sender)) {
    return fail("missing_sender", `line.${lineNumber}`);
  }
  if (sender === WHATSAPP_SYSTEM_SENDER) {
    return fail("reserved_sender_collision", `line.${lineNumber}`);
  }
  const body = stripOptionalSpace(boundary.text.slice(separator + 1));

  participants.add(sender);
  return {
    ok: true,
    value: {
      message_id: "pending",
      timestamp: boundary.timestamp,
      sender,
      body,
    },
  };
}

function parseBoundary(line: string):
  | { ok: true; value: ParsedBoundary }
  | { ok: false; category: BoundaryCategory } {
  if (
    BRACKETED_BOUNDARY.test(line) || SECONDS_BOUNDARY.test(line) ||
    AM_PM_BOUNDARY.test(line)
  ) {
    return { ok: false, category: "unsupported_timestamp_format" };
  }

  const match = OBSERVED_BOUNDARY.exec(line);
  if (!match) {
    return { ok: false, category: "not_boundary" };
  }

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, text] = match;
  const timestamp = toTimestamp(
    Number(dayRaw),
    Number(monthRaw),
    Number(yearRaw),
    Number(hourRaw),
    Number(minuteRaw),
  );
  if (!timestamp) return { ok: false, category: "invalid_timestamp" };

  return { ok: true, value: { timestamp, text } };
}

function toTimestamp(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
): string | undefined {
  if (
    !Number.isInteger(day) || !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return undefined;
  }
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  if (year < MIN_WHATSAPP_YEAR || month < 1 || month > 12 || day < 1) {
    return undefined;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return undefined;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return date.toISOString().replace(".000Z", "Z");
}

function buildDateRange(
  messages: WhatsAppMessage[],
): WhatsAppChat["date_range"] {
  if (messages.length === 0) return undefined;
  let start = messages[0].timestamp;
  let end = messages[0].timestamp;
  for (const message of messages.slice(1)) {
    if (message.timestamp < start) start = message.timestamp;
    if (message.timestamp > end) end = message.timestamp;
  }
  return { start, end };
}

function inferKind(participantCount: number): ChatKind {
  if (participantCount === 2) return "one_to_one";
  if (participantCount > 2) return "group";
  return "unknown";
}

function normalizeInput(rawText: string): string {
  return rawText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function stripTerminalLineEnding(rawText: string): string {
  return rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
}

function stripOptionalSpace(value: string): string {
  return value.startsWith(" ") ? value.slice(1) : value;
}

function isKnownColonSystemMessage(text: string): boolean {
  return text.startsWith("Messages and calls are end-to-end encrypted") ||
    text.startsWith("Your security code with ");
}

function assignMessageIds(messages: WhatsAppMessage[], sessionId: string) {
  const duplicateCounts = new Map<string, number>();
  for (const message of messages) {
    message.message_id = makeMessageId(
      sessionId,
      message.timestamp,
      message.sender,
      message.body,
      duplicateCounts,
    );
  }
}

function makeMessageId(
  sessionId: string,
  timestamp: string,
  sender: string,
  body: string,
  duplicateCounts: Map<string, number>,
): string {
  const duplicateKey = `${timestamp}\u0000${sender}\u0000${body}`;
  const occurrence = duplicateCounts.get(duplicateKey) ?? 0;
  duplicateCounts.set(duplicateKey, occurrence + 1);
  return `wa_${
    hash128(`${sessionId}\u0000${duplicateKey}\u0000${occurrence}`)
  }`;
}

function hash128(value: string): string {
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => fnv1a32(value, seed))
    .join("");
}

function fnv1a32(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type BoundaryCategory =
  | "not_boundary"
  | Extract<
    WhatsAppParseErrorCategory,
    "unsupported_timestamp_format" | "invalid_timestamp"
  >;

function fail(
  message: WhatsAppParseErrorCategory,
  path?: string,
): ValidationResult<never> {
  return { ok: false, error: true, message, path };
}
