import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractText, mcpCall } from "./_helpers/mcpClient.ts";
import { recallAtK, searchThoughtIds } from "./_helpers/recall.ts";
import { mmrRerank, rrfFuse } from "../src/searchQuality.ts";
import { sql } from "../src/db.ts";

// ──────────────────────────────────────────────────────────────────────────
// TDD seam (QP-046 KD-3). ST-054 flips ONLY the items below — not the test bodies.
//   • normalizeForBm25: identity today; ST-054 replaces the body with its
//     identifier-normalization import so the identifier-form probe starts matching.
//   • BASELINE: today's pinned values; ST-054 flips idFormBm25Rows 0→(≥ noIdFormBm25Rows)
//     and searchSurfacesIncident false→true.
// ──────────────────────────────────────────────────────────────────────────
const normalizeForBm25 = (q: string): string => q; // ST-054: swap for the real normalizer.

const RECALL_K = 10;
const NO_ID_QUERY = "build pipeline failure";
const ID_QUERY = "build 65008 PRI-5751 pipeline failure";
const INCIDENT_RELEVANT_IDS = [
  "00000000-0000-4000-8000-00000000001e",
  "00000000-0000-4000-8000-00000000001f",
  "00000000-0000-4000-8000-000000000020",
  "00000000-0000-4000-8000-000000000021",
];

const BASELINE = {
  // Structural BM25 lane (deterministic, lane-isolated via plainto_tsquery):
  noIdFormBm25Rows: 4, // all build_failure memories match the lexical query
  idFormBm25Rows: 0,   // D2 gap: unmatched identifier tokens AND the query to zero rows.
                       //   ST-054 flips this to >= noIdFormBm25Rows.
  // Tool-level recall@k floor (search_thoughts). The four build_failure rows share ONE
  // synthetic embedding, so MMR's diversity penalty (λ=0.7) deterministically keeps only
  // ONE of them in the top-k (the other three are near-duplicates and get suppressed).
  // The BM25 lane guarantees the surviving pick IS a build_failure row, so recall@k >=
  // 1/4 = 0.25 holds without network. A higher floor would flake on the suppressed dups.
  noIdFormRecallAtKMin: 0.25,
  // search (vector-only) D1 characterization: the synthetic corpus never clears the 0.5
  // cosine floor against a live query embedding, so the incident memory is not surfaced today.
  searchSurfacesIncident: false, // ST-054 (floor-with-fallback) flips this to true.
};

// ── recall@k helper self-check (no network) ──────────────────────────────
Deno.test("recallAtK computes |relevant ∩ topK| / |relevant|", () => {
  assertEquals(recallAtK(["a", "b", "c"], ["a", "z"], 3), 0.5);
  assertEquals(recallAtK(["a", "b"], ["a", "b"], 10), 1);
  assertEquals(recallAtK(["x"], ["a"], 10), 0);
});

// ── Deterministic RRF/MMR drift detection (pure functions, no network; AC-7) ──
// RRF k-sensitivity by construction: a single-lane rank-1 row vs a row present in BOTH
// lanes at rank 15. The two-lane row wins iff 15 < k + 2 — so it leads at k=60 (flat RRF
// curve rewards multi-lane presence) and loses to the rank-1 single-lane row at k=10
// (steep curve rewards top ranks). This crossover is the parameter drift AC-7 must catch.
Deno.test("RRF drift: rrfFuse top result flips between k=60 and k=10", () => {
  const lanes = [
    [{ id: "single", rank: 1 }, { id: "both", rank: 15 }], // BM25 lane
    [{ id: "both", rank: 15 }],                            // vector lane
  ];
  const top = (k: number) =>
    [...rrfFuse(lanes, k).entries()].sort((a, b) => b[1] - a[1])[0][0];
  assertEquals(top(60), "both");   // flat curve → multi-lane presence wins
  assertEquals(top(10), "single"); // steep curve → rank-1 single lane wins
});

// MMR λ-sensitivity by construction: two rows share ONE embedding (near-duplicates), a
// third is orthogonal. High λ barely penalises redundancy and keeps the higher-scored
// duplicate; low λ lets diversity dominate and swaps in the orthogonal row.
Deno.test("MMR drift: mmrRerank swaps a near-duplicate for a diverse row as λ falls", () => {
  const dup = [1, 0, 0];
  const cands = [
    { id: "a", score: 1.0, embedding: dup },
    { id: "b", score: 0.9, embedding: dup },       // near-duplicate of a
    { id: "c", score: 0.5, embedding: [0, 1, 0] }, // diverse
  ];
  assertEquals(mmrRerank(cands, 2, 0.95).map((r) => r.id), ["a", "b"]);
  assertEquals(mmrRerank(cands, 2, 0.4).map((r) => r.id), ["a", "c"]);
});

