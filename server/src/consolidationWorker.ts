/**
 * consolidationWorker.ts — ST-008
 *
 * Background worker that drains the consolidation_queue and either promotes
 * (shard → wiki), flags for human review, or skips each candidate shard.
 *
 * Entry points:
 *   startConsolidationWorker() — called once on server startup.
 *   drainPendingOnce(dryRun?, limit?) — exported for direct invocation via
 *                                        the `consolidate` MCP tool (Task 4.6).
 *
 * Scoring: three-factor formula from consolidationScoring.ts (ADR-007).
 * Dedup: consolidation_log-based check prevents double-promotion when a
 *        shard is re-activated after a prior run.
 * Dry-run: all consolidation_log rows are written with dry_run=true; the
 *          thoughts table is never mutated.
 */

import { sql } from "./db.ts";
import {
  bandFor,
  computeBatchMaxima,
  scoreCandidate,
  type BatchMaxima,
  type CandidateMetrics,
} from "./consolidationScoring.ts";
import { normaliseContent } from "./consolidationLLM.ts";

const BATCH_SIZE = 10;
const LLM_RETRY_INTERVAL = "1 hour";

interface QueueRow {
  thought_id: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Claim up to BATCH_SIZE pending rows with FOR UPDATE SKIP LOCKED. */
async function claimBatch(): Promise<QueueRow[]> {
  const rows = await sql`
    UPDATE consolidation_queue
    SET status = 'processing', attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM consolidation_queue
      WHERE status = 'pending'
        AND (retry_after IS NULL OR retry_after <= now())
      ORDER BY queued_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;
  return rows as unknown as QueueRow[];
}

/** Fetch scoring metrics for one candidate shard.
 *  Returns null when the shard is inactive or has the wrong memory_type. */
async function fetchMetrics(thoughtId: string): Promise<CandidateMetrics | null> {
  const [row] = await sql`
    SELECT
      t.id                        AS thought_id,
      COALESCE(t.confidence, 0.5) AS confidence,
      (SELECT COUNT(*) FROM recall_events
        WHERE thought_id = t.id)                             AS recall_count,
      (SELECT COUNT(DISTINCT project) FROM recall_events
        WHERE thought_id = t.id AND project IS NOT NULL)     AS distinct_projects,
      0::int                      AS helpful_count,
      0::int                      AS total_feedback
    FROM thoughts t
    WHERE t.id = ${thoughtId} AND t.memory_type = 'shard' AND t.active = true
  `;
  if (!row) return null;
  return {
    thoughtId:        row.thought_id as string,
    recallCount:      Number(row.recall_count),
    distinctProjects: Number(row.distinct_projects),
    helpfulCount:     Number(row.helpful_count),
    totalFeedback:    Number(row.total_feedback),
    confidence:       Number(row.confidence),
  };
}

/** Dedup guard: check consolidation_log for a prior 'promote' on this shard.
 *  Uses the audit log (not content_fingerprint) to handle re-activation. */
async function isDedupHit(thoughtId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 AS hit
    FROM consolidation_log
    WHERE thought_id = ${thoughtId}
      AND operation = 'promote'
    LIMIT 1
  `;
  return !!row;
}

/** Promote: create wiki row, soft-delete shard, write audit log entry.
 *  In dry_run mode, only the audit log is written (thoughts unchanged). */
async function promote(
  shardId: string,
  normalised: string,
  score: number,
  breakdown: Record<string, unknown>,
  workerRunId: string,
  dryRun: boolean,
): Promise<void> {
  const breakdownJson = JSON.stringify({ ...breakdown, normalised_content: normalised });
  if (dryRun) {
    await sql`
      INSERT INTO consolidation_log
        (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
      VALUES
        ('promote', ${shardId}, ${score}, ${breakdownJson}::jsonb, ${workerRunId}, true)
    `;
    return;
  }
  await sql.begin(async (txSql) => {
    const [wiki] = await txSql<{ id: string }[]>`
      INSERT INTO thoughts
        (content, memory_type, source, confidence, supersedes, project, profile, metadata)
      SELECT
        ${normalised}, 'wiki', 'auto-promoted', ${score}, NULL,
        project, profile,
        jsonb_build_object(
          'generated_by', 'consolidation_worker',
          'source_shard_id', id::text
        )
      FROM thoughts
      WHERE id = ${shardId}
      RETURNING id
    `;
    await txSql`
      UPDATE thoughts SET active = false WHERE id = ${shardId}
    `;
    await txSql`
      INSERT INTO consolidation_log
        (operation, thought_id, wiki_id, score, score_breakdown, worker_run_id, dry_run)
      VALUES
        ('promote', ${shardId}, ${wiki.id}, ${score}, ${breakdownJson}::jsonb, ${workerRunId}, false)
    `;
  });
}

/** Flag: candidate needs human review; no thoughts write. */
async function flag(
  shardId: string,
  normalised: string,
  score: number,
  breakdown: Record<string, unknown>,
  workerRunId: string,
  dryRun: boolean,
): Promise<void> {
  const breakdownJson = JSON.stringify({ ...breakdown, normalised_content: normalised });
  await sql`
    INSERT INTO consolidation_log
      (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
    VALUES
      ('flag', ${shardId}, ${score}, ${breakdownJson}::jsonb, ${workerRunId}, ${dryRun})
  `;
}

/** Skip: below threshold or dedup; audit log only. */
async function skip(
  shardId: string,
  score: number,
  breakdown: Record<string, unknown>,
  workerRunId: string,
  dryRun: boolean,
): Promise<void> {
  const breakdownJson = JSON.stringify(breakdown);
  await sql`
    INSERT INTO consolidation_log
      (operation, thought_id, score, score_breakdown, worker_run_id, dry_run)
    VALUES
      ('skip', ${shardId}, ${score}, ${breakdownJson}::jsonb, ${workerRunId}, ${dryRun})
  `;
}

/** Full processing pipeline for one queued candidate. */
async function processCandidate(
  thoughtId: string,
  batchMaxima: BatchMaxima,
  workerRunId: string,
  dryRun: boolean,
): Promise<void> {
  // 1. Eligibility: active shard with ≥2 recalls
  const metrics = await fetchMetrics(thoughtId);
  if (!metrics || metrics.recallCount < 2) {
    await sql`
      UPDATE consolidation_queue
      SET status = 'skipped', processed_at = now()
      WHERE thought_id = ${thoughtId}
    `;
    return;
  }

  // 2. Dedup: already promoted in a prior run?
  if (await isDedupHit(thoughtId)) {
    await skip(thoughtId, 0, { dedup: true }, workerRunId, dryRun);
    await sql`
      UPDATE consolidation_queue
      SET status = 'skipped', processed_at = now()
      WHERE thought_id = ${thoughtId}
    `;
    return;
  }

  // 3. Score and determine band
  const breakdown = scoreCandidate(metrics, batchMaxima);
  const band = bandFor(breakdown.score);

  if (band === "skip") {
    await skip(
      thoughtId, breakdown.score,
      breakdown as unknown as Record<string, unknown>,
      workerRunId, dryRun,
    );
    await sql`
      UPDATE consolidation_queue
      SET status = 'skipped', processed_at = now()
      WHERE thought_id = ${thoughtId}
    `;
    return;
  }

  // 4. LLM normalisation (required for both 'promote' and 'flag')
  const [shardRow] = await sql<{ content: string }[]>`
    SELECT content FROM thoughts WHERE id = ${thoughtId}
  `;
  let normalised: string;
  try {
    normalised = await normaliseContent(shardRow.content);
  } catch (err) {
    const errorMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await sql`
      UPDATE consolidation_queue
      SET status      = 'llm_error',
          last_error  = ${errorMsg},
          retry_after = now() + ${LLM_RETRY_INTERVAL}::interval
      WHERE thought_id = ${thoughtId}
    `;
    console.warn(`[consolidationWorker] LLM failed for ${thoughtId}: ${errorMsg}`);
    return;
  }

  // 5. Apply band
  if (band === "promote") {
    await promote(
      thoughtId, normalised, breakdown.score,
      breakdown as unknown as Record<string, unknown>,
      workerRunId, dryRun,
    );
  } else {
    await flag(
      thoughtId, normalised, breakdown.score,
      breakdown as unknown as Record<string, unknown>,
      workerRunId, dryRun,
    );
  }

  const nextStatus = dryRun ? "pending" : (band === "promote" ? "promoted" : "flagged");
  await sql`
    UPDATE consolidation_queue
    SET status       = ${nextStatus},
        processed_at = now(),
        last_error   = NULL
    WHERE thought_id = ${thoughtId}
  `;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process all pending queue rows (up to `limit`).
 * Called on startup (miss-recovery) and on each LISTEN notification.
 * Also callable directly from the `consolidate` MCP tool.
 */
export async function drainPendingOnce(dryRun = false, limit = BATCH_SIZE): Promise<number> {
  const workerRunId = crypto.randomUUID();
  let processed = 0;
  while (processed < limit) {
    const rows = await claimBatch();
    if (!rows.length) break;
    // Fetch metrics for the whole batch to compute shared normalisation maxima
    const metricsForBatch: CandidateMetrics[] = [];
    for (const r of rows) {
      const m = await fetchMetrics(r.thought_id);
      if (m) metricsForBatch.push(m);
    }
    const batchMaxima = computeBatchMaxima(metricsForBatch);
    for (const r of rows) {
      await processCandidate(r.thought_id, batchMaxima, workerRunId, dryRun);
      processed += 1;
    }
  }
  return processed;
}

/**
 * Start the consolidation background worker.
 * - Drains pending queue once (miss-recovery for events fired before boot).
 * - Subscribes to pg_notify 'consolidation_event' and re-drains on each notification.
 */
export async function startConsolidationWorker(): Promise<void> {
  await drainPendingOnce().catch((err) =>
    console.error("[consolidationWorker] startup drain failed:", err)
  );
  await sql.listen("consolidation_event", () => {
    drainPendingOnce().catch((err) =>
      console.error("[consolidationWorker] wake drain failed:", err)
    );
  });
  console.log("[consolidationWorker] listening");
}
