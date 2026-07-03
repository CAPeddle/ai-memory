import { assertEquals, assertExists, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sql } from "../src/db.ts";
import { drainPendingOnce } from "../src/consolidationWorker.ts";

async function cleanupRun(id: string) {
  await sql`DELETE FROM worker_runs WHERE run_id = ${id}`;
}

Deno.test({
  name: "drainPendingOnce inserts and completes a worker_runs row with accurate counts",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const processed = await drainPendingOnce(true, 1);

    const [row] = await sql<{
      run_id: string;
      worker: string;
      started_at: Date;
      ended_at: Date;
      items_processed: number;
      errors: number;
      error_summary: unknown;
    }[]>`
      SELECT run_id, worker, started_at, ended_at, items_processed, errors, error_summary
      FROM worker_runs
      WHERE worker = 'consolidation'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    assertNotEquals(row, undefined, "worker_runs row should exist");
    assertEquals(row.worker, "consolidation");
    assertNotEquals(row.started_at, undefined);
    assertNotEquals(row.ended_at, undefined);
    assertEquals(row.items_processed, processed);
    assertEquals(row.errors, 0);

    await cleanupRun(row.run_id);
  },
});

Deno.test({
  name: "dry-run drainPendingOnce records error_summary as dry_run marker",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await drainPendingOnce(true, 1);

    const [row] = await sql<{
      run_id: string;
      error_summary: unknown;
    }[]>`
      SELECT run_id, error_summary
      FROM worker_runs
      WHERE worker = 'consolidation'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    assertNotEquals(row, undefined, "worker_runs row should exist");
    assertEquals(row.error_summary, { dry_run: true });

    await cleanupRun(row.run_id);
  },
});

Deno.test({
  name: "consolidation worker LLM error is recorded in worker_runs",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const thoughtId = crypto.randomUUID();
    const failingContent = `__TEST_LLM_FAIL__ Consolidation error test ${Date.now()}`;

    try {
      await sql`
        INSERT INTO thoughts (id, content, memory_type, active)
        VALUES (${thoughtId}::uuid, ${failingContent}, 'shard', true)
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO recall_events (thought_id, query, rrf_score, rank, project)
        VALUES
          (${thoughtId}::uuid, 'consolidation error test', 0.5, 1, 'test'),
          (${thoughtId}::uuid, 'consolidation error test', 0.4, 2, 'test')
      `;

      // The shared db-test queue accumulates pending rows from other tests, and
      // drainPendingOnce(limit=1) claims the oldest (ORDER BY queued_at ASC). The
      // recall_events insert above also auto-enqueues this thought via trigger, so
      // upsert and backdate queued_at to guarantee THIS item is claimed first.
      await sql`
        INSERT INTO consolidation_queue (thought_id, status, queued_at)
        VALUES (${thoughtId}::uuid, 'pending', now() - interval '10 years')
        ON CONFLICT (thought_id) DO UPDATE
          SET status = 'pending', queued_at = now() - interval '10 years'
      `;

      const processed = await drainPendingOnce(false, 1);

      const [run] = await sql<{
        run_id: string;
        items_processed: number;
        errors: number;
        error_summary: unknown;
      }[]>`
        SELECT run_id, items_processed, errors, error_summary
        FROM worker_runs
        WHERE worker = 'consolidation'
        ORDER BY started_at DESC
        LIMIT 1
      `;

      assertExists(run, "worker_runs row should exist");
      assertEquals(run.errors, 1, "LLM error should be recorded");
      assertEquals(run.items_processed, 0, "no items should succeed when LLM fails");
      assertExists(run.error_summary, "error_summary should be set");
      assertEquals(
        (run.error_summary as Record<string, unknown>)?.error as string,
        "LLM failure simulated by __TEST_LLM_FAIL__ content prefix",
      );

      const [queueRow] = await sql<{ status: string }[]>`
        SELECT status FROM consolidation_queue WHERE thought_id = ${thoughtId}::uuid
      `;
      assertEquals(queueRow?.status, "llm_error", "queue should be marked llm_error");
    } finally {
      await sql`DELETE FROM consolidation_queue WHERE thought_id = ${thoughtId}::uuid`;
      await sql`DELETE FROM consolidation_log WHERE thought_id = ${thoughtId}::uuid`;
      await sql`DELETE FROM recall_events WHERE thought_id = ${thoughtId}::uuid`;
      await sql`DELETE FROM thoughts WHERE id = ${thoughtId}::uuid`;
    }
  },
});

Deno.test({
  name: "retention DELETE runs without error during drainPendingOnce",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const staleId = crypto.randomUUID();
    await sql`
      INSERT INTO worker_runs (run_id, worker, started_at, ended_at)
      VALUES (${staleId}, 'consolidation', now() - interval '31 days', now() - interval '30 days')
    `;

    await drainPendingOnce(true, 1);

    const [staleRow] = await sql<{ run_id: string }[]>`
      SELECT run_id FROM worker_runs WHERE run_id = ${staleId}
    `;
    assertEquals(staleRow, undefined, "stale row should have been deleted");

    const freshRunId = crypto.randomUUID();
    await sql`
      INSERT INTO worker_runs (run_id, worker, started_at, ended_at)
      VALUES (${freshRunId}, 'consolidation', now(), now())
    `;
    const [freshRow] = await sql<{ run_id: string }[]>`
      SELECT run_id FROM worker_runs WHERE run_id = ${freshRunId}
    `;
    assertNotEquals(freshRow, undefined, "fresh row should survive retention DELETE");
    await cleanupRun(freshRunId);
  },
});
