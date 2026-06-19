import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sql } from "../src/db.ts";

const TEST_THOUGHT_ID = crypto.randomUUID();
const TEST_CONTENT = `Entity worker observability test ${Date.now()} for structured logging and run tracking.`;

Deno.test({
  name: "entity worker observability — creates worker_runs record and emits lifecycle events",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await sql`
        INSERT INTO thoughts (id, content, memory_type)
        VALUES (${TEST_THOUGHT_ID}, ${TEST_CONTENT}, 'shard')
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO entity_extraction_queue (thought_id)
        VALUES (${TEST_THOUGHT_ID})
        ON CONFLICT (thought_id) DO NOTHING
      `;

      const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");
      __entityWorkerTestHooks.resetWorkerState();
      await __entityWorkerTestHooks.processQueue();

      const [run] = await sql`
        SELECT run_id, worker, items_processed, errors, error_summary
        FROM worker_runs
        WHERE worker = 'entity'
        ORDER BY started_at DESC
        LIMIT 1
      `;
      assertExists(run, "worker_runs row should exist for entity worker");
      assertEquals(run.worker, "entity");
      assertEquals(run.items_processed, 1);

      const logText = logs.join("\n");
      const hasRunStarted = logText.includes('"event":"run_started"');
      const hasRunCompleted = logText.includes('"event":"run_completed"');
      assertEquals(hasRunStarted, true, "should log run_started event");
      assertEquals(hasRunCompleted, true, "should log run_completed event");
    } finally {
      console.log = originalLog;
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${TEST_THOUGHT_ID}`;
      await sql`DELETE FROM entity_mentions WHERE thought_id = ${TEST_THOUGHT_ID}`;
      await sql`DELETE FROM thoughts WHERE id = ${TEST_THOUGHT_ID}`;
    }
  },
});

Deno.test({
  name: "entity worker observability — records errors when item processing fails",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const thoughtId = crypto.randomUUID();
    const failingContent = `__TEST_LLM_FAIL__ Entity worker error test ${Date.now()} — triggers deterministic LLM error.`;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await sql`
        INSERT INTO thoughts (id, content, memory_type)
        VALUES (${thoughtId}, ${failingContent}, 'shard')
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO entity_extraction_queue (thought_id)
        VALUES (${thoughtId})
        ON CONFLICT (thought_id) DO NOTHING
      `;

      const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");
      __entityWorkerTestHooks.resetWorkerState();
      await __entityWorkerTestHooks.processQueue();

      const [run] = await sql`
        SELECT worker, items_processed, errors, error_summary
        FROM worker_runs
        WHERE worker = 'entity'
        ORDER BY started_at DESC
        LIMIT 1
      `;
      assertExists(run, "worker_runs row should exist");
      assertEquals(run.worker, "entity");
      assertEquals(run.items_processed, 0, "no items should succeed when LLM fails");
      assertEquals(run.errors, 1, "exactly one error should be recorded");
      assertExists(run.error_summary, "error_summary should be set");
      assertEquals(
        (run.error_summary as Record<string, unknown>)?.error as string,
        "LLM failure simulated by __TEST_LLM_FAIL__ content prefix",
      );

      const logText = logs.join("\n");
      const hasItemProcessed = logText.includes('"event":"item_processed"');
      const hasRunCompleted = logText.includes('"event":"run_completed"');
      assertEquals(hasItemProcessed, false, "no item_processed when item errored");
      assertEquals(hasRunCompleted, true, "should log run_completed event");
    } finally {
      console.log = originalLog;
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}`;
      await sql`DELETE FROM entity_mentions WHERE thought_id = ${thoughtId}`;
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}`;
    }
  },
});

Deno.test({
  name: "entity worker observability — retention DELETE cleans stale rows",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const staleId = crypto.randomUUID();
    await sql`
      INSERT INTO worker_runs (run_id, worker, started_at, ended_at)
      VALUES (${staleId}, 'entity', now() - interval '31 days', now() - interval '30 days')
    `;

    const happyThoughtId = crypto.randomUUID();
    try {
      await sql`
        INSERT INTO thoughts (id, content, memory_type)
        VALUES (${happyThoughtId}, ${TEST_CONTENT}, 'shard')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO entity_extraction_queue (thought_id)
        VALUES (${happyThoughtId})
        ON CONFLICT (thought_id) DO NOTHING
      `;

      const { __entityWorkerTestHooks } = await import("../src/entityWorker.ts");
      __entityWorkerTestHooks.resetWorkerState();
      await __entityWorkerTestHooks.processQueue();

      const [staleRow] = await sql<{ run_id: string }[]>`
        SELECT run_id FROM worker_runs WHERE run_id = ${staleId}
      `;
      assertEquals(staleRow, undefined, "stale row should have been deleted by retention");
    } finally {
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${happyThoughtId}`;
      await sql`DELETE FROM entity_mentions WHERE thought_id = ${happyThoughtId}`;
      await sql`DELETE FROM thoughts WHERE id = ${happyThoughtId}`;
    }
  },
});
