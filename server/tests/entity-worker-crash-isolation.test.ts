import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { mcpCall, sleep } from "./_helpers/mcpClient.ts";

Deno.test("entity worker survives processing activity without crashing server", async () => {
  const capture = await mcpCall("capture_thought", {
    content: `Crash isolation test ${Date.now()} — this thought exercises worker loop resilience`,
    memory_type: "shard",
  }) as { error?: unknown; result?: unknown };

  assertEquals(capture.error, undefined, "capture_thought should succeed");

  // Give the worker one poll window to process queue work.
  await sleep(12_000);

  const stats = await mcpCall("thought_stats", {}) as { error?: unknown; result?: unknown };
  assertEquals(stats.error, undefined, "server should still respond after worker activity");
  assertNotEquals(stats.result, undefined, "thought_stats should return a result envelope");
});

Deno.test("server health endpoint responds during worker activity", async () => {
  const mcpBase = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
  const healthUrl = mcpBase.replace(/\/mcp$/, "").replace(/\/$/, "") + "/health";

  const response = await fetch(healthUrl);
  assertEquals(response.status, 200);
  assertEquals(await response.text(), "ok");
});

Deno.test("safePoll contains thrown poll cycle and recovers on next cycle", async () => {
  const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");

  __entityWorkerTestHooks.resetWorkerState();

  let calls = 0;
  const errors: string[] = [];
  const runQueue = async () => {
    calls++;
    if (calls === 1) {
      throw new Error("synthetic queue claim failure");
    }
  };

  // First cycle fails but must stay contained and increment failure counter.
  await __entityWorkerTestHooks.safePoll({
    runQueue,
    onError: (msg: string) => errors.push(msg),
    schedule: () => {
      // no-op in tests to prevent recursive scheduling
    },
  });

  assertEquals(__entityWorkerTestHooks.getConsecutiveFailures(), 1);

  // Second cycle succeeds and resets failure counter.
  await __entityWorkerTestHooks.safePoll({
    runQueue,
    onError: (msg: string) => errors.push(msg),
    schedule: () => {
      // no-op in tests to prevent recursive scheduling
    },
  });

  assertEquals(calls, 2);
  assertEquals(__entityWorkerTestHooks.getConsecutiveFailures(), 0);
  assertNotEquals(errors.length, 0);
  assertMatch(errors[0], /poll failed|ALERT/i);
});
