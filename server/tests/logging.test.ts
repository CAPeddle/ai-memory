import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { logToolInvocation, withTiming, type ToolLogEntry } from "../src/logging.ts";

Deno.test("logToolInvocation: emits valid JSON with expected fields", () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    logToolInvocation({
      ts: "2026-06-19T12:00:00.000Z",
      tool: "search_thoughts",
      duration_ms: 42,
      status: "ok",
    });

    assertEquals(lines.length, 1);
    assertMatch(lines[0], /^\[tool\] /);
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.tool, "search_thoughts");
    assertEquals(parsed.duration_ms, 42);
    assertEquals(parsed.status, "ok");
    assertEquals(parsed.ts, "2026-06-19T12:00:00.000Z");
  } finally {
    console.log = origLog;
  }
});

Deno.test("logToolInvocation: includes error field when present", () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    logToolInvocation({
      ts: "2026-06-19T12:00:00.000Z",
      tool: "search",
      duration_ms: 99,
      status: "error",
      error: "Something went wrong",
    });

    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, "Something went wrong");
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: logs success and returns handler result", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("test_tool", async (args: { x: number }) => {
      return { result: args.x * 2 };
    });

    const result = await handler({ x: 21 });
    assertEquals(result, { result: 42 });

    assertEquals(lines.length, 1);
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.tool, "test_tool");
    assertEquals(parsed.status, "ok");
    assertEquals(parsed.error, undefined);
    assertEquals(typeof parsed.duration_ms, "number");
    assertEquals(typeof parsed.ts, "string");
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: isError with empty content array logs status error with no error text", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("empty_err", async () => {
      return { content: [] as Array<{ text: string }>, isError: true };
    });

    await handler({});
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, undefined);
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: isError with content missing text property logs status error with no error text", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("no_text", async () => {
      return { content: [{ type: "resource" }], isError: true };
    });

    await handler({});
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, undefined);
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: logs error when handler returns isError response", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("mcp_tool", async (_args: Record<string, never>) => {
      return { content: [{ type: "text", text: "Error: Not found" }], isError: true };
    });

    const result = await handler({});
    assertEquals(result.isError, true);

    assertEquals(lines.length, 1);
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.tool, "mcp_tool");
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, "Error: Not found");
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: logs error with String(err) for non-Error thrown values", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("str_err", async (_args: Record<string, never>) => {
      throw "string error message";
    });

    try { await handler({}); } catch { /* expected */ }

    assertEquals(lines.length, 1);
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, "string error message");
  } finally {
    console.log = origLog;
  }
});

Deno.test("withTiming: logs error when handler throws", async () => {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };

  try {
    const handler = withTiming("failing_tool", async (_args: Record<string, never>) => {
      throw new Error("boom");
    });

    await assertRejects(
      () => handler({}),
      "boom",
    );

    assertEquals(lines.length, 1);
    const parsed = JSON.parse(lines[0].slice("[tool] ".length));
    assertEquals(parsed.tool, "failing_tool");
    assertEquals(parsed.status, "error");
    assertEquals(parsed.error, "boom");
  } finally {
    console.log = origLog;
  }
});

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    assertEquals((err as Error).message, expectedMessage);
    return;
  }
  throw new Error("Expected function to reject but it resolved");
}
