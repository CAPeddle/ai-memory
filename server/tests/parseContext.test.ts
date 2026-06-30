import { isContextError, parseContext } from "../src/parseContext.ts";
import type { ContextScope } from "../src/parseContext.ts";
import { isTagValidationError, parseTagList } from "../../shared/tagGrammar.ts";

function asScope(result: ReturnType<typeof parseContext>): ContextScope | null {
  if (isContextError(result)) {
    throw new Error(`Unexpected error: ${result.message}`);
  }
  return result;
}

Deno.test("parseContext: strict:true sets scope.strict = true", () => {
  const s = asScope(parseContext("project:zoom,strict:true"));
  if (s?.strict !== true) {
    throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  }
  if (s?.projects?.[0] !== "zoom") {
    throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
  }
});

Deno.test("parseContext: strict:false sets scope.strict = false", () => {
  const s = asScope(parseContext("project:zoom,strict:false"));
  if (s?.strict !== false) {
    throw new Error(`Expected strict=false, got ${JSON.stringify(s)}`);
  }
});

Deno.test("parseContext: omitted strict leaves scope.strict undefined", () => {
  const s = asScope(parseContext("project:zoom"));
  if (s?.strict !== undefined) {
    throw new Error(`Expected strict=undefined, got ${JSON.stringify(s)}`);
  }
});

Deno.test("parseContext: null input returns null (regression check)", () => {
  if (parseContext(undefined) !== null) {
    throw new Error("undefined → null broken");
  }
  if (parseContext("") !== null) throw new Error("empty → null broken");
});

Deno.test("parseContext: bare 'strict' keyword sets scope.strict = true", () => {
  const s = asScope(parseContext("project:zoom,strict"));
  if (s?.strict !== true) {
    throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  }
  if (s?.projects?.[0] !== "zoom") {
    throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
  }
});

Deno.test("parseContext: rejects unknown keys", () => {
  const result = parseContext("garbage:value");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("Unknown key")) {
    throw new Error(
      `Expected 'Unknown key' in message, got: ${result.message}`,
    );
  }
  if (result.failedToken !== "garbage:value") {
    throw new Error(
      `Expected failedToken='garbage:value', got: ${result.failedToken}`,
    );
  }
});

Deno.test("parseContext: rejects bare tokens that are not 'strict'", () => {
  const result = parseContext("randomstring");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("expected key:value format")) {
    throw new Error(
      `Expected 'key:value format' in message, got: ${result.message}`,
    );
  }
  if (result.failedToken !== "randomstring") {
    throw new Error(
      `Expected failedToken='randomstring', got: ${result.failedToken}`,
    );
  }
});

Deno.test("parseContext: rejects empty values", () => {
  const result = parseContext("project:");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("empty value")) {
    throw new Error(
      `Expected 'empty value' in message, got: ${result.message}`,
    );
  }
});

Deno.test("parseContext: rejects profile key", () => {
  const result = parseContext("profile:professional");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("Unknown key")) {
    throw new Error(
      `Expected 'Unknown key' in message, got: ${result.message}`,
    );
  }
});

Deno.test("parseContext: rejects invalid visibility values", () => {
  const result = parseContext("visibility:everywhere");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("Invalid visibility")) {
    throw new Error(
      `Expected 'Invalid visibility' in message, got: ${result.message}`,
    );
  }
});

Deno.test("parseContext: accepts valid tags and de-duplicates repeated tags", () => {
  const s = asScope(parseContext("tags:developer;contact;developer"));
  if (JSON.stringify(s?.tags) !== JSON.stringify(["developer", "contact"])) {
    throw new Error(`Expected de-duplicated tags, got ${JSON.stringify(s)}`);
  }
});

Deno.test("tagGrammar: validates shared Contact tags and de-duplicates repeated tags", () => {
  const result = parseTagList(
    "contact;contact:sarah;commitment;sentiment;contact",
  );
  if (isTagValidationError(result)) {
    throw new Error(`Expected valid tags, got ${result.message}`);
  }
  if (
    JSON.stringify(result) !==
      JSON.stringify(["contact", "contact:sarah", "commitment", "sentiment"])
  ) {
    throw new Error(
      `Expected de-duplicated shared tags, got ${JSON.stringify(result)}`,
    );
  }
});

Deno.test("parseContext: accepts valid visibility values", () => {
  for (const v of ["prefer", "exclusive", "cross-only"]) {
    const s = asScope(parseContext(`visibility:${v}`));
    if (s?.visibility !== v) {
      throw new Error(`Expected visibility=${v}, got ${JSON.stringify(s)}`);
    }
  }
});

