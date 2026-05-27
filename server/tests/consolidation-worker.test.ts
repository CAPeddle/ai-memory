/**
 * Integration tests for ST-008: Consolidation Worker (Shard → Wiki Promotion)
 *
 * Run (from repo root):
 *   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/consolidation-worker.test.ts
 *
 * State management: each test sets up and tears down its own rows via
 * direct `sql` calls (Porsager postgres client). No shared corpus file is
 * loaded by the seed service. See docs/planning/execplans/exec-plan-ST-008.md §6c.
 */

import { sql } from "../src/db.ts";
import { mcpCall, sleep } from "./_helpers/mcpClient.ts";

// ---------------------------------------------------------------------------
// Deterministic test UUIDs
// ---------------------------------------------------------------------------
const S_PROMOTE  = "00000000-0008-4000-a001-000000000001"; // ≥0.7 → promote
const S_FLAG     = "00000000-0008-4000-a001-000000000002"; // 0.5–0.69 → flag
const S_SKIP     = "00000000-0008-4000-a001-000000000003"; // <0.5 → skip
const S_DEDUP    = "00000000-0008-4000-a001-000000000004"; // dedup on re-run
const S_IDLE     = "00000000-0008-4000-a001-000000000005"; // 0 recalls (ineligible)
const S_FALLBK   = "00000000-0008-4000-a001-000000000006"; // relevance fallback
const S_LLM_FAIL = "00000000-0008-4000-a001-000000000007"; // LLM failure stub

const ALL_TEST_IDS = [S_PROMOTE, S_FLAG, S_SKIP, S_DEDUP, S_IDLE, S_FALLBK, S_LLM_FAIL];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove all test rows. consolidation_log has no CASCADE FK — delete first. */
async function cleanupTestData(): Promise<void> {
  for (const id of ALL_TEST_IDS) {
    await sql`DELETE FROM public.consolidation_log
              WHERE thought_id = ${id}::uuid OR wiki_id = ${id}::uuid`;
  }
  // Also delete any auto-promoted wikis whose thought_id was tracked in consolidation_log for our shards
  const promotedWikis = await sql<{ wiki_id: string }[]>`
    SELECT DISTINCT wiki_id::text FROM public.consolidation_log
    WHERE thought_id = ANY(ARRAY[${S_PROMOTE}::uuid, ${S_DEDUP}::uuid, ${S_FALLBK}::uuid, ${S_LLM_FAIL}::uuid])
      AND wiki_id IS NOT NULL
  `;
  for (const { wiki_id } of promotedWikis) {
    await sql`DELETE FROM public.consolidation_log WHERE thought_id = ${wiki_id}::uuid OR wiki_id = ${wiki_id}::uuid`;
    await sql`DELETE FROM public.thoughts WHERE id = ${wiki_id}::uuid`;
  }
  for (const id of ALL_TEST_IDS) {
    await sql`DELETE FROM public.thoughts WHERE id = ${id}::uuid`;
  }
}

async function insertShard(
  id: string,
  content: string,
  confidence: number,
  project: string,
  fingerprint?: string,
): Promise<void> {
  const fp = fingerprint ?? `fp-${id}`;
  await sql`
    INSERT INTO public.thoughts
      (id, content, memory_type, source, project, confidence, content_fingerprint, active)
    VALUES
      (${id}::uuid, ${content}, 'shard', 'user-taught', ${project}, ${confidence}, ${fp}, true)
    ON CONFLICT (id) DO NOTHING
  `;
}

async function addRecalls(thoughtId: string, count: number, projects: string[]): Promise<void> {
  for (let i = 0; i < count; i++) {
    const project = projects[i % projects.length];
    await sql`
      INSERT INTO public.recall_events (thought_id, query, rrf_score, rank, project)
      VALUES (${thoughtId}::uuid, 'test query', 0.5, 1, ${project})
    `;
  }
}

