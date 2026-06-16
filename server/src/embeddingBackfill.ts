import { sql } from "./db.ts";
import { EMBEDDING_MODEL, getEmbedding } from "./embeddings.ts";

const MAX_ATTEMPTS = 5;                // mirrors entityWorker MAX_ATTEMPTS
const BATCH_SIZE = 50;                 // rows reconciled per sweep
const POLL_INTERVAL_MS = Number(Deno.env.get("EMBEDDING_BACKFILL_INTERVAL_MS") ?? "60000");

export interface BackfillDeps {
  /** Injectable embed fn so tests can stub success/failure. Defaults to the real client. */
  embed?: (text: string) => Promise<number[]>;
}

export interface SweepResult {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * One reconciliation pass: fill embeddings for rows that should have one but don't.
 * Sweep-as-retry — exactly one embed attempt per selected row per sweep.
 *
 * The `embedding IS NULL` guard is deliberate (see ExecPlan §2c): the sweep fills
 * only MISSING embeddings and never overwrites a good one — important because the
 * seeded test corpus has needs_embedding = true on rows that already have embeddings.
 */
export async function runBackfillSweep({ embed = getEmbedding }: BackfillDeps = {}): Promise<SweepResult> {
  const rows = await sql<{ id: string; content: string }[]>`
    SELECT id, content
    FROM thoughts
    WHERE needs_embedding = true
      AND embedding IS NULL
      AND embedding_attempts < ${MAX_ATTEMPTS}
    ORDER BY created_at
    LIMIT ${BATCH_SIZE}
  `;

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const emb = await embed(row.content);
      await sql`
        UPDATE thoughts
        SET embedding        = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
            needs_embedding  = false,
            embedding_model  = ${EMBEDDING_MODEL},
            embedding_error  = NULL
        WHERE id = ${row.id}
          AND embedding IS NULL
          AND needs_embedding = true
      `;
      succeeded++;
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      await sql`
        UPDATE thoughts
        SET embedding_attempts = embedding_attempts + 1,
            embedding_error    = ${msg}
        WHERE id = ${row.id}
          AND needs_embedding = true
      `;
      failed++;
    }
  }

  return { processed: rows.length, succeeded, failed };
}

/**
 * Start the background backfill worker: run once on boot (miss-recovery), then poll.
 * Disabled by EMBEDDING_BACKFILL_DISABLED=true (test isolation, mirrors
 * CONSOLIDATION_WORKER_DISABLED) or FEATURE_EMBEDDING_BACKFILL=false (kill-switch).
 */
export function startEmbeddingBackfill(): void {
  if (Deno.env.get("EMBEDDING_BACKFILL_DISABLED") === "true") {
    console.log("[embeddingBackfill] auto-start disabled (EMBEDDING_BACKFILL_DISABLED=true)");
    return;
  }
  if (Deno.env.get("FEATURE_EMBEDDING_BACKFILL") === "false") {
    console.log("[embeddingBackfill] disabled via FEATURE_EMBEDDING_BACKFILL=false");
    return;
  }
  console.log(`[embeddingBackfill] started (poll every ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE})`);
  setInterval(() => {
    runBackfillSweep().catch((err) => console.error("[embeddingBackfill] sweep failed:", err));
  }, POLL_INTERVAL_MS);
  runBackfillSweep().catch((err) => console.error("[embeddingBackfill] initial sweep failed:", err));
}
