import { validateWhatsAppChat } from "../../parser/types.ts";
import { parseWhatsAppChat } from "../../parser/whatsapp.ts";

const SESSION_ID = "test-session";
const SYSTEM_SENDER = "__whatsapp_system__";

function expectOk<T>(
  result: { ok: true; value: T } | {
    ok: false;
    message: string;
    path?: string;
  },
): T {
  if (!result.ok) {
    throw new Error(
      result.path === undefined
        ? "Expected parser success"
        : `Expected parser success at ${result.path}`,
    );
  }
  return result.value;
}

function expectError(
  result: { ok: true; value: unknown } | {
    ok: false;
    error?: boolean;
    message: string;
    path?: string;
  },
  expectedMessagePart: string,
  expectedPath?: string,
  forbiddenParts: string[] = [],
) {
  if (result.ok) throw new Error("Expected parser error");
  if (result.error !== true) throw new Error("Expected validation error flag");
  if (result.message !== expectedMessagePart) {
    throw new Error("Expected parser error category was not present");
  }
  if (expectedPath !== undefined && result.path !== expectedPath) {
    throw new Error("Expected parser error path");
  }
  const resultStrings = collectStrings(result);
  for (const forbidden of forbiddenParts) {
    if (resultStrings.some((value) => value.includes(forbidden))) {
      throw new Error("Expected privacy-safe parser error");
    }
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function parse(rawText: string) {
  return parseWhatsAppChat(rawText, { session_id: SESSION_ID });
}

function assertCanonicalTimestamp(timestamp: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/.test(timestamp)) {
    throw new Error("Expected canonical UTC timestamp");
  }
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Expected parseable timestamp");
  }
}

function assertParticipants(actual: string[] | undefined, expected: string[]) {
  if ((actual?.length ?? 0) !== expected.length) {
    throw new Error("Expected participant count");
  }
  const actualSet = new Set(actual);
  for (const participant of expected) {
    if (!actualSet.has(participant)) throw new Error("Expected participant");
  }
}

Deno.test("parseWhatsAppChat parses observed-format messages into the existing chat contract", () => {
  const chat = expectOk(parse([
    "29/07/2015, 23:37 - Person_1: hey",
    "29/07/2015, 23:38 - Person_2: reply with colon: still body",
  ].join("\n")));

  if (chat.session_id !== SESSION_ID) {
    throw new Error("Expected caller session id");
  }
  if (chat.kind !== "one_to_one") throw new Error("Expected one-to-one chat");
  if (chat.messages.length !== 2) throw new Error("Expected two messages");
  if (chat.messages[0].sender !== "Person_1") {
    throw new Error("Expected first sender");
  }
  if (chat.messages[0].body !== "hey") throw new Error("Expected first body");
  if (chat.messages[1].body !== "reply with colon: still body") {
    throw new Error("Expected body colons to be preserved");
  }
  assertCanonicalTimestamp(chat.messages[0].timestamp);

  const validated = validateWhatsAppChat(chat);
  if (!validated.ok) throw new Error(validated.message);
});

Deno.test("parseWhatsAppChat preserves continuations, blank lines, order, and date range", () => {
  const chat = expectOk(parse([
    "02/01/2026, 10:00 - Person_1: later",
    "01/01/2026, 09:00 - Person_2: start",
    "Continuation with a dash - value",
    "Continuation with a colon: value",
    "",
    "Final continuation",
  ].join("\n")));

  if (chat.messages.length !== 2) throw new Error("Expected two messages");
  if (chat.messages[0].body !== "later") {
    throw new Error("Expected export order");
  }
  if (
    chat.messages[1].body !==
      "start\nContinuation with a dash - value\nContinuation with a colon: value\n\nFinal continuation"
  ) {
    throw new Error("Expected continuation body preservation");
  }
  if (chat.date_range?.start !== "2026-01-01T09:00:00Z") {
    throw new Error("Expected chronological date range start");
  }
  if (chat.date_range?.end !== "2026-01-02T10:00:00Z") {
    throw new Error("Expected chronological date range end");
  }
});

Deno.test("parseWhatsAppChat treats one final newline as a file terminator", () => {
  const singleTerminator = expectOk(
    parse("01/02/2026, 10:00 - Person_1: hi\n"),
  );
  if (singleTerminator.messages[0].body !== "hi") {
    throw new Error("Expected terminal newline to be ignored");
  }

  const intentionalBlank = expectOk(
    parse("01/02/2026, 10:00 - Person_1: hi\n\n"),
  );
  if (intentionalBlank.messages[0].body !== "hi\n") {
    throw new Error("Expected intentional trailing blank continuation");
  }
});