// ---------------------------------------------------------------------------
// Test A: promote happy path
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: promote happy path — score ≥0.7 creates wiki, flips shard active=false",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    await insertShard(S_PROMOTE, "Promote candidate shard", 0.8, "test-consolidation-zoom");
    await addRecalls(S_PROMOTE, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);
    // Also insert flag and skip candidates (needed for batch normalisation)
    await insertShard(S_FLAG, "Flag candidate shard", 0.5, "test-consolidation-zoom");
    await addRecalls(S_FLAG, 3, ["test-consolidation-zoom", "test-consolidation-bcf"]);
    await insertShard(S_SKIP, "Skip candidate shard", 0.2, "test-consolidation-zoom");
    await addRecalls(S_SKIP, 2, ["test-consolidation-zoom", "test-consolidation-zoom"]);

    // Trigger consolidation (tool not yet implemented → red phase expects failure here)
    await mcpCall("consolidate", { dry_run: false });

    // If we reach here (green phase): verify wiki row exists
    const wikis = await sql<{ id: string; supersedes: string | null; source: string }[]>`
      SELECT id, supersedes, source
      FROM public.thoughts
      WHERE memory_type = 'wiki' AND source = 'auto-promoted'
        AND id IN (SELECT wiki_id FROM public.consolidation_log WHERE thought_id = ${S_PROMOTE}::uuid)
    `;
    if (wikis.length === 0) throw new Error("Expected at least one auto-promoted wiki row");

    const [wiki] = wikis;
    if (wiki.supersedes !== null) {
      throw new Error(`Expected wiki.supersedes IS NULL, got ${wiki.supersedes}`);
    }

    const [shard] = await sql<{ active: boolean }[]>`
      SELECT active FROM public.thoughts WHERE id = ${S_PROMOTE}::uuid
    `;
    if (shard.active !== false) {
      throw new Error(`Expected original shard active=false after promotion`);
    }

    const [log] = await sql<{ operation: string; wiki_id: string }[]>`
      SELECT operation, wiki_id::text FROM public.consolidation_log
      WHERE thought_id = ${S_PROMOTE}::uuid AND operation = 'promote'
    `;
    if (!log) throw new Error("Expected consolidation_log row with operation='promote'");
    if (log.wiki_id !== wiki.id) {
      throw new Error(`consolidation_log.wiki_id mismatch: ${log.wiki_id} vs ${wiki.id}`);
    }

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test B: flag band
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: flag band — 0.5≤score<0.7 logs flag, no wiki created",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    await insertShard(S_PROMOTE, "Promote anchor shard for normalisation", 0.8, "test-consolidation-zoom");
    await addRecalls(S_PROMOTE, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);
    await insertShard(S_FLAG, "Flag candidate shard", 0.5, "test-consolidation-zoom");
    await addRecalls(S_FLAG, 3, ["test-consolidation-zoom", "test-consolidation-bcf"]);
    await insertShard(S_SKIP, "Skip candidate shard", 0.2, "test-consolidation-zoom");
    await addRecalls(S_SKIP, 2, ["test-consolidation-zoom", "test-consolidation-zoom"]);

    await mcpCall("consolidate", { dry_run: false });

    // No wiki from shard B
    const wikis = await sql<{ id: string }[]>`
      SELECT id FROM public.thoughts
      WHERE memory_type = 'wiki' AND source = 'auto-promoted'
        AND id IN (
          SELECT wiki_id FROM public.consolidation_log WHERE thought_id = ${S_FLAG}::uuid
        )
    `;
    if (wikis.length > 0) throw new Error("Expected no wiki from flag candidate");

    const [log] = await sql<{ operation: string; score_breakdown: Record<string, unknown> }[]>`
      SELECT operation, score_breakdown
      FROM public.consolidation_log
      WHERE thought_id = ${S_FLAG}::uuid AND operation = 'flag'
    `;
    if (!log) throw new Error("Expected consolidation_log row with operation='flag' for S_FLAG");
    if (!log.score_breakdown?.normalised_content) {
      throw new Error(`Expected score_breakdown.normalised_content in flag log, got: ${JSON.stringify(log.score_breakdown)}`);
    }

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test C: skip band
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: skip band — score<0.5 logs skip, no wiki created",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    await insertShard(S_PROMOTE, "Promote anchor shard", 0.8, "test-consolidation-zoom");
    await addRecalls(S_PROMOTE, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);
    await insertShard(S_FLAG, "Flag anchor shard", 0.5, "test-consolidation-zoom");
    await addRecalls(S_FLAG, 3, ["test-consolidation-zoom", "test-consolidation-bcf"]);
    await insertShard(S_SKIP, "Skip candidate shard", 0.2, "test-consolidation-zoom");
    await addRecalls(S_SKIP, 2, ["test-consolidation-zoom", "test-consolidation-zoom"]);

    await mcpCall("consolidate", { dry_run: false });

    const wikisFromSkip = await sql<{ id: string }[]>`
      SELECT id FROM public.thoughts
      WHERE memory_type = 'wiki' AND source = 'auto-promoted'
        AND id IN (
          SELECT wiki_id FROM public.consolidation_log WHERE thought_id = ${S_SKIP}::uuid
        )
    `;
    if (wikisFromSkip.length > 0) throw new Error("Expected no wiki from skip candidate");

    const [log] = await sql<{ operation: string }[]>`
      SELECT operation FROM public.consolidation_log
      WHERE thought_id = ${S_SKIP}::uuid AND operation = 'skip'
    `;
    if (!log) throw new Error("Expected consolidation_log row with operation='skip'");

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test D: dry-run
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: dry-run — no thoughts mutations, all log rows have dry_run=true",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    await insertShard(S_PROMOTE, "Dry-run promote candidate", 0.8, "test-consolidation-zoom");
    await addRecalls(S_PROMOTE, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);
    await insertShard(S_FLAG, "Dry-run flag candidate", 0.5, "test-consolidation-zoom");
    await addRecalls(S_FLAG, 3, ["test-consolidation-zoom", "test-consolidation-bcf"]);
    await insertShard(S_SKIP, "Dry-run skip candidate", 0.2, "test-consolidation-zoom");
    await addRecalls(S_SKIP, 2, ["test-consolidation-zoom", "test-consolidation-zoom"]);

    const beforeWikiCount = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.thoughts WHERE memory_type = 'wiki' AND source = 'auto-promoted'
    `)[0].n;

    // Call consolidate — must succeed (tool must exist) for dry-run to be meaningful
    await mcpCall("consolidate", { dry_run: true, limit: 100 });

    // PRIMARY red-phase assertion: consolidation_log must have at least one dry_run=true row.
    // In the red phase (tool not yet implemented), zero rows exist → test fails.
    const dryLogs = await sql<{ id: number; dry_run: boolean }[]>`
      SELECT id, dry_run FROM public.consolidation_log
      WHERE thought_id = ANY(ARRAY[${S_PROMOTE}::uuid, ${S_FLAG}::uuid, ${S_SKIP}::uuid])
    `;
    if (dryLogs.length === 0) {
      throw new Error("Expected consolidation_log rows after dry_run sweep (tool not yet implemented?)");
    }

    const afterWikiCount = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.thoughts WHERE memory_type = 'wiki' AND source = 'auto-promoted'
    `)[0].n;
    if (afterWikiCount !== beforeWikiCount) {
      throw new Error(`dry_run=true must not create wiki rows. Before: ${beforeWikiCount}, after: ${afterWikiCount}`);
    }

    const wetLogs = await sql<{ id: number }[]>`
      SELECT id FROM public.consolidation_log
      WHERE thought_id = ANY(ARRAY[${S_PROMOTE}::uuid, ${S_FLAG}::uuid, ${S_SKIP}::uuid])
        AND dry_run = false
    `;
    if (wetLogs.length > 0) {
      throw new Error(`Expected all consolidation_log rows to have dry_run=true, found ${wetLogs.length} with dry_run=false`);
    }

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test E: dedup
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: dedup — promoting an already-promoted shard (re-run) skips with dedup=true",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    await insertShard(S_DEDUP, "Dedup candidate shard", 0.8, "test-consolidation-zoom");
    await addRecalls(S_DEDUP, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);

    // First run: promote the shard (green phase: creates wiki, sets active=false)
    const result1 = await mcpCall("consolidate", { dry_run: false });
    const r1 = result1 as { error?: { message: string } };
    if (r1.error) throw new Error(`consolidate tool error on first run: ${r1.error.message}`);

    // Re-activate the shard (simulates scenario where active was reset for re-evaluation)
    await sql`UPDATE public.thoughts SET active = true WHERE id = ${S_DEDUP}::uuid`;
    await sql`DELETE FROM public.consolidation_queue WHERE thought_id = ${S_DEDUP}::uuid`;
    await sql`INSERT INTO public.consolidation_queue (thought_id, status)
              VALUES (${S_DEDUP}::uuid, 'pending') ON CONFLICT DO NOTHING`;

    // Second run: worker should detect prior promotion (via consolidation_log) and skip
    const result2 = await mcpCall("consolidate", { dry_run: false });
    const r2 = result2 as { error?: { message: string } };
    if (r2.error) throw new Error(`consolidate tool error on second run: ${r2.error.message}`);

    // Assert only ONE wiki was created (not two)
    const wikiRows = await sql<{ id: string }[]>`
      SELECT id FROM public.thoughts
      WHERE memory_type = 'wiki' AND source = 'auto-promoted'
        AND id IN (SELECT wiki_id FROM public.consolidation_log WHERE thought_id = ${S_DEDUP}::uuid)
    `;
    if (wikiRows.length > 1) {
      throw new Error(`Expected at most 1 wiki from S_DEDUP, got ${wikiRows.length}`);
    }

    // Assert consolidation_log has a skip/dedup row from the second run
    const logs = await sql<{ operation: string; score_breakdown: Record<string, unknown> }[]>`
      SELECT operation, score_breakdown
      FROM public.consolidation_log
      WHERE thought_id = ${S_DEDUP}::uuid AND operation = 'skip'
      ORDER BY created_at DESC
    `;
    if (logs.length === 0) throw new Error("Expected consolidation_log row with operation='skip' from second run (dedup)");
    const [dedupLog] = logs;
    if (!dedupLog.score_breakdown?.dedup) {
      throw new Error(`Expected score_breakdown.dedup=true in skip log, got: ${JSON.stringify(dedupLog.score_breakdown)}`);
    }

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test F: relevance fallback
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: relevance fallback — score uses thoughts.confidence when no feedback_events",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    // S_FALLBK is the ONLY eligible shard → it's the batch max → freq_norm=1.0, div_norm=1.0
    // confidence=0.5 → expected score = 0.40*1.0 + 0.35*1.0 + 0.25*0.5 = 0.875
    await insertShard(S_FALLBK, "Fallback relevance candidate", 0.5, "test-consolidation-zoom");
    await addRecalls(S_FALLBK, 3, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);

    // Ensure no feedback_events exist for this shard (clean state)
    await sql`DELETE FROM public.feedback_events WHERE thought_id = ${S_FALLBK}::uuid`.catch(() => {});

    await mcpCall("consolidate", { dry_run: false });

    const [log] = await sql<{ score: number; score_breakdown: Record<string, unknown> }[]>`
      SELECT score, score_breakdown
      FROM public.consolidation_log
      WHERE thought_id = ${S_FALLBK}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!log) throw new Error("Expected consolidation_log row for S_FALLBK");

    const expected = 0.875;
    const actual = log.score;
    if (Math.abs(actual - expected) > 0.001) {
      throw new Error(
        `Expected score ${expected} (confidence fallback), got ${actual}. ` +
        `score_breakdown: ${JSON.stringify(log.score_breakdown)}`
      );
    }

    const source = log.score_breakdown?.relevance_source;
    if (source !== "confidence_fallback") {
      throw new Error(`Expected relevance_source='confidence_fallback', got '${source}'`);
    }

    await cleanupTestData();
  },
});

// ---------------------------------------------------------------------------
// Test G: LLM failure defer
// ---------------------------------------------------------------------------
Deno.test({
  name: "consolidation: LLM failure defer — llm_error status set, retry_after ≥ now()+59min, no wiki",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await cleanupTestData();
    // Content prefix __TEST_LLM_FAIL__ is checked by the LLM module to simulate failure.
    // The consolidation worker (Task 4.4) must honour this marker when present.
    await insertShard(
      S_LLM_FAIL,
      "__TEST_LLM_FAIL__ This shard triggers the LLM failure simulation",
      0.8,
      "test-consolidation-zoom",
    );
    await addRecalls(S_LLM_FAIL, 5, ["test-consolidation-zoom", "test-consolidation-bcf", "test-consolidation-personal"]);

    await mcpCall("consolidate", { dry_run: false });

    // No wiki created
    const wikis = await sql<{ id: string }[]>`
      SELECT id FROM public.thoughts
      WHERE memory_type = 'wiki' AND source = 'auto-promoted'
        AND id IN (
          SELECT wiki_id FROM public.consolidation_log WHERE thought_id = ${S_LLM_FAIL}::uuid
        )
    `;
    if (wikis.length > 0) {
      throw new Error("Expected no wiki created when LLM call fails");
    }

    const [q] = await sql<{ status: string; retry_after: Date | null }[]>`
      SELECT status, retry_after
      FROM public.consolidation_queue
      WHERE thought_id = ${S_LLM_FAIL}::uuid
    `;
    if (!q) throw new Error("Expected consolidation_queue row for S_LLM_FAIL");
    if (q.status !== "llm_error") {
      throw new Error(`Expected status='llm_error', got '${q.status}'`);
    }
    if (!q.retry_after) throw new Error("Expected retry_after to be set");
    const minRetryMs = Date.now() + 59 * 60 * 1000;
    if (q.retry_after.getTime() < minRetryMs) {
      throw new Error(`Expected retry_after ≥ now()+59min; got ${q.retry_after.toISOString()}`);
    }

    await cleanupTestData();
  },
});
