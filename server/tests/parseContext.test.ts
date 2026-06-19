import { parseContext, isContextError } from "../src/parseContext.ts";
import type { ContextScope } from "../src/parseContext.ts";

function asScope(result: ReturnType<typeof parseContext>): ContextScope | null {
  if (isContextError(result)) throw new Error(`Unexpected error: ${result.message}`);
  return result;
}

Deno.test("parseContext: strict:true sets scope.strict = true", () => {
  const s = asScope(parseContext("project:zoom,strict:true"));
  if (s?.strict !== true) throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: strict:false sets scope.strict = false", () => {
  const s = asScope(parseContext("project:zoom,strict:false"));
  if (s?.strict !== false) throw new Error(`Expected strict=false, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: omitted strict leaves scope.strict undefined", () => {
  const s = asScope(parseContext("project:zoom"));
  if (s?.strict !== undefined) throw new Error(`Expected strict=undefined, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: null input returns null (regression check)", () => {
  if (parseContext(undefined) !== null) throw new Error("undefined → null broken");
  if (parseContext("") !== null) throw new Error("empty → null broken");
});

Deno.test("parseContext: bare 'strict' keyword sets scope.strict = true", () => {
  const s = asScope(parseContext("project:zoom,strict"));
  if (s?.strict !== true) throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: rejects unknown keys", () => {
  const result = parseContext("garbage:value");
  if (!isContextError(result)) throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  if (!result.message.includes("Unknown key")) throw new Error(`Expected 'Unknown key' in message, got: ${result.message}`);
  if (result.failedToken !== "garbage:value") throw new Error(`Expected failedToken='garbage:value', got: ${result.failedToken}`);
});

Deno.test("parseContext: rejects bare tokens that are not 'strict'", () => {
  const result = parseContext("randomstring");
  if (!isContextError(result)) throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  if (!result.message.includes("expected key:value format")) throw new Error(`Expected 'key:value format' in message, got: ${result.message}`);
  if (result.failedToken !== "randomstring") throw new Error(`Expected failedToken='randomstring', got: ${result.failedToken}`);
});

Deno.test("parseContext: rejects empty values", () => {
  const result = parseContext("project:");
  if (!isContextError(result)) throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  if (!result.message.includes("empty value")) throw new Error(`Expected 'empty value' in message, got: ${result.message}`);
});

Deno.test("parseContext: rejects invalid profile values", () => {
  const result = parseContext("profile:invalid");
  if (!isContextError(result)) throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  if (!result.message.includes("Invalid profile")) throw new Error(`Expected 'Invalid profile' in message, got: ${result.message}`);
  if (!result.message.includes("professional") || !result.message.includes("personal")) {
    throw new Error(`Expected valid options mentioned, got: ${result.message}`);
  }
});

Deno.test("parseContext: rejects invalid visibility values", () => {
  const result = parseContext("visibility:everywhere");
  if (!isContextError(result)) throw new Error(`Expected error, got ${JSON.stringify(result)}`);
  if (!result.message.includes("Invalid visibility")) throw new Error(`Expected 'Invalid visibility' in message, got: ${result.message}`);
});

Deno.test("parseContext: accepts valid profile professional", () => {
  const s = asScope(parseContext("profile:professional"));
  if (s?.profile !== "professional") throw new Error(`Expected profile=professional, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: accepts valid profile personal", () => {
  const s = asScope(parseContext("profile:personal"));
  if (s?.profile !== "personal") throw new Error(`Expected profile=personal, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: accepts valid visibility values", () => {
  for (const v of ["prefer", "exclusive", "cross-only"]) {
    const s = asScope(parseContext(`visibility:${v}`));
    if (s?.visibility !== v) throw new Error(`Expected visibility=${v}, got ${JSON.stringify(s)}`);
  }
});

Deno.test("parseContext: valid context passes without error", () => {
  const s = asScope(parseContext("project:zoom,profile:professional"));
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom]`);
  if (s?.profile !== "professional") throw new Error(`Expected profile=professional`);
});

Deno.test("parseContext: isContextError returns false for null", () => {
  if (isContextError(null)) throw new Error("null should not be a context error");
});

Deno.test("parseContext: isContextError returns false for valid scope", () => {
  const s = parseContext("project:zoom");
  if (isContextError(s)) throw new Error("valid scope should not be a context error");
});

Deno.test("parseContext: error result includes received and expected fields", () => {
  const result = parseContext("garbage!!!");
  if (!isContextError(result)) throw new Error("Expected error");
  if (result.received !== "garbage!!!") throw new Error(`Expected received='garbage!!!', got: ${result.received}`);
  if (!result.expected) throw new Error("Expected 'expected' field to be populated");
});

Deno.test("parseContext: rejects non-canonical strict values (strict:yes, strict:1, strict:TRUE)", () => {
  for (const val of ["strict:yes", "strict:1", "strict:TRUE", "strict:True"]) {
    const result = parseContext(val);
    if (!isContextError(result)) throw new Error(`Expected error for "${val}", got ${JSON.stringify(result)}`);
    if (!result.message.includes("Invalid strict value")) throw new Error(`Expected 'Invalid strict value' for "${val}", got: ${result.message}`);
  }
});