Deno.test("parseWhatsAppChat preserves empty bodies, content markers, unicode, BOM, and CRLF", () => {
  const rawText = [
    "\uFEFF1/2/2026, 10:00 - Person_1: <Media omitted>",
    "1/2/2026, 10:01 - Person_1: This message was deleted",
    "1/2/2026, 10:02 - Person_2: Edited <This message was edited>",
    "1/2/2026, 10:03 - Person_2: 👑",
    "1/2/2026, 10:04 - Person_2:",
  ].join("\r\n");
  const chat = expectOk(parse(rawText));

  if (chat.messages.length !== 5) throw new Error("Expected five messages");
  if (chat.messages[0].body !== "<Media omitted>") {
    throw new Error("Expected media placeholder preservation");
  }
  if (chat.messages[1].body !== "This message was deleted") {
    throw new Error("Expected deleted marker preservation");
  }
  if (!chat.messages[2].body.includes("<This message was edited>")) {
    throw new Error("Expected edited marker preservation");
  }
  if (chat.messages[3].body !== "👑") throw new Error("Expected unicode body");
  if (chat.messages[4].body !== "") throw new Error("Expected empty body");
});

Deno.test("parseWhatsAppChat keeps duplicate content as separate stable messages", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: <Media omitted>",
    "01/02/2026, 10:00 - Person_1: <Media omitted>",
  ].join("\n")));
  const ids = chat.messages.map((message) => message.message_id);

  if (ids.length !== new Set(ids).size) throw new Error("Expected unique IDs");
  if (ids[0] === ids[1]) throw new Error("Expected duplicate lines to differ");
  if (ids.some((id) => id.includes(SESSION_ID))) {
    throw new Error("Expected message IDs not to embed raw session ID");
  }
  if (ids.some((id) => id.length > 128)) {
    throw new Error("Expected bounded message IDs");
  }
  const reparsed = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: <Media omitted>",
    "01/02/2026, 10:00 - Person_1: <Media omitted>",
  ].join("\n")));
  if (reparsed.messages[0].message_id !== ids[0]) {
    throw new Error("Expected stable IDs across parses");
  }

  const withEarlierMessage = expectOk(parse([
    "01/02/2026, 09:59 - Person_2: earlier",
    "01/02/2026, 10:00 - Person_1: <Media omitted>",
  ].join("\n")));
  if (withEarlierMessage.messages[1].message_id !== ids[0]) {
    throw new Error("Expected content-scoped ID stability");
  }
  if (!/^wa_[0-9a-f]{32}$/.test(ids[0])) {
    throw new Error("Expected 128-bit hashed message ID");
  }
});

Deno.test("parseWhatsAppChat IDs use finalized multiline bodies", () => {
  const withDuplicatePrefix = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: same prefix",
    "first continuation",
    "01/02/2026, 10:00 - Person_1: same prefix",
    "target continuation",
  ].join("\n")));
  const targetId = withDuplicatePrefix.messages[1].message_id;

  const withoutEarlierDuplicate = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: same prefix",
    "target continuation",
  ].join("\n")));

  if (withoutEarlierDuplicate.messages[0].message_id !== targetId) {
    throw new Error("Expected multiline ID stability after body finalization");
  }
});

Deno.test("parseWhatsAppChat handles system messages and sender classification", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: hi",
    "01/02/2026, 10:01 - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. *Learn more*",
    "01/02/2026, 10:02 - Person_2: hello",
  ].join("\n")));

  if (chat.messages[1].sender !== SYSTEM_SENDER) {
    throw new Error("Expected system sender");
  }
  if (chat.participants?.includes(SYSTEM_SENDER)) {
    throw new Error("Expected system sender excluded from participants");
  }
  if (chat.kind !== "one_to_one") throw new Error("Expected one-to-one kind");
  assertParticipants(chat.participants, ["Person_1", "Person_2"]);
});

Deno.test("parseWhatsAppChat treats known colon-bearing notices as system messages", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: hi",
    "01/02/2026, 10:01 - Messages and calls are end-to-end encrypted: learn more",
    "01/02/2026, 10:02 - Person_2: hello",
  ].join("\n")));

  if (chat.messages[1].sender !== SYSTEM_SENDER) {
    throw new Error("Expected colon-bearing system notice");
  }
  assertParticipants(chat.participants, ["Person_1", "Person_2"]);
});

