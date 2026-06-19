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
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await sql`
        INSERT INTO thoughts (id, content, memory_type)
        VALUES (${thoughtId}, ${TEST_CONTENT}, 'shard')
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
      assertEquals(run.items_processed, 1);

      // In the test environment OPENROUTER_API_KEY may be absent, causing
      // callLLM to throw and increment errorCount. If it is present the
      // LLM may succeed — we just verify the field is wired correctly.
      assertEquals(typeof run.errors, "number");
      if (run.errors > 0) {
        assertEquals(typeof run.error_summary, "object");
        assertEquals((run.error_summary as Record<string, unknown>)?.error !== undefined, true);
      }

      const logText = logs.join("\n");
      const hasItemProcessed = logText.includes('"event":"item_processed"');
      const hasRunCompleted = logText.includes('"event":"run_completed"');
      if (run.errors > 0) {
        assertEquals(hasItemProcessed, false, "no item_processed when item errored");
      }
      assertEquals(hasRunCompleted, true, "should log run_completed event");
    } finally {
      console.log = originalLog;
      await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${thoughtId}`;
      await sql`DELETE FROM entity_mentions WHERE thought_id = ${thoughtId}`;
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}`;
    }
  },
});
