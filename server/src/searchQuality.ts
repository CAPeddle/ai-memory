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

export interface MmrCandidate { id: string; score: number; embedding: number[] | null; }

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

// ---------------------------------------------------------------------------
// Postgres vector type → number[] (renders as `[0.1,0.2,…]` text).
// ---------------------------------------------------------------------------

export function parseVector(s: string | null): number[] | null {
  if (s === null) return null;
  return s.slice(1, -1).split(",").map(Number);
}