Deno.test("parseWhatsAppChat does not treat user bodies with system words as notices", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: I added the link",
    "01/02/2026, 10:01 - Person_2: I removed the duplicate",
  ].join("\n")));

  if (chat.messages[0].sender !== "Person_1") {
    throw new Error("Expected user sender");
  }
  if (chat.messages[0].body !== "I added the link") {
    throw new Error("Expected user body");
  }
  if (chat.messages[1].sender !== "Person_2") {
    throw new Error("Expected second user sender");
  }
  if (chat.kind !== "one_to_one") throw new Error("Expected one-to-one kind");
});

Deno.test("parseWhatsAppChat infers group and unknown chat kinds", () => {
  const group = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: one",
    "01/02/2026, 10:01 - Person_2: two",
    "01/02/2026, 10:02 - Person_3: three",
  ].join("\n")));
  if (group.kind !== "group") throw new Error("Expected group kind");

  const systemOnly = expectOk(parse(
    "01/02/2026, 10:01 - Messages and calls are end-to-end encrypted.",
  ));
  if (systemOnly.kind !== "unknown") throw new Error("Expected unknown kind");
  if ((systemOnly.participants?.length ?? 0) !== 0) {
    throw new Error("Expected no participants");
  }
});

Deno.test("parseWhatsAppChat rejects malformed input without raw content in errors", () => {
  expectError(parse("not a transcript"), "no_timestamp_boundaries");
  expectError(
    parse("31/02/2025, 10:00 - Person_1: nope"),
    "invalid_timestamp",
    "line.1",
    ["Person_1", "nope"],
  );
  expectError(
    parse("01/02/2026, 24:00 - Person_1: bad"),
    "invalid_timestamp",
    "line.1",
    ["Person_1", "bad"],
  );
  expectError(
    parse("01/02/2026, 10:60 - Person_1: bad"),
    "invalid_timestamp",
    "line.1",
    ["Person_1", "bad"],
  );
  expectError(
    parse("before\n01/02/2026, 10:00 - Person_1: hi"),
    "leading_unparseable_line",
    "line.1",
    ["before", "Person_1"],
  );
  expectError(
    parse("01/02/2026, 10:00 - __whatsapp_system__: hi"),
    "reserved_sender_collision",
    "line.1",
    ["__whatsapp_system__"],
  );
  expectError(
    parse("01/02/2026, 10:00 - : body"),
    "missing_sender",
    "line.1",
    ["body"],
  );

  const unsupported = parse("01/02/2026, 10:00:12 - Person_1: unsupported");
  expectError(unsupported, "unsupported_timestamp_format", "line.1", [
    "Person_1",
  ]);
});

Deno.test("parseWhatsAppChat rejects invalid public inputs without throwing", () => {
  expectError(
    parseWhatsAppChat("01/02/2026, 10:00 - Person_1: hi", {
      session_id: " ",
    }),
    "missing_session_id",
    "session_id",
  );
  expectError(
    parseWhatsAppChat("01/02/2026, 10:00 - Person_1: hi", undefined as never),
    "missing_session_id",
    "session_id",
  );
  expectError(
    parseWhatsAppChat(undefined as never, { session_id: SESSION_ID }),
    "invalid_raw_text",
  );
});

Deno.test("parseWhatsAppChat rejects unsupported timestamp families explicitly", () => {
  expectError(
    parse("[01/02/2026, 10:00:12] Person_1: bracketed"),
    "unsupported_timestamp_format",
  );
  expectError(
    parse("02/01/2026, 10:00 AM - Person_1: ampm"),
    "unsupported_timestamp_format",
  );
  expectError(
    parse("13/31/2026, 10:00 - Person_1: ambiguous"),
    "invalid_timestamp",
  );

  const dayFirst = expectOk(parse("02/01/2026, 10:00 - Person_1: day first"));
  if (dayFirst.messages[0].timestamp !== "2026-01-02T10:00:00Z") {
    throw new Error("Expected ambiguous numeric date to use day-first format");
  }
});

Deno.test("parseWhatsAppChat preserves date-like continuation lines", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: Dates:",
    "01/02/2026, dentist appointment",
    "02/02/2026, not a boundary",
  ].join("\n")));

  if (chat.messages.length !== 1) throw new Error("Expected one message");
  if (!chat.messages[0].body.includes("01/02/2026, dentist appointment")) {
    throw new Error("Expected date-like continuation preservation");
  }
});