Deno.test("parseContext: valid context passes without error", () => {
  const s = asScope(parseContext("project:zoom,tags:developer;contact"));
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom]`);
  if (JSON.stringify(s?.tags) !== JSON.stringify(["developer", "contact"])) {
    throw new Error(`Expected tags=[developer,contact]`);
  }
});

Deno.test("parseContext: rejects empty tag segments", () => {
  const result = parseContext("tags:developer;;contact");
  if (!isContextError(result)) {
    throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  }
  if (!result.message.includes("empty tag segments")) {
    throw new Error(`Expected empty segment error, got: ${result.message}`);
  }
});

Deno.test("parseContext: rejects tags outside bounded grammar", () => {
  for (
    const value of [
      "tags:Developer",
      "tags:contact name",
      "tags::contact",
      "tags:project:",
      "tags:project:zoom:extra",
    ]
  ) {
    const result = parseContext(value);
    if (!isContextError(result)) {
      throw new Error(
        `Expected error for ${value}, got ${JSON.stringify(result)}`,
      );
    }
    if (!result.message.includes("Invalid tag")) {
      throw new Error(
        `Expected invalid tag error for ${value}, got: ${result.message}`,
      );
    }
  }
});

Deno.test("tagGrammar: rejects invalid tags consistently with parseContext", () => {
  for (
    const value of [
      "Developer",
      "contact name",
      " contact",
      "project:zoom:extra",
      "a".repeat(65),
    ]
  ) {
    const result = parseTagList(value);
    if (!isTagValidationError(result)) {
      throw new Error(
        `Expected shared tag error for ${value}, got ${JSON.stringify(result)}`,
      );
    }
  }
});

Deno.test("tagGrammar: rejects more than sixteen tags consistently with parseContext", () => {
  const rawTags = Array.from({ length: 17 }, (_, index) => `tag-${index}`)
    .join(";");
  const sharedResult = parseTagList(rawTags);
  if (!isTagValidationError(sharedResult)) {
    throw new Error("Expected shared tag count error");
  }
  const contextResult = parseContext(`tags:${rawTags}`);
  if (!isContextError(contextResult)) {
    throw new Error("Expected parseContext tag count error");
  }
});

Deno.test("parseContext: isContextError returns false for null", () => {
  if (isContextError(null)) {
    throw new Error("null should not be a context error");
  }
});

Deno.test("parseContext: isContextError returns false for valid scope", () => {
  const s = parseContext("project:zoom");
  if (isContextError(s)) {
    throw new Error("valid scope should not be a context error");
  }
});

Deno.test("parseContext: error result includes received and expected fields", () => {
  const result = parseContext("garbage!!!");
  if (!isContextError(result)) throw new Error("Expected error");
  if (result.received !== "garbage!!!") {
    throw new Error(`Expected received='garbage!!!', got: ${result.received}`);
  }
  if (!result.expected) {
    throw new Error("Expected 'expected' field to be populated");
  }
});

Deno.test("parseContext: rejects non-canonical strict values (strict:yes, strict:1, strict:TRUE)", () => {
  for (const val of ["strict:yes", "strict:1", "strict:TRUE", "strict:True"]) {
    const result = parseContext(val);
    if (!isContextError(result)) {
      throw new Error(
        `Expected error for "${val}", got ${JSON.stringify(result)}`,
      );
    }
    if (!result.message.includes("Invalid strict value")) {
      throw new Error(
        `Expected 'Invalid strict value' for "${val}", got: ${result.message}`,
      );
    }
  }
});

Deno.test("parseContext: story key sets sourceStoryId", () => {
  const s = asScope(parseContext("story:ST-043"));
  if (s?.sourceStoryId !== "ST-043") {
    throw new Error(
      `Expected sourceStoryId="ST-043", got ${JSON.stringify(s)}`,
    );
  }
});

Deno.test("parseContext: entity key with semicolons sets entities array", () => {
  const s = asScope(parseContext("entity:Alice;Bob"));
  if (s?.entities?.length !== 2) {
    throw new Error(`Expected 2 entities, got ${JSON.stringify(s?.entities)}`);
  }
  if (s?.entities?.[0] !== "Alice") {
    throw new Error(`Expected entities[0]="Alice"`);
  }
  if (s?.entities?.[1] !== "Bob") throw new Error(`Expected entities[1]="Bob"`);
});

Deno.test("parseContext: project key with semicolons sets projects array", () => {
  const s = asScope(parseContext("project:zoom;bcf-managers"));
  if (s?.projects?.length !== 2) {
    throw new Error(`Expected 2 projects, got ${JSON.stringify(s?.projects)}`);
  }
  if (s?.projects?.[0] !== "zoom") {
    throw new Error(`Expected projects[0]="zoom"`);
  }
  if (s?.projects?.[1] !== "bcf-managers") {
    throw new Error(`Expected projects[1]="bcf-managers"`);
  }
});

Deno.test("parseContext: whitespace around tokens is trimmed", () => {
  const s = asScope(parseContext(" project : zoom "));
  if (s?.projects?.[0] !== "zoom") {
    throw new Error(
      `Expected projects=["zoom"], got ${JSON.stringify(s?.projects)}`,
    );
  }
});

Deno.test("parseContext: empty segments between commas are skipped", () => {
  const s = asScope(parseContext(",,project:zoom,,"));
  if (s?.projects?.[0] !== "zoom") {
    throw new Error(
      `Expected projects=["zoom"], got ${JSON.stringify(s?.projects)}`,
    );
  }
});

Deno.test("parseContext: duplicate keys use last-write-wins", () => {
  const s = asScope(parseContext("project:a,project:b"));
  if (s?.projects?.[0] !== "b") {
    throw new Error(
      `Expected last-write-wins projects=["b"], got ${
        JSON.stringify(s?.projects)
      }`,
    );
  }
});