// ── Integration golden-set membership (complementary live coverage; NOT the AC-7 gate) ──
// Confirms the wired search_thoughts path returns each BM25-deterministic pair's expected
// id in the top-N with default parameters. Drift detection itself is the pure-function
// tests above. Excludes deliberately unstable live-path pairs: the vector-only pair
// (zoom-recording → …004), and zoom meeting rotation, whose expected row is not stable
// in top-3 after the live embedding lane mixes close zoom candidates.
const VECTOR_ONLY_QUERY = "zoom recording auto archive";
const LIVE_MEMBERSHIP_EXCLUDED_QUERIES = new Set([
  VECTOR_ONLY_QUERY,
  "zoom meeting rotation",
]);
const GOLDEN_TOP_N = 3;

const queryPairs: Array<{ query: string; expected_id: string }> = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/search-quality-queries.json", import.meta.url)),
);

for (const pair of queryPairs) {
  if (LIVE_MEMBERSHIP_EXCLUDED_QUERIES.has(pair.query)) continue; // not stable BM25-deterministic live coverage
  Deno.test({
    name: `golden-set: "${pair.query}" surfaces ${pair.expected_id} in top-${GOLDEN_TOP_N}`,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
      const ids = await searchThoughtIds(pair.query, GOLDEN_TOP_N);
      assert(
        ids.includes(pair.expected_id),
        `Expected ${pair.expected_id} in top-${GOLDEN_TOP_N} for "${pair.query}". Got: ${ids.join(", ")}`,
      );
    },
  });
}

// ── Structural incident baselines (deterministic BM25 lane via SQL probe) ──
Deno.test({
  name: "incident baseline: no-identifier form matches the build_failure set (BM25 lane)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const rows = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM thoughts, plainto_tsquery('english', ${normalizeForBm25(NO_ID_QUERY)}) AS q
      WHERE search_vector @@ q AND active = true
    `;
    const incident = rows.filter((r) => INCIDENT_RELEVANT_IDS.includes(r.id));
    assertEquals(
      incident.length,
      BASELINE.noIdFormBm25Rows,
      `Expected ${BASELINE.noIdFormBm25Rows} build_failure rows for the no-id form; got ${incident.length}`,
    );
  },
});

Deno.test({
  name: "incident baseline: identifier form ANDs to zero rows (D2 dilution — ST-054 flips)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const rows = await sql<{ id: string }[]>`
      SELECT id::text AS id
      FROM thoughts, plainto_tsquery('english', ${normalizeForBm25(ID_QUERY)}) AS q
      WHERE search_vector @@ q AND active = true
        AND id = ANY(${INCIDENT_RELEVANT_IDS}::uuid[])
    `;
    assertEquals(
      rows.length,
      BASELINE.idFormBm25Rows,
      `Expected ${BASELINE.idFormBm25Rows} build_failure rows for the identifier form; got ${rows.length}`,
    );
  },
});

// ── Tool-level recall@k floor (search_thoughts, deterministic floor) ──────
Deno.test({
  name: "incident baseline: search_thoughts recall@k (no-id form) meets the floor",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const ids = await searchThoughtIds(NO_ID_QUERY, RECALL_K);
    const recall = recallAtK(ids, INCIDENT_RELEVANT_IDS, RECALL_K);
    assert(
      recall >= BASELINE.noIdFormRecallAtKMin,
      `Expected recall@${RECALL_K} >= ${BASELINE.noIdFormRecallAtKMin}; got ${recall}. IDs: ${ids.join(", ")}`,
    );
  },
});

// ── search D1 characterization (the only live-embedding assertion; KD-2) ──
Deno.test({
  name: "search D1: incident memory is NOT surfaced by `search` today (ST-054 flips)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("search", { query: NO_ID_QUERY });
    const text = extractText(result);
    const surfaced = INCIDENT_RELEVANT_IDS.some((id) => text.includes(id));
    assertEquals(
      surfaced,
      BASELINE.searchSurfacesIncident,
      `Expected search surfacing incident == ${BASELINE.searchSurfacesIncident}; got ${surfaced}`,
    );
  },
});
