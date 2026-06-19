import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
  name: "retention DELETE runs without error during drainPendingOnce",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Insert a stale row well beyond 30 days
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

    // Clean up the fresh row created by drainPendingOnce
    await sql`
      DELETE FROM worker_runs WHERE worker = 'consolidation' AND started_at > now() - interval '1 minute'
    `;
  },
});