Deno.test("parseWhatsAppChat preserves pasted unsupported transcript lines as continuations", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - Person_1: pasted chat:",
    "[01/02/2026, 10:01:12] Person_2: hello",
    "01/02/2026, 10:00:12 - Person_2: hello",
    "01/02/2026, 10:00 AM - Person_2: hello",
  ].join("\n")));

  if (chat.messages.length !== 1) throw new Error("Expected one message");
  if (!chat.messages[0].body.includes("[01/02/2026, 10:01:12]")) {
    throw new Error("Expected pasted bracketed continuation");
  }
  if (!chat.messages[0].body.includes("01/02/2026, 10:00:12")) {
    throw new Error("Expected pasted seconds continuation");
  }
  if (!chat.messages[0].body.includes("01/02/2026, 10:00 AM")) {
    throw new Error("Expected pasted AM/PM continuation");
  }
});

Deno.test("parseWhatsAppChat preserves non-ASCII senders, URLs, and media variants", () => {
  const chat = expectOk(parse([
    "01/02/2026, 10:00 - José-Marie: https://example.invalid/watch?v=abc-123&list=safe",
    "01/02/2026, 10:01 - Person_2: location: https://example.invalid/map?q=0,0",
    "01/02/2026, 10:02 - Person_2: ‎image omitted",
    "01/02/2026, 10:03 - Person_2: image omitted",
    "01/02/2026, 10:04 - Person_2: video omitted",
  ].join("\n")));

  if (chat.messages[0].sender !== "José-Marie") {
    throw new Error("Expected non-ASCII sender preservation");
  }
  if (
    chat.messages[0].body !==
      "https://example.invalid/watch?v=abc-123&list=safe"
  ) {
    throw new Error("Expected exact URL body");
  }
  if (chat.messages[1].body !== "location: https://example.invalid/map?q=0,0") {
    throw new Error("Expected exact location body");
  }
  if (chat.messages[2].body !== "‎image omitted") {
    throw new Error("Expected directional media marker");
  }
  if (chat.messages[3].body !== "image omitted") {
    throw new Error("Expected image marker");
  }
  if (chat.messages[4].body !== "video omitted") {
    throw new Error("Expected video marker");
  }
});

Deno.test("parseWhatsAppChat returns valid empty chat for empty input", () => {
  const chat = expectOk(parse(" \n\t"));

  if (chat.session_id !== SESSION_ID) {
    throw new Error("Expected caller session id");
  }
  if (chat.kind !== "unknown") throw new Error("Expected unknown kind");
  if (chat.messages.length !== 0) throw new Error("Expected zero messages");
  if ((chat.participants?.length ?? 0) !== 0) {
    throw new Error("Expected zero participants");
  }
});

Deno.test("parseWhatsAppChat parses the sanitized fixture as contract coverage", async () => {
  const fixture = await Deno.readTextFile(
    "tests/fixtures/whatsapp/sanitized-chat.txt",
  );
  const chat = expectOk(parse(fixture));

  if (chat.kind !== "one_to_one") throw new Error("Expected fixture kind");
  assertParticipants(chat.participants, ["Person_1", "Person_2"]);
  if (chat.date_range?.start !== "2015-07-29T23:37:00Z") {
    throw new Error("Expected fixture date start");
  }
  if (chat.date_range?.end !== "2026-06-22T09:00:00Z") {
    throw new Error("Expected fixture date end");
  }
  if (chat.messages.length < 10) throw new Error("Expected fixture messages");
  for (const message of chat.messages) {
    assertCanonicalTimestamp(message.timestamp);
  }
  if (chat.messages.some((message) => !message.message_id || !message.sender)) {
    throw new Error("Expected complete fixture message fields");
  }
  if (!chat.messages.some((message) => message.body === "")) {
    throw new Error("Expected fixture empty body");
  }
  if (!chat.messages.some((message) => message.body === "<Media omitted>")) {
    throw new Error("Expected fixture media marker");
  }
  if (
    !chat.messages.some((message) =>
      message.body === "This message was deleted"
    )
  ) {
    throw new Error("Expected fixture deleted marker");
  }
  if (
    !chat.messages.some((message) =>
      message.body.includes("<This message was edited>")
    )
  ) {
    throw new Error("Expected fixture edited marker");
  }
  if (!chat.messages.some((message) => message.sender === SYSTEM_SENDER)) {
    throw new Error("Expected fixture system message");
  }
  const multiline = chat.messages.find((message) =>
    message.body.startsWith("Multi-line start")
  );
  if (!multiline?.body.includes("\n\nFinal continuation line")) {
    throw new Error("Expected fixture multiline body");
  }
  const ids = chat.messages.map((message) => message.message_id);
  if (ids.length !== new Set(ids).size) {
    throw new Error("Expected unique fixture IDs");
  }

  const validated = validateWhatsAppChat(chat);
  if (!validated.ok) throw new Error(validated.message);
});
