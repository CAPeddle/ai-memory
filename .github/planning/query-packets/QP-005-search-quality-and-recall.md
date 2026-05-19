# QP-005 — Search Quality (MMR + Project Boost) and Recall Logging

## Story

**ST-005** — Search quality enhancements (MMR, project boosting, recall logging)

Board entry: [story-board.md:18-29](../story-board.md#L18-L29)

## Summary

Three coordinated extensions to the existing `search_thoughts` tool, shipped as one story:

1. **MMR diversity re-ranking** (λ = 0.7) applied over the top-K results returned by the existing BM25+vector RRF fusion, to reduce near-duplicate clustering in the top results.
2. **Project boosting** — when the caller supplies a `project:` in the `context` parameter, results matching that project receive a 1.2× score multiplier (boost). A new opt-in `strict:true` token in the context grammar restores the current hard-filter behaviour.
3. **Recall logging** — every search asynchronously writes one `recall_events` row per returned result and increments `recall_count` / refreshes `last_recalled_at` on the corresponding `thoughts` row. This feeds ST-008's consolidation scoring.

The story exists to (a) improve retrieval quality visibly to consumers and (b) build the passive feedback loop that ST-008 depends on for shard-to-wiki promotion scoring.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Story priority — which AC drives design trade-offs when they conflict? | All three ACs equal weight; ship as one story |
| 2 | Project-scope behaviour | Hybrid: 1.2× boost by default; `strict:true` in context grammar restores hard filter |
| 3 | MMR fallback when a candidate has NULL embedding | Skip MMR for null-embedding rows; they keep their RRF rank and are interleaved by RRF score |
| 4 | Recall logging timing | Async fire-and-forget after the search response is returned (matches existing fire-and-forget embedding pattern) |
| 5 | API surface for the `strict` flag | Extend `parseContext` grammar: `strict:true` token alongside `project:`, `profile:`, etc. No new tool input field. |
| 6 | `recall_count` / `last_recalled_at` update policy | `+1` per returned result per search; `last_recalled_at = now()` for every returned result row |
| 7 | Integration test corpus shape | Hand-crafted SQL fixture in repo (~30-50 thoughts, ~10 query/expected-id pairs); deterministic, reviewable in PRs |
| 8 | Schema change delivery | Edit `server/db/schema.sql` directly + supply `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` snippet for existing-DB upgrade (ST-022 precedent) |
| 9 | Feedback API (helpful/irrelevant) | OUT of ST-005; create a follow-up backlog story so the deferred design is tracked |

## In Scope

### Schema (server/db/schema.sql)

- New `recall_events` table:
  - `id bigserial PRIMARY KEY`
  - `thought_id uuid NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE`
  - `query text NOT NULL`
  - `rrf_score float NOT NULL` (the post-MMR final score that determined the rank)
  - `rank int NOT NULL` (1-based position in the returned result set)
  - `project text` (the context.project the search ran under, or NULL)
  - `created_at timestamptz NOT NULL DEFAULT now()`
- Index on `(thought_id, created_at DESC)` for ST-008 windowed scoring queries.
- No migration tool introduced; ALTER snippet documented for in-place upgrades.

(Note: `thoughts.recall_count` and `thoughts.last_recalled_at` already exist in [server/db/schema.sql:33-34](../../../server/db/schema.sql#L33-L34) — no schema changes needed for those.)

### `parseContext` (server/src/parseContext.ts)

- Extend `ContextScope` interface with `strict?: boolean`.
- Parser branch: `else if (k === "strict") scope.strict = v === "true";`
- Backwards compatible: omitted `strict` ⇒ `undefined` ⇒ boost behaviour (the new default).

### `search_thoughts` (server/index.ts)

Rewrite the body of the existing tool to:

1. Parse `context`; derive `project` and `strict`.
2. Run BM25 lane and vector lane — same as today but **without** the hardcoded `AND (project = X)` filter when `strict !== true`. Retain the filter when `strict === true`.
3. RRF fusion in application layer (unchanged).
4. **Apply project boost**: for each fused result, if `result.project === scope.project`, multiply `rrf_score` by 1.2.
5. **MMR re-rank** the top-N candidates (N = 3× requested `limit`, capped at 60):
   - λ = 0.7
   - similarity = cosine between candidate embeddings (already vector(512) on the row)
   - Rows with NULL embedding skip MMR re-ranking; they retain their post-boost RRF score and are merged into the final order by score.
6. Slice to `limit` (default 10, max 100).
7. Return the response **first**, then issue an asynchronous batch INSERT into `recall_events` plus an UPDATE that bumps `recall_count` and `last_recalled_at` on the returned `thought_id`s. Catch and `console.error` on failure — never block the response.

### Test fixtures (server/tests/fixtures/search-quality-corpus.sql)

- ~30-50 hand-designed thoughts spanning two projects (e.g., `zoom`, `bcf-managers`) plus some unscoped thoughts.
- Pre-computed `embedding` values supplied in the fixture so tests do not require an OpenRouter call (use a deterministic stub vector per thought, or run a one-time embedding script and commit results).
- A companion JSON (or inline test constants) of ~10 query strings and the expected top-result `id` set per query.

### Integration tests (server/tests/)

Add three new test files (TDD: red → green → refactor):

1. `search-mmr.test.ts` — Seeds the corpus, asserts that for a query with three near-duplicate top BM25 hits, MMR rearranges them so a more diverse result appears in the top-3.
2. `search-project-boost.test.ts` — Seeds the corpus, runs a query with `context: "project:zoom"` (no `strict`). Asserts: (a) cross-project results appear in the result set; (b) in-project results outrank an equivalent cross-project result.
3. `search-recall-events.test.ts` — Seeds the corpus, runs a search, waits for the async log to settle (small poll loop), asserts: (a) exactly N rows in `recall_events` where N = returned result count; (b) `thoughts.recall_count` incremented by 1 for each returned id; (c) `thoughts.last_recalled_at` is within the last few seconds.
4. `search-strict-flag.test.ts` — Seeds the corpus, runs a query with `context: "project:zoom,strict:true"`. Asserts only `project = zoom` results returned.
5. `search-recall-quality.test.ts` — Loops over the 10 query/expected-id pairs and asserts ≥ 8/10 (>80%) recall of expected ids in top-10.

## Out of Scope

- **Feedback API (`helpful` / `irrelevant`)** — deferred to a new follow-up story; design §5.2 reference preserved in that story's notes.
- **`recall_events` retention / cleanup** — ST-028 (worker observability) will own retention rules across audit tables. ST-005 leaves the table un-pruned.
- **Exposing recall metrics via the existing `thought_stats` tool** — ST-028 owns the new `stats` MCP tool that surfaces recall counts.
- **Schema migration framework** (Flyway / drizzle-kit / etc.) — ST-005 follows ST-022 precedent (direct schema.sql edit + `ALTER ... IF NOT EXISTS` snippet).
- **Tuning MMR λ or boost multiplier via configuration** — both are hard-coded constants (λ = 0.7, boost = 1.2) per the ACs. A future evaluation story can revisit tuning.
- **Cross-project transfer scoring** — boost is a simple multiplier; no entity-based or topic-similarity transfer logic in this story.

## Design References

- Hybrid search overview: [docs/investigations/memory-architecture-design/06-search-retrieval-strategy/01-1-hybrid-search-fts5-semantic.md](../../../docs/investigations/memory-architecture-design/06-search-retrieval-strategy/01-1-hybrid-search-fts5-semantic.md)
- RRF mechanics: [docs/investigations/memory-architecture-design/06-search-retrieval-strategy/02-2-reciprocal-rank-fusion-rrf.md](../../../docs/investigations/memory-architecture-design/06-search-retrieval-strategy/02-2-reciprocal-rank-fusion-rrf.md)
- MMR diversity: [docs/investigations/memory-architecture-design/06-search-retrieval-strategy/03-3-mmr-diversity-pattern-separation.md](../../../docs/investigations/memory-architecture-design/06-search-retrieval-strategy/03-3-mmr-diversity-pattern-separation.md)
- Recall tracking flow: [docs/investigations/memory-architecture-design/05-recall-tracking-and-promotion-scoring.md](../../../docs/investigations/memory-architecture-design/05-recall-tracking-and-promotion-scoring.md)
- Current `search_thoughts` implementation: [server/index.ts:122-187](../../../server/index.ts#L122-L187)
- Current `parseContext` grammar: [server/src/parseContext.ts](../../../server/src/parseContext.ts)
- Schema baseline: [server/db/schema.sql](../../../server/db/schema.sql)
- ST-022 test pattern precedent: `server/tests/` (integration tests via Docker Compose stack)

## Acceptance Criteria (from board, refined)

1. MMR diversity re-ranking (λ = 0.7) applied over the top-K post-RRF results in `search_thoughts`. Rows with NULL embedding skip MMR and retain RRF rank.
2. Project boosting: 1.2× score multiplier applied to results whose `project` matches the `context.project`. Cross-project results are returned by default.
3. `strict:true` in the `context` grammar restores hard-filter behaviour (only in-project results returned).
4. `recall_events` table created (columns per §In Scope). Indexed on `(thought_id, created_at DESC)`.
5. Every `search_thoughts` call asynchronously writes one `recall_events` row per returned result and increments `thoughts.recall_count` / refreshes `thoughts.last_recalled_at` for each returned id. Failure of the async log does not affect the search response.
6. `parseContext` extended with `strict?: boolean` field. Existing callers unaffected.
7. Default `limit` unchanged (10), configurable up to 100.
8. Integration tests: seeded corpus achieves ≥ 80% recall (≥ 8/10 queries) on the test-pair set; a dedicated MMR test demonstrates that near-duplicate top hits are diversified out of the top-3.
9. Existing ST-022 graph tests and any prior `search_thoughts` smoke tests still pass.

## Downstream / Follow-up

- Create a new backlog story: **"Feedback API (`report_feedback` tool + feedback_events)"** — design §5.2; not blocking ST-008 but valuable for active feedback once an agent harness is wired to call it.
- ST-008 (consolidation worker) will read `recall_events` and `thoughts.recall_count` for its scoring inputs — ensure the indexes added in ST-005 cover ST-008's expected query shape (windowed counts per `thought_id`).

## Next Step

PO: compact context, then invoke `/plan` with this query packet path to produce the ExecPlan in Phase 2.
