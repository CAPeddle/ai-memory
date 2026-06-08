import { sql } from "./db.ts";

// ---------------------------------------------------------------------------
// Cosine similarity for MMR diversity computation.
// ---------------------------------------------------------------------------

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// MMR (Maximal Marginal Relevance) re-ranking.
//
// Candidates must already be sorted by post-boost RRF score descending.
// Null embeddings participate in MMR with similarity-to-selected = 0.
// This keeps fresh BM25-only hits returnable while preserving diversity among embedded rows.
// λ = 0.7 (relevance weight); (1 - λ) = 0.3 (diversity penalty weight).
// ---------------------------------------------------------------------------

export interface RrfLaneRow { id: string; rank: number; }

/**
 * Reciprocal Rank Fusion. Sums 1/(k + rank) for each id across all lanes.
 * Pure and deterministic — no I/O. Used by search_thoughts and by the
 * ST-046 regression harness to prove k-sensitivity without the network.
 */
export function rrfFuse(lanes: RrfLaneRow[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const lane of lanes) {
    for (const r of lane) {
      scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + r.rank));
    }
  }
  return scores;
}

export interface MmrCandidate { id: string; score: number; embedding: number[] | null; }

export interface QualityBandInput {
  bm25Rank: number | null;
  vectorRank: number | null;
  vectorSimilarity: number | null;
}

export function deriveQualityBand(input: QualityBandInput): "high" | "medium" | "low" {
  const inBm25Top10 = input.bm25Rank !== null && input.bm25Rank <= 10;
  const inVectorTop10 = input.vectorRank !== null && input.vectorRank <= 10;
  const vectorSimilarity = input.vectorSimilarity;
  const hasVectorSimilarity = vectorSimilarity !== null;

  if (hasVectorSimilarity && (vectorSimilarity >= 0.5 || (inBm25Top10 && inVectorTop10))) {
    return "high";
  }

  if ((hasVectorSimilarity && vectorSimilarity >= 0.35) || inBm25Top10) {
    return "medium";
  }

  return "low";
}

export function truncateQueryLogText(input: string, maxLength = 2048): string {
  return input.length <= maxLength ? input : input.slice(0, maxLength);
}

export interface RecallQueryLogInput {
  tool: "search" | "search_thoughts";
  query: string;
  normalizedQuery: string;
  project: string | null;
  profile: string | null;
  resultIds: string[];
}

export function mmrRerank(candidates: MmrCandidate[], k: number, lambda = 0.7): { id: string; score: number }[] {
  const selected: MmrCandidate[] = [];
  const remaining = [...candidates];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      if (c.embedding !== null) {
        for (const s of selected) {
          if (s.embedding === null) continue;
          const sim = cosineSim(c.embedding, s.embedding);
          if (sim > maxSim) maxSim = sim;
        }
      }
      const mmr = lambda * c.score - (1 - lambda) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected.map((c) => ({ id: c.id, score: c.score }));
}

// ---------------------------------------------------------------------------
// Async recall logger — fire-and-forget. Writes one row per returned result.
// Failure logs to console.error and does NOT affect the response.
// ---------------------------------------------------------------------------

export function logRecall(query: string, project: string | null, results: { id: string; score: number }[]): void {
  if (!results.length) return;
  const rows = results.map((r, i) => ({
    thought_id: r.id, query, rrf_score: r.score, rank: i + 1, project,
  }));
  (async () => {
    await sql`INSERT INTO recall_events ${sql(rows, "thought_id", "query", "rrf_score", "rank", "project")}`;
    const ids = results.map((r) => r.id);
    await sql`UPDATE thoughts SET recall_count = recall_count + 1, last_recalled_at = now() WHERE id = ANY(${ids}::uuid[])`;
  })().catch((err) => console.error("[search_thoughts] recall log failed:", err));
}

export function logRecallQuery(input: RecallQueryLogInput): void {
  const topResultIds = input.resultIds.slice(0, 10);
  const query = truncateQueryLogText(input.query);
  const normalizedQuery = truncateQueryLogText(input.normalizedQuery);

  (async () => {
    await sql`
      INSERT INTO recall_queries (tool, query, normalized_query, project, profile, result_count, top_result_ids)
      VALUES (
        ${input.tool},
        ${query},
        ${normalizedQuery},
        ${input.project},
        ${input.profile},
        ${input.resultIds.length},
        ${topResultIds}::uuid[]
      )
    `;
  })().catch((err) => console.error(`[${input.tool}] recall query log failed:`, err));
}

// ---------------------------------------------------------------------------
// Postgres vector type → number[] (renders as `[0.1,0.2,…]` text).
// ---------------------------------------------------------------------------

export function parseVector(s: string | null): number[] | null {
  if (s === null) return null;
  return s.slice(1, -1).split(",").map(Number);
}
