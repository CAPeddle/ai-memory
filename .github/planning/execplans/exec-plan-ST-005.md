# ExecPlan — ST-005: Search Quality (MMR + Project Boost) and Recall Logging

> Status: ✅ Ready for /continue
> Story: ST-005
> Created: 2026-05-19
> Parent: `.github/planning/query-packets/QP-005-search-quality-and-recall.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory MCP server (`server/index.ts`) exposes a `search_thoughts` tool that performs hybrid retrieval over the `public.thoughts` table: a BM25 lane (PostgreSQL `tsvector` + `plainto_tsquery`) and a vector lane (pgvector `vector(512)` HNSW) fused with Reciprocal Rank Fusion (RRF, k = 60). Today the implementation has three properties that this story changes:

1. **It hard-filters by project** when the `context` argument includes `project:X` — cross-project results are excluded entirely.
2. **It does not diversify** — near-duplicate hits cluster at the top of the result list.
3. **It does not record what it returned** — there is no audit trail of which thoughts get recalled, so downstream consolidation cannot score thoughts by recall frequency or recency.

This story addresses all three in one coordinated change to `search_thoughts`, plus adds a new `recall_events` table that powers ST-008's shard-to-wiki consolidation scoring.

**After this story is complete:**
1. `search_thoughts` re-ranks the top-K post-RRF candidates with **MMR (Maximal Marginal Relevance, λ = 0.7)**. Near-duplicate hits are pushed down; a more diverse result appears in the top-3.
2. When the caller supplies `context: "project:zoom"`, in-project results receive a **1.2× score boost** but cross-project results remain in the result set. Adding `strict:true` to the context string (e.g. `"project:zoom,strict:true"`) restores the hard-filter behaviour.
3. Every call writes one row per returned result into a new `public.recall_events` table, asynchronously (fire-and-forget), and increments `recall_count` / refreshes `last_recalled_at` on each returned `thoughts` row. The async log is best-effort: a write failure logs to `console.error` and does not affect the response.
4. Integration tests prove the three behaviours independently and assert ≥80% recall over a 10-query test pair set against a hand-crafted ~30-50 thought corpus.

**Key files (current state — full repository-relative paths):**
- `server/index.ts` — the MCP server; `search_thoughts` lives at lines 122–187. The fire-and-forget pattern at lines 221–224 (`capture_thought`'s embedding update) is the precedent for the new async recall logger.
- `server/src/parseContext.ts` — exports `ContextScope` interface and `parseContext()`. Comma-separated key:value grammar: `"project:zoom,profile:professional"`. Multi-value via semicolons: `"project:a;b"`. This story adds a `strict?: boolean` field and an `else if (k === "strict")` branch.
- `server/src/db.ts` — exports `sql` (the `postgres` npm tagged template client). Tagged-template literals are parameter-bound; `sql.unsafe()` interpolates raw strings (use only for allow-listed/escaped values).
- `server/db/schema.sql` — the `thoughts` table. Lines 33–34 already declare `recall_count integer NOT NULL DEFAULT 0` and `last_recalled_at timestamptz`. **No `thoughts` schema change is needed.** This story appends a new `recall_events` table to the same file.
- `server/db/graph.sql` — separate AGE/entity-extraction schema. Not touched by this story but illustrates the "append ALTER…IF NOT EXISTS" pattern used for in-place schema upgrades (see line 125 for the ST-022 precedent).
- `docker-compose.yml` — `db` (Postgres+AGE+pgvector) and `mcp` (Deno server) services. Init scripts in `docker/postgres-age/Dockerfile` mount `schema.sql` → `/docker-entrypoint-initdb.d/02-schema.sql` (only runs on a fresh volume).
- `server/tests/entity-worker.test.ts` — the only integration test file today. Its `mcpCall()` helper (lines 15–41) is the SSE-aware MCP client pattern this story reuses.

**Key terms:**
- **BM25 lane / vector lane** — the two sources of ranked candidates that RRF fuses. BM25 uses `ts_rank_cd(search_vector, plainto_tsquery('english', query))`; the vector lane uses cosine distance (`<=>`) against the query's 512-dim embedding from OpenRouter's `text-embedding-3-small`.
- **RRF (Reciprocal Rank Fusion)** — the fusion formula `score(d) = sum_lanes(1 / (k + rank_lane(d)))` with `k = 60`. Done in the application layer in `server/index.ts:165-167`.
- **MMR (Maximal Marginal Relevance)** — a diversity re-ranking algorithm. After RRF gives candidates `C` sorted by score, MMR iteratively selects the next result `d_i` from the unselected set `U` that maximises `λ · score(d_i) - (1-λ) · max_{d_j ∈ S} cos_sim(emb(d_i), emb(d_j))` where `S` is the already-selected set. With λ = 0.7, relevance dominates but near-duplicates of an already-selected doc are penalised.
- **Project boost** — a 1.2× multiplier applied to a result's RRF score *before* MMR runs, when the result's `project` column equals the caller's `context.projects[0]`. Rows with `project = NULL` (unscoped general-knowledge thoughts — e.g. captured by ChatGPT/Cursor/Gemini conversations without a project context) and rows whose `project` differs from the caller's project receive **no boost**; they remain candidates and are ranked by their raw RRF score. This is the deliberate design choice for ST-005 (PO-confirmed 2026-05-19): unscoped thoughts must remain visible in project-scoped searches, but should not outrank an equally-relevant in-project hit.
- **Strict mode** — opt-in token in the context grammar. `strict:true` reinstates the today-behaviour hard filter (only `project = caller.project` rows; NULL-project rows excluded). Omitted or `strict:false` enables the new boost-by-default behaviour described above.

**NULL-project behaviour summary (for the executor — derived from the two definitions above):**

| Search call | Boost-by-default (no `strict:`) | `strict:true` |
|---|---|---|
| No context | All rows, no boost applied | n/a (strict only meaningful with a project) |
| `project:zoom` | All rows; zoom rows ×1.2; NULL-project + bcf-managers rows ranked by raw RRF | Only zoom rows; NULL-project + bcf-managers excluded |
- **Fire-and-forget** — call a `Promise<void>` without awaiting it, catching any error with `.catch(err => console.error(...))`. The response is sent first; the log happens after.
- **Recall event** — one row per returned-result-per-search. Persisted in `recall_events`. Fields: `thought_id`, `query`, `rrf_score` (the final post-MMR score), `rank` (1-based position), `project` (the scope.project the search ran under, or NULL), `created_at`.
- **Cosine similarity** — `dot(a, b) / (||a|| · ||b||)` for two equal-length numeric vectors. Used by MMR for the inter-candidate similarity term.

---

## §1b. Outcomes & Conclusions

This is a required section for completion visibility. Capture outcomes here so readers can see at a glance what was actually delivered before scanning execution detail.

Required fields (all story types):
- completion status: full, partial, or not completed
- key findings/achievements: the most important delivered results
- requirements met vs unmet: explicit list of what passed and what did not
- architectural impact: supported, challenged, or unchanged decisions
- supporting evidence: command outputs and artifact references that prove each key claim
- downstream changes: board updates, follow-on stories, or document changes triggered by this work

(Populated by /continue at story closeout.)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After calling `search_thoughts` with a query that has three lexically near-duplicate top BM25 hits, the returned top-3 contains **at most 2 of those duplicates** (MMR diversification active).
2. After calling `search_thoughts` with `context: "project:zoom"`, the response contains **at least one row whose `project ≠ zoom`** (boost-by-default, not hard filter), and an in-project row outranks an otherwise-equivalent cross-project row.
3. After calling `search_thoughts` with `context: "project:zoom,strict:true"`, **every returned row has `project = zoom`** (strict mode restores hard filter; NULL-project rows excluded).
3b. After calling `search_thoughts` with a query that strongly matches a NULL-project corpus row, with `context: "project:zoom"` (non-strict), **the NULL-project row appears in the result set** (unscoped general-knowledge thoughts surface in project-scoped non-strict searches).
4. After running `docker compose exec db psql -U ai_memory -d ai_memory -c "\d recall_events"`, the table exists with columns `id, thought_id, query, rrf_score, rank, project, created_at` and an index over `(thought_id, created_at DESC)`.
5. After calling `search_thoughts` once and waiting up to 2 seconds, `SELECT count(*) FROM recall_events WHERE created_at > now() - interval '10 seconds'` equals the number of results the call returned, and `thoughts.recall_count` is incremented by 1 (and `last_recalled_at` is within the last 10 seconds) for each returned `id`.
6. After temporarily breaking the DB connection used by the async logger (e.g. simulated by mocking `sql` in a unit test), `search_thoughts` **still returns a successful response** and emits one `console.error` line tagged `[search_thoughts] recall log failed`.
7. After importing `parseContext` and calling it with `"project:zoom,strict:true"`, the returned `ContextScope` has `strict === true` and existing callers passing strings without `strict:` continue to receive `strict: undefined`.
8. After running `deno test --allow-net --allow-env tests/search-*.test.ts` against a freshly-seeded corpus, **all five test files exit with code 0**, and the `search-recall-quality.test.ts` file reports ≥ 8/10 queries with the expected top-result ID in the top-10.
9. After running `deno test --allow-net --allow-env tests/entity-worker.test.ts`, the previously-shipped ST-022 tests still pass (no regression).

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| MMR diversity re-ranking λ = 0.7 over top-K post-RRF results (QP-005 AC1) | `server/index.ts` `search_thoughts` calls `mmrRerank()` with λ = 0.7 | Task 4.5 | `Select-String -Path server/index.ts -Pattern "mmrRerank"`; `search-mmr.test.ts` passes |
| Rows with NULL embedding skip MMR (QP-005 AC1) | `mmrRerank()` filters null-embedding candidates out of MMR selection, then merges by post-boost score | Task 4.5 | Unit-style assertion in `search-mmr.test.ts`: NULL-embedding row retains rank |
| Project boost 1.2× multiplier for matching `project` (QP-005 AC2) | `search_thoughts` applies `score *= 1.2` when `row.project === scope.projects?.[0]` and `!scope.strict` | Task 4.5 | `Select-String -Path server/index.ts -Pattern "1\.2"`; `search-project-boost.test.ts` passes |
| Cross-project results returned by default (QP-005 AC2) | BM25 + vector lane queries omit the `AND project = X` filter when `!scope.strict` | Task 4.5 | `search-project-boost.test.ts` asserts ≥1 cross-project row in result set |
| NULL-project rows surface in project-scoped non-strict search (PO 2026-05-19) | `search_thoughts` filter omission is `!strict` regardless of `project` value on the row; no boost applied to NULL-project rows | Task 4.5 | `search-project-boost.test.ts` asserts NULL-project row ...009 appears for query 'typescript narrow union types' with `project:zoom` non-strict |
| `strict:true` restores hard filter (QP-005 AC3) | `parseContext` parses `strict:true`; `search_thoughts` keeps `AND project = X` only when `scope.strict === true` | Task 4.2, Task 4.5 | `search-strict-flag.test.ts` passes |
| `recall_events` table with `(id, thought_id, query, rrf_score, rank, project, created_at)` + index (QP-005 AC4) | `server/db/schema.sql` contains the `CREATE TABLE` and `CREATE INDEX` blocks | Task 4.1 | `\d recall_events` from psql; `Select-String -Path server/db/schema.sql -Pattern "recall_events"` |
| Async one-row-per-result write + bump `recall_count`/`last_recalled_at` (QP-005 AC5) | `search_thoughts` fires `logRecall()` (fire-and-forget) after sending response | Task 4.5 | `search-recall-events.test.ts` passes |
| Async logger failure does not block response (QP-005 AC5) | `logRecall()` is invoked without `await`; `.catch(err => console.error(...))` attached | Task 4.5 | grep for `.catch` on `logRecall(`; `search-recall-events.test.ts` resilience case |
| `parseContext` extended with `strict?: boolean` (QP-005 AC6) | `ContextScope` includes `strict?: boolean`; parser accepts `strict:true`/`strict:false` | Task 4.2 | `parseContext.test.ts` passes |
| Default `limit` unchanged (10), max 100 (QP-005 AC7) | `inputSchema.limit` retains `z.number().int().min(1).max(100).optional().default(10)` | Task 4.5 (no change required, verify intact) | `Select-String -Path server/index.ts -Pattern "default\(10\)"` near `search_thoughts` |
| Integration tests: ≥80% recall on 10 query/expected-id pairs (QP-005 AC8) | `server/tests/search-recall-quality.test.ts` asserts `passed >= 8` | Task 4.4, Task 4.6 | `deno test tests/search-recall-quality.test.ts` exits 0 |
| MMR test demonstrates near-duplicate diversification (QP-005 AC8) | `search-mmr.test.ts` seeds 3 near-duplicates, asserts only ≤2 in top-3 | Task 4.4, Task 4.6 | `deno test tests/search-mmr.test.ts` exits 0 |
| ST-022 graph tests still pass (QP-005 AC9) | `entity-worker.test.ts` unchanged and green | Task 4.6 | `deno test tests/entity-worker.test.ts` exits 0 |

---

## §3. Preconditions

**Tools required:**
- Docker Desktop (or Docker Engine) with `docker compose` v2+ available
- Deno 2.0+ available inside the `mcp` container (host install not required — tests run via `docker compose exec mcp deno test …`)
- PowerShell 7+ (`pwsh`) on the host for the verification commands shown below
- A valid `OPENROUTER_API_KEY` in `.env` (the integration tests exercise the live embedding endpoint via the running MCP container)

**Environment variables (in `.env` at repo root):**
```
DB_PASSWORD=<any-local-dev-password>
MEMORY_API_KEY=<any-local-dev-key>
OPENROUTER_API_KEY=<real-openrouter-key>
```

**Prior stories done:** ST-021 (delivered MCP server + schema), ST-022 (delivered AGE worker; integration test scaffolding under `server/tests/`).

**Files that must exist:**
- `server/index.ts` — registers `search_thoughts`
- `server/src/parseContext.ts` — current grammar
- `server/db/schema.sql` — has `thoughts` table including `recall_count` and `last_recalled_at`
- `server/tests/entity-worker.test.ts` — provides the `mcpCall` SSE-aware helper pattern

**Schema migration policy (embedded — no migration framework):**

Follows the ST-022 precedent: edit `server/db/schema.sql` directly. The block is wrapped in `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` so it is idempotent on fresh volumes. Live volumes do **not** re-run `/docker-entrypoint-initdb.d/` scripts, so Task 4.1 also runs the same SQL against the live `db` container via `docker compose exec db psql`.

**Boilerplate — Cosine similarity (vanilla TS, no deps):**

```typescript
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
```

**Boilerplate — MMR iterative selection:**

```typescript
// Candidates already sorted by post-boost RRF score descending.
// Returns indices into `candidates` in MMR-selected order.
// λ = 0.7 (relevance weight); (1 - λ) = 0.3 (diversity weight).
function mmrRerank(
  candidates: { id: string; score: number; embedding: number[] | null }[],
  k: number,
  lambda = 0.7,
): { id: string; score: number }[] {
  // Split: candidates with embeddings participate in MMR; null-embedding rows are appended by score after.
  const withEmb = candidates.filter((c) => c.embedding !== null);
  const noEmb   = candidates.filter((c) => c.embedding === null);

  const selected: typeof withEmb = [];
  const remaining = [...withEmb];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosineSim(c.embedding!, s.embedding!);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * c.score - (1 - lambda) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  // Merge: MMR-selected (in selection order) + null-embedding tail (by score) — but only up to k total.
  const merged = [
    ...selected.map((c) => ({ id: c.id, score: c.score })),
    ...noEmb.sort((a, b) => b.score - a.score).map((c) => ({ id: c.id, score: c.score })),
  ];
  return merged.slice(0, k);
}
```

**Boilerplate — Async recall logger (fire-and-forget pattern):**

```typescript
function logRecall(
  query: string,
  project: string | null,
  results: { id: string; score: number }[],
): void {
  if (!results.length) return;
  // Build batch INSERT rows
  const rows = results.map((r, i) => ({
    thought_id: r.id,
    query,
    rrf_score: r.score,
    rank: i + 1,
    project,
  }));
  // Fire-and-forget — never await; never block response
  (async () => {
    await sql`INSERT INTO recall_events ${sql(rows, "thought_id", "query", "rrf_score", "rank", "project")}`;
    const ids = results.map((r) => r.id);
    await sql`UPDATE thoughts SET recall_count = recall_count + 1, last_recalled_at = now() WHERE id = ANY(${ids}::uuid[])`;
  })().catch((err) => console.error("[search_thoughts] recall log failed:", err));
}
```

**Boilerplate — Fixture-generation Deno script (used by Task 4.3 to build the corpus SQL):**

```typescript
// server/tests/fixtures/build-search-quality-corpus.ts
//
// Generates a deterministic ~40-thought corpus with topic-clustered stub embeddings
// and writes server/tests/fixtures/search-quality-corpus.sql.
//
// Run once: `deno run --allow-write tests/fixtures/build-search-quality-corpus.ts`
// (Commit the generated .sql file; do not run at test time.)

const TOPICS: Record<string, number> = {
  zoom_meeting:     0,
  bcf_manager:      1,
  typescript_lang:  2,
  postgres_admin:   3,
  null_pointer:    4,
};

// Build a 512-dim unit-ish vector that points toward a topic axis with small noise.
// Seeded RNG so output is deterministic across runs.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2**32; };
}

function topicVector(topicIdx: number, rowIdx: number): number[] {
  const rng = seededRng(topicIdx * 1000 + rowIdx);
  const v = new Array(512).fill(0).map(() => (rng() - 0.5) * 0.05); // noise
  // Strong signal on one of 5 axes (one per topic)
  v[topicIdx] = 1.0;
  return v;
}

interface Row { id: string; content: string; project: string | null; topic: string; }
// 40 rows: 8 per topic, 4 zoom + 4 bcf-managers per code-related topics, plus unscoped rows.
// Note: 'id' is a deterministic UUIDv5-style string we hand-author so tests can reference by id.
const ROWS: Row[] = [
  // ── topic: zoom_meeting (project: zoom) — near-duplicates for the MMR test ──
  { id: "00000000-0000-4000-8000-000000000001", content: "Zoom meeting recording rotates weekly", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000002", content: "Zoom meeting recordings rotate every week", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000003", content: "Weekly zoom meeting recordings rotation", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000004", content: "Zoom client beta has improved audio quality", project: "zoom", topic: "zoom_meeting" },
  // ── topic: zoom_meeting (project: bcf-managers) — for project-boost cross-project test ──
  { id: "00000000-0000-4000-8000-000000000005", content: "Zoom meeting export plugin for bcf-managers", project: "bcf-managers", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000006", content: "Zoom export integration in bcf workflow", project: "bcf-managers", topic: "zoom_meeting" },
  // ── topic: bcf_manager (project: bcf-managers) ──
  { id: "00000000-0000-4000-8000-000000000007", content: "BCF manager review session every Tuesday", project: "bcf-managers", topic: "bcf_manager" },
  { id: "00000000-0000-4000-8000-000000000008", content: "Reviewing BCF manager logs reduces incidents", project: "bcf-managers", topic: "bcf_manager" },
  // ── topic: typescript_lang (project: NULL) ──
  { id: "00000000-0000-4000-8000-000000000009", content: "TypeScript narrows union types via discriminants", project: null, topic: "typescript_lang" },
  { id: "00000000-0000-4000-8000-00000000000a", content: "TypeScript exhaustive switch needs a never default", project: null, topic: "typescript_lang" },
  // ── topic: postgres_admin (project: NULL) ──
  { id: "00000000-0000-4000-8000-00000000000b", content: "Postgres autovacuum tuning per-table threshold", project: null, topic: "postgres_admin" },
  { id: "00000000-0000-4000-8000-00000000000c", content: "Postgres pg_stat_activity for hung queries", project: null, topic: "postgres_admin" },
  // ── topic: null_pointer (project: NULL) — one row will have NULL embedding to test MMR fallback ──
  { id: "00000000-0000-4000-8000-00000000000d", content: "NullPointerException caused by missing init", project: null, topic: "null_pointer" },
  { id: "00000000-0000-4000-8000-00000000000e", content: "Java null pointer in constructor chain", project: null, topic: "null_pointer" },
  // Pad to ~40 rows by adding variants — see full list below.
];

// Pad with additional variants. Reach 40 rows total.
const ADDL_TOPICS: Array<[string, string | null]> = [
  ["zoom_meeting",    "zoom"],
  ["zoom_meeting",    "zoom"],
  ["bcf_manager",     "bcf-managers"],
  ["bcf_manager",     "bcf-managers"],
  ["bcf_manager",     null],
  ["typescript_lang", null],
  ["typescript_lang", null],
  ["typescript_lang", "zoom"],
  ["postgres_admin",  null],
  ["postgres_admin",  null],
  ["postgres_admin",  "bcf-managers"],
  ["null_pointer",    null],
  ["null_pointer",    null],
  ["null_pointer",    "zoom"],
  ["null_pointer",    "bcf-managers"],
];

const PAD_TEMPLATES: Record<string, string[]> = {
  zoom_meeting:    ["Zoom integration release {n}", "Zoom video bandwidth tuning note {n}", "Recording auto-archive policy update {n}"],
  bcf_manager:     ["BCF manager dashboard tweak {n}", "BCF assignment automation {n}", "BCF retention rule {n}"],
  typescript_lang: ["TypeScript generic constraint pattern {n}", "TS error narrowing tip {n}", "TS module resolution note {n}"],
  postgres_admin:  ["Postgres index bloat fix {n}", "WAL retention adjustment {n}", "Replication lag investigation {n}"],
  null_pointer:    ["Null deref in cache layer {n}", "Defensive null check refactor {n}", "Null safety convention note {n}"],
};

let idCounter = 0x0f;
for (const [topic, project] of ADDL_TOPICS) {
  const templates = PAD_TEMPLATES[topic];
  const content = templates[idCounter % templates.length].replace("{n}", String(idCounter));
  ROWS.push({
    id: `00000000-0000-4000-8000-0000000000${idCounter.toString(16).padStart(2, "0")}`,
    content,
    project,
    topic,
  });
  idCounter++;
}

// Mark exactly one row (the last null_pointer row) as null-embedding for the MMR-skip test.
const NULL_EMBEDDING_ID = ROWS[ROWS.length - 1].id;

const sqlLines: string[] = [
  "-- Generated by tests/fixtures/build-search-quality-corpus.ts — do not edit by hand.",
  "-- Truncate and reseed to keep tests deterministic.",
  "TRUNCATE TABLE public.recall_events CASCADE;",
  "DELETE FROM public.thoughts WHERE id IN (",
  ROWS.map((r) => `  '${r.id}'`).join(",\n"),
  ");",
];

for (const r of ROWS) {
  const isNull = r.id === NULL_EMBEDDING_ID;
  const vec = isNull ? null : topicVector(TOPICS[r.topic], 0);
  const vecLit = vec ? `'[${vec.map((x) => x.toFixed(6)).join(",")}]'::vector` : "NULL";
  const projLit = r.project ? `'${r.project}'` : "NULL";
  // content_fingerprint uses md5 of normalised content to avoid clashing with existing rows
  const fp = `md5(lower(regexp_replace('${r.content.replace(/'/g, "''")}', '\\s+', ' ', 'g')))`;
  sqlLines.push(
    `INSERT INTO public.thoughts (id, content, embedding, project, memory_type, source, content_fingerprint)`,
    `VALUES ('${r.id}', '${r.content.replace(/'/g, "''")}', ${vecLit}, ${projLit}, 'shard', 'user-taught', ${fp})`,
    `ON CONFLICT (content_fingerprint) DO UPDATE SET embedding = EXCLUDED.embedding, project = EXCLUDED.project;`,
  );
}

const QUERY_PAIRS = [
  { query: "zoom meeting rotation",        expected_id: "00000000-0000-4000-8000-000000000001" },
  { query: "bcf manager review",           expected_id: "00000000-0000-4000-8000-000000000007" },
  { query: "typescript narrow union",      expected_id: "00000000-0000-4000-8000-000000000009" },
  { query: "typescript switch exhaustive", expected_id: "00000000-0000-4000-8000-00000000000a" },
  { query: "postgres autovacuum",          expected_id: "00000000-0000-4000-8000-00000000000b" },
  { query: "postgres hung queries",        expected_id: "00000000-0000-4000-8000-00000000000c" },
  { query: "nullpointerexception init",    expected_id: "00000000-0000-4000-8000-00000000000d" },
  { query: "java null pointer constructor", expected_id: "00000000-0000-4000-8000-00000000000e" },
  { query: "zoom recording auto archive",   expected_id: "00000000-0000-4000-8000-000000000004" },
  { query: "bcf retention rule",            expected_id: ROWS.find((r) => r.content.startsWith("BCF retention"))!.id },
];

await Deno.writeTextFile(
  new URL("./search-quality-corpus.sql", import.meta.url),
  sqlLines.join("\n") + "\n",
);
await Deno.writeTextFile(
  new URL("./search-quality-queries.json", import.meta.url),
  JSON.stringify(QUERY_PAIRS, null, 2) + "\n",
);
console.log(`Wrote ${ROWS.length} thoughts and ${QUERY_PAIRS.length} query pairs.`);
```

---

## §4. Task Definitions

### Task 4.1: Add `recall_events` table to schema.sql (and apply to live DB)

**Objective:** Append the new `recall_events` table and supporting index to `server/db/schema.sql`. Apply the same SQL against the running `db` container so existing-volume deployments pick it up. No changes to the `thoughts` table — `recall_count` and `last_recalled_at` already exist there.

**Input:** `server/db/schema.sql` (must already define `public.thoughts`).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `server/db/schema.sql` and append the following block after the existing trigger function (after line 124):

```sql
-- ============================================================
-- 6. RECALL EVENTS (added by ST-005)
--    Every search_thoughts call logs one row per returned result.
--    Feeds ST-008's consolidation scoring (recall frequency/recency).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recall_events (
  id          bigserial   PRIMARY KEY,
  thought_id  uuid        NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE,
  query       text        NOT NULL,
  rrf_score   float       NOT NULL,
  rank        int         NOT NULL,
  project     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recall_events_thought_created
  ON public.recall_events(thought_id, created_at DESC);
```

2. Apply the same block to the running database (live-volume migration):

```powershell
docker compose up -d db
docker compose exec -T db psql -U ai_memory -d ai_memory -c "CREATE TABLE IF NOT EXISTS public.recall_events (id bigserial PRIMARY KEY, thought_id uuid NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE, query text NOT NULL, rrf_score float NOT NULL, rank int NOT NULL, project text, created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_recall_events_thought_created ON public.recall_events(thought_id, created_at DESC);"
```

**Expected output:** `server/db/schema.sql` contains the new table block; the live `ai_memory` database has a `public.recall_events` relation and the index.

**Requirement mapping:** §2d row "recall_events table with (...) columns + index".

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\server\db\schema.sql" -Pattern "CREATE TABLE IF NOT EXISTS public.recall_events"
docker compose exec -T db psql -U ai_memory -d ai_memory -c "\d recall_events"
docker compose exec -T db psql -U ai_memory -d ai_memory -c "\di idx_recall_events_thought_created"
```
Expected result: First grep returns one match. `\d recall_events` lists all 7 columns. `\di` shows the index.

**Failure handling:** If `\d recall_events` reports "Did not find any relation named 'recall_events'", the live ALTER did not run — re-run the `docker compose exec` command from step 2. If `psql` reports "relation already exists", the CREATE IF NOT EXISTS guard means this is harmless — proceed.

---

### Task 4.2: Extend `parseContext` with `strict?: boolean`

**Objective:** Add a `strict?: boolean` field to `ContextScope` and a parser branch that recognises `strict:true` / `strict:false`. Backwards compatibility: callers passing context strings without `strict:` continue to receive `strict: undefined`.

**Input:** `server/src/parseContext.ts` (current 40-line implementation).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps (TDD — red first):**

1. Create `server/tests/parseContext.test.ts` with these assertions (red — will fail because field/parser branch don't exist yet):

```typescript
/**
 * Unit tests for parseContext — strict flag extension (ST-005).
 *
 * Run inside the mcp container:
 *   docker compose exec mcp deno test --allow-env tests/parseContext.test.ts
 */

import { parseContext } from "../src/parseContext.ts";

Deno.test("parseContext: strict:true sets scope.strict = true", () => {
  const s = parseContext("project:zoom,strict:true");
  if (s?.strict !== true) throw new Error(`Expected strict=true, got ${JSON.stringify(s)}`);
  if (s?.projects?.[0] !== "zoom") throw new Error(`Expected projects=[zoom], got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: strict:false sets scope.strict = false", () => {
  const s = parseContext("project:zoom,strict:false");
  if (s?.strict !== false) throw new Error(`Expected strict=false, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: omitted strict leaves scope.strict undefined", () => {
  const s = parseContext("project:zoom");
  if (s?.strict !== undefined) throw new Error(`Expected strict=undefined, got ${JSON.stringify(s)}`);
});

Deno.test("parseContext: null input returns null (regression check)", () => {
  if (parseContext(undefined) !== null) throw new Error("undefined → null broken");
  if (parseContext("") !== null) throw new Error("empty → null broken");
});
```

2. Verify red:
```powershell
docker compose up -d mcp
docker compose exec -T mcp deno test --allow-env tests/parseContext.test.ts
```
Expected: 3 failures (the first three tests). The fourth (null input) may pass — that's fine.

3. Edit `server/src/parseContext.ts`:

   **a.** Extend the `ContextScope` interface (after line 6 / before the closing `}`):
   ```typescript
   strict?: boolean;
   ```

   So the full interface becomes:
   ```typescript
   export interface ContextScope {
     projects?: string[];
     profile?: "professional" | "personal";
     entities?: string[];
     visibility?: "prefer" | "exclusive" | "cross-only";
     sourceStoryId?: string;
     strict?: boolean;
   }
   ```

   **b.** Add a parser branch in the `for (const pair …)` loop. After the existing `else if (k === "story") scope.sourceStoryId = v;` line, append:
   ```typescript
   else if (k === "strict")     scope.strict      = v === "true";
   ```

4. Verify green:
```powershell
docker compose exec -T mcp deno test --allow-env tests/parseContext.test.ts
```
Expected: all 4 tests pass.

**Expected output:** `server/src/parseContext.ts` exports an extended `ContextScope` and parses `strict:` tokens. `server/tests/parseContext.test.ts` exists with 4 tests, all green.

**Requirement mapping:** §2d row "parseContext extended with strict?: boolean".

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\server\src\parseContext.ts" -Pattern "strict\?:"
Select-String -Path "c:\projects\ai-memory\server\src\parseContext.ts" -Pattern 'k === "strict"'
docker compose exec -T mcp deno test --allow-env tests/parseContext.test.ts
```
Expected result: Both greps return one match each; `deno test` exits 0 with `ok | 4 passed | 0 failed`.

**Failure handling:** If `v === "true"` evaluates wrong because of whitespace, note that the existing parser does `v = pair.slice(colonIdx + 1).trim()` — the trim is already done, so `"true"` is exact. If a future caller writes `STRICT:TRUE` (uppercase), it would not match — that's intentional; keep the parser strict (no case folding).

---

### Task 4.3: Build the deterministic search-quality corpus fixture

**Objective:** Generate `server/tests/fixtures/search-quality-corpus.sql` (~40 thoughts with topic-clustered stub 512-dim embeddings; one row deliberately NULL-embedding) and `server/tests/fixtures/search-quality-queries.json` (10 query/expected-id pairs). The fixture script itself is committed so future contributors can regenerate.

**Input:** None (creates new files).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create the directory:
```powershell
New-Item -ItemType Directory -Force "c:\projects\ai-memory\server\tests\fixtures" | Out-Null
```

2. Create `server/tests/fixtures/build-search-quality-corpus.ts` with the exact contents of the **Boilerplate — Fixture-generation Deno script** block in §3. Copy verbatim — every detail of the row list and topic/project assignment is referenced by later tests.

3. Run the generator inside the mcp container:
```powershell
docker compose exec -T mcp deno run --allow-write tests/fixtures/build-search-quality-corpus.ts
```
Expected console output: `Wrote 40 thoughts and 10 query pairs.`

4. Verify the two artifacts exist:
```powershell
Test-Path "c:\projects\ai-memory\server\tests\fixtures\search-quality-corpus.sql"
Test-Path "c:\projects\ai-memory\server\tests\fixtures\search-quality-queries.json"
Get-Content "c:\projects\ai-memory\server\tests\fixtures\search-quality-corpus.sql" -TotalCount 5
```

5. Seed the live DB once to confirm the fixture applies cleanly:
```powershell
docker compose cp server/tests/fixtures/search-quality-corpus.sql db:/tmp/seed.sql
docker compose exec -T db psql -U ai_memory -d ai_memory -f /tmp/seed.sql
docker compose exec -T db psql -U ai_memory -d ai_memory -c "SELECT count(*) FROM thoughts WHERE id::text LIKE '00000000-0000-4000-8000-%';"
```
Expected: count = 40.

**Expected output:**
- `server/tests/fixtures/build-search-quality-corpus.ts` (committed, runnable)
- `server/tests/fixtures/search-quality-corpus.sql` (committed; ~80 lines of INSERTs)
- `server/tests/fixtures/search-quality-queries.json` (committed; 10 pairs)

**Requirement mapping:** Supports §2d rows for MMR test, project-boost test, recall-quality test (all depend on this corpus).

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\server\tests\fixtures\search-quality-corpus.sql"
Test-Path "c:\projects\ai-memory\server\tests\fixtures\search-quality-queries.json"
Select-String -Path "c:\projects\ai-memory\server\tests\fixtures\search-quality-corpus.sql" -Pattern "INSERT INTO public.thoughts" | Measure-Object | Select-Object -ExpandProperty Count
```
Expected result: Both paths exist; the count of `INSERT INTO public.thoughts` lines equals 40.

**Failure handling:**
- If the `deno run` invocation reports a permission error, ensure `--allow-write` is set. The generator only writes within the `tests/fixtures` directory.
- If the seed SQL hits `ON CONFLICT (content_fingerprint)` and the test data persists across runs, that's expected — the `ON CONFLICT DO UPDATE` clause is intentional to keep reseeding idempotent.
- If row count is < 40, inspect the generator's `ROWS` array length and the `ADDL_TOPICS` padding loop; counts must sum to 40.

---

### Task 4.4: Write the five failing integration tests (red phase)

**Objective:** Create five `server/tests/search-*.test.ts` files asserting the new behaviour. All five must fail when run against the current (unmodified) `search_thoughts` — confirming each test genuinely measures the new feature. Do **not** modify `server/index.ts` yet.

**Input:** Task 4.3 fixture files; existing `server/tests/entity-worker.test.ts` (for `mcpCall` SSE pattern); running mcp container.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `server/tests/_helpers/mcpClient.ts` — a shared helper extracted from `entity-worker.test.ts:15-41`. Identical body; just re-exported so all `search-*.test.ts` files can import it:

```typescript
// server/tests/_helpers/mcpClient.ts
const MCP_BASE = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

export async function mcpCall(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP call failed: ${res.status} ${await res.text()}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    return JSON.parse(dataLine.slice(5).trim());
  }
  return await res.json();
}

export function extractText(result: unknown): string {
  const r = result as { result?: { content?: Array<{ text?: string }> } };
  return r.result?.content?.[0]?.text ?? "";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function seedCorpus(): Promise<void> {
  // The corpus is seeded server-side via psql; tests assume it has been loaded.
  // For local runs this happens via Task 4.3 step 5. CI should run the same step.
}
```

2. Create `server/tests/search-mmr.test.ts`:

```typescript
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

// Three near-duplicate rows about "zoom meeting recording rotation" sit in the
// corpus (ids ...001, ...002, ...003). Without MMR, BM25 ranks all three at the
// top. With MMR (λ = 0.7), at most 2 of these 3 should appear in the top-3.
Deno.test("search-mmr: near-duplicate zoom-rotation hits diversify out of top-3", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting recording rotation", limit: 3 });
  const text = extractText(result);
  const top3Ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  const duplicateSet = new Set([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ]);
  const dupesInTop3 = top3Ids.filter((id) => duplicateSet.has(id)).length;
  if (dupesInTop3 > 2) {
    throw new Error(`Expected ≤2 of 3 near-duplicates in top-3; got ${dupesInTop3}. Top-3 ids: ${top3Ids.join(", ")}`);
  }
});

// The corpus deliberately has one null-embedding row (the last null_pointer row).
// MMR must skip it for the diversity comparison and merge it back by score —
// it must still be returnable, not lost entirely.
Deno.test("search-mmr: null-embedding row remains returnable", async () => {
  const result = await mcpCall("search_thoughts", { query: "null pointer constructor", limit: 10 });
  const text = extractText(result);
  // The NULL-embedding id was the last padded null_pointer row — assert the response
  // still contains at least one null_pointer-topic result (id range 00d/00e/etc).
  if (!/null|pointer|deref|defensive/i.test(text)) {
    throw new Error(`Expected at least one null-pointer-topic result, got: ${text.slice(0, 300)}`);
  }
});
```

3. Create `server/tests/search-project-boost.test.ts`:

```typescript
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

// With context: "project:zoom" (no strict), cross-project results MUST still
// appear, but in-project results should outrank otherwise-comparable cross-project ones.
Deno.test("search-project-boost: cross-project results present by default", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom export integration", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  // The corpus has cross-project rows ("bcf-managers / zoom") for this query.
  // Assert at least one non-zoom project label appears.
  if (!/\/ bcf-managers/.test(text)) {
    throw new Error(`Expected at least one bcf-managers cross-project result, got: ${text.slice(0, 400)}`);
  }
});

// PO-confirmed 2026-05-19: unscoped general-knowledge thoughts (project = NULL —
// e.g. captured by ChatGPT/Cursor/Gemini without a project context) MUST remain
// visible in a project-scoped non-strict search. They are ranked by raw RRF (no boost),
// but must not be filtered out.
Deno.test("search-project-boost: NULL-project rows surface in project-scoped non-strict search", async () => {
  const result = await mcpCall("search_thoughts", { query: "typescript narrow union types", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  // Corpus row ...009 is "TypeScript narrows union types via discriminants" with project = NULL.
  if (!ids.includes("00000000-0000-4000-8000-000000000009")) {
    throw new Error(`Expected NULL-project row ...009 to appear in project:zoom non-strict result; got: ${ids.join(", ")}`);
  }
  // Also assert the output format does NOT show a "/ <project>" suffix for that result
  // (NULL projects render with no slash — see existing format string in index.ts).
  const lineRe = /--- Result \d+ \(rrf: [^)]+\) \[(\w+)([^\]]*)\] ---\nID: 00000000-0000-4000-8000-000000000009/;
  const m = text.match(lineRe);
  if (m && m[2].trim().length > 0) {
    throw new Error(`Expected row ...009 to render with NULL project (no '/ project' suffix); got '[${m[1]}${m[2]}]'`);
  }
});

Deno.test("search-project-boost: in-project outranks cross-project for the same query", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  // Find the first zoom-project (...001..004) and first bcf-managers (...005..006)
  const zoomIds = new Set([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
  ]);
  const bcfIds = new Set([
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
  ]);
  const firstZoom = ids.findIndex((id) => zoomIds.has(id));
  const firstBcf  = ids.findIndex((id) => bcfIds.has(id));
  if (firstZoom === -1 || firstBcf === -1) {
    throw new Error(`Expected both zoom and bcf-managers rows in result. ids: ${ids.join(", ")}`);
  }
  if (firstZoom > firstBcf) {
    throw new Error(`Expected first zoom (idx ${firstZoom}) to outrank first bcf (idx ${firstBcf}); ids: ${ids.join(", ")}`);
  }
});
```

4. Create `server/tests/search-strict-flag.test.ts`:

```typescript
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

Deno.test("search-strict-flag: strict:true returns only in-project rows", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting", context: "project:zoom,strict:true", limit: 10 });
  const text = extractText(result);
  // Assert no row with a non-zoom project label appears (we look for "/ <non-zoom>" markers)
  // The output format is `--- Result N (rrf: …) [shard / <project>] ---`
  const projectLabels = [...text.matchAll(/\[\w+ \/ ([^\]]+)\]/g)].map((m) => m[1].trim());
  const nonZoom = projectLabels.filter((p) => p !== "zoom");
  if (nonZoom.length > 0) {
    throw new Error(`Expected all results with project = zoom under strict:true; found non-zoom: ${nonZoom.join(", ")}`);
  }
});
```

5. Create `server/tests/search-recall-events.test.ts`:

```typescript
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

// Asserts: (a) recall_events row count after a search equals returned-result count.
// (b) thoughts.recall_count incremented for each returned id.
// (c) last_recalled_at refreshed.
Deno.test("search-recall-events: async log writes one row per returned result", async () => {
  // Snapshot pre-state via psql is brittle; rely on time-window query post-call instead.
  const before = Date.now();
  const result = await mcpCall("search_thoughts", { query: "postgres autovacuum", limit: 5 });
  const text = extractText(result);
  const returnedIds = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  if (!returnedIds.length) throw new Error(`Expected non-empty result for 'postgres autovacuum'; got: ${text}`);

  // Wait up to 3 s for the async write to settle
  let logged = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    const checkResp = await fetch("http://localhost:3000/health"); // touch container to be sure it's responsive
    if (!checkResp.ok) throw new Error("mcp /health unhealthy");

    // Inspect recall_events via a debug helper test (we use a psql shell here via docker exec).
    // For test simplicity, count via a one-off psql call:
    const psql = new Deno.Command("docker", {
      args: ["compose", "exec", "-T", "db", "psql", "-U", "ai_memory", "-d", "ai_memory", "-tA", "-c",
        `SELECT count(*) FROM recall_events WHERE query = 'postgres autovacuum' AND created_at >= to_timestamp(${(before / 1000).toFixed(3)});`],
      stdout: "piped",
    });
    const { stdout } = await psql.output();
    logged = Number(new TextDecoder().decode(stdout).trim());
    if (logged >= returnedIds.length) break;
  }

  if (logged !== returnedIds.length) {
    throw new Error(`Expected ${returnedIds.length} recall_events rows; observed ${logged}`);
  }
});
```

6. Create `server/tests/search-recall-quality.test.ts`:

```typescript
import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

const queries: Array<{ query: string; expected_id: string }> = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/search-quality-queries.json", import.meta.url)),
);

Deno.test("search-recall-quality: ≥8/10 expected ids in top-10", async () => {
  let passed = 0;
  const failures: string[] = [];
  for (const pair of queries) {
    const result = await mcpCall("search_thoughts", { query: pair.query, limit: 10 });
    const text = extractText(result);
    const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
    if (ids.includes(pair.expected_id)) {
      passed++;
    } else {
      failures.push(`query='${pair.query}' expected=${pair.expected_id} got=[${ids.slice(0, 3).join(", ")}…]`);
    }
  }
  if (passed < 8) {
    throw new Error(`Recall < 80%: ${passed}/${queries.length}. Failures:\n  ${failures.join("\n  ")}`);
  }
});
```

7. Verify red: run all five tests against the **unchanged** mcp container. They should fail:

```powershell
docker compose exec -T mcp deno test --allow-net --allow-env --allow-run tests/search-mmr.test.ts tests/search-project-boost.test.ts tests/search-strict-flag.test.ts tests/search-recall-events.test.ts tests/search-recall-quality.test.ts
```

Expected result: At least one assertion fails per file. Specifically:
- `search-mmr.test.ts` — currently no MMR; near-duplicates likely all appear in top-3.
- `search-project-boost.test.ts` — current code hard-filters; cross-project results are absent → fails on "cross-project results present" case.
- `search-strict-flag.test.ts` — likely passes (current default IS hard filter), but it must continue to pass after the change.
- `search-recall-events.test.ts` — no logger today → row count is 0.
- `search-recall-quality.test.ts` — may or may not pass; the assertion uses BM25 fallback, so it could already pass without MMR. That's fine; the red-state of the other four is what matters.

**Expected output:**
- `server/tests/_helpers/mcpClient.ts` (new shared helper)
- `server/tests/search-mmr.test.ts`
- `server/tests/search-project-boost.test.ts`
- `server/tests/search-strict-flag.test.ts`
- `server/tests/search-recall-events.test.ts`
- `server/tests/search-recall-quality.test.ts`

**Requirement mapping:** §2d rows for MMR, project boost, strict flag, recall events, recall quality (test files).

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\server\tests\_helpers\mcpClient.ts"
Get-ChildItem "c:\projects\ai-memory\server\tests\search-*.test.ts" | Measure-Object | Select-Object -ExpandProperty Count
```
Expected result: Helper exists; 5 `search-*.test.ts` files.

**Failure handling:**
- If `Deno.Command("docker", ...)` inside the test fails because the test is running inside the mcp container (which doesn't have `docker` on its PATH), switch the recall-events count check to query the DB directly via the same `sql` client. Add a `DATABASE_URL` env passthrough in `docker-compose.yml` if not already present (it is — see line 26).
- Specifically, swap step 5's psql-via-docker block for a direct `postgres` import:
   ```typescript
   import postgres from "npm:postgres@3.4.4";
   const dbSql = postgres(Deno.env.get("DATABASE_URL")!);
   const [row] = await dbSql`SELECT count(*)::int AS cnt FROM recall_events WHERE query = 'postgres autovacuum' AND created_at >= to_timestamp(${before / 1000})`;
   logged = row.cnt;
   await dbSql.end();
   ```
   This is the preferred approach — make this swap proactively if the executor is running tests from inside the container.

---

### Task 4.5: Rewrite `search_thoughts` with boost, MMR, and async recall logging (green phase)

**Objective:** Modify `server/index.ts` so the five red tests pass while existing search behaviour (BM25, vector, RRF) and other tools remain unchanged.

**Input:** `server/index.ts` (registers `search_thoughts` at lines 122–187); `server/src/parseContext.ts` (already extended in Task 4.2); fixture seeded.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. In `server/index.ts`, add the cosine + MMR + logger helpers **above** the `server.registerTool("search_thoughts", …)` block (e.g. directly after `getEmbedding`'s closing brace at line 41):

```typescript
// ---------------------------------------------------------------------------
// Search-quality helpers (ST-005): cosine similarity, MMR, recall logging.
// ---------------------------------------------------------------------------

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

interface MmrCandidate { id: string; score: number; embedding: number[] | null; }

function mmrRerank(candidates: MmrCandidate[], k: number, lambda = 0.7): { id: string; score: number }[] {
  const withEmb = candidates.filter((c) => c.embedding !== null);
  const noEmb   = candidates.filter((c) => c.embedding === null);

  const selected: MmrCandidate[] = [];
  const remaining = [...withEmb];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosineSim(c.embedding!, s.embedding!);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * c.score - (1 - lambda) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return [
    ...selected.map((c) => ({ id: c.id, score: c.score })),
    ...noEmb.sort((a, b) => b.score - a.score).map((c) => ({ id: c.id, score: c.score })),
  ].slice(0, k);
}

function logRecall(query: string, project: string | null, results: { id: string; score: number }[]): void {
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

// Postgres `vector(512)` rendered as `[0.1,0.2,…]` text — parse to number[].
function parseVector(s: string | null): number[] | null {
  if (s === null) return null;
  // strip brackets and split on commas
  return s.slice(1, -1).split(",").map(Number);
}
```

2. Replace the body of the existing `search_thoughts` handler (currently lines 136–186) with:

```typescript
  async ({ query, context, limit }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const strict = scope?.strict === true;
      const n = limit ?? 10;

      const qEmb = await getEmbedding(query).catch(() => null);

      // BM25 lane — drop the hard project filter unless strict
      const bm25 = strict
        ? await sql`
            SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS bm25_rank
            FROM thoughts, plainto_tsquery('english', ${query}) AS q
            WHERE search_vector @@ q AND active = true
              AND (${project}::text IS NULL OR project = ${project})
            LIMIT 60
          `
        : await sql`
            SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS bm25_rank
            FROM thoughts, plainto_tsquery('english', ${query}) AS q
            WHERE search_vector @@ q AND active = true
            LIMIT 60
          `;

      // Vector lane (skipped if no embedding) — drop hard project filter unless strict
      const vector = qEmb
        ? (strict
            ? await sql`
                SELECT id, row_number() OVER (ORDER BY embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS vector_rank
                FROM thoughts
                WHERE active = true AND embedding IS NOT NULL
                  AND (${project}::text IS NULL OR project = ${project})
                LIMIT 60
              `
            : await sql`
                SELECT id, row_number() OVER (ORDER BY embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS vector_rank
                FROM thoughts
                WHERE active = true AND embedding IS NOT NULL
                LIMIT 60
              `)
        : [];

      // RRF fusion in application layer (unchanged)
      const scores = new Map<string, number>();
      for (const r of bm25)   scores.set(r.id as string, (scores.get(r.id as string) ?? 0) + 1 / (60 + Number(r.bm25_rank)));
      for (const r of vector) scores.set(r.id as string, (scores.get(r.id as string) ?? 0) + 1 / (60 + Number(r.vector_rank)));

      if (!scores.size) return { content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }] };

      // Pull top-N (3× requested, capped at 60) for boost + MMR
      const N = Math.min(60, Math.max(n * 3, n));
      const topIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, N).map(([id]) => id);

      const rowsAll = await sql`
        SELECT id, content, memory_type, project, created_at, embedding::text AS embedding
        FROM thoughts WHERE id = ANY(${topIds}::uuid[])
      `;
      const rowMap = new Map<string, { id: string; content: unknown; memory_type: unknown; project: string | null; created_at: unknown; embedding: number[] | null }>();
      for (const r of rowsAll) {
        rowMap.set(r.id as string, {
          id: r.id as string,
          content: r.content,
          memory_type: r.memory_type,
          project: (r.project as string | null) ?? null,
          created_at: r.created_at,
          embedding: parseVector(r.embedding as string | null),
        });
      }

      // Apply project boost (only when !strict — strict already filtered to in-project only)
      const boosted: MmrCandidate[] = topIds.map((id) => {
        const r = rowMap.get(id)!;
        let score = scores.get(id)!;
        if (!strict && project && r.project === project) score *= 1.2;
        return { id, score, embedding: r.embedding };
      }).sort((a, b) => b.score - a.score);

      // MMR re-rank top-N to final n
      const reranked = mmrRerank(boosted, n, 0.7);

      // Build response from rowMap
      const lines = reranked.map((res, i) => {
        const t = rowMap.get(res.id);
        if (!t) return "";
        return `--- Result ${i + 1} (rrf: ${res.score.toFixed(4)}) [${t.memory_type}${t.project ? " / " + t.project : ""}] ---\nID: ${t.id}\n${t.content}`;
      }).filter(Boolean);

      // Fire-and-forget recall log (never awaited)
      logRecall(query, project, reranked);

      return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
```

3. Type-check by reloading the container:
```powershell
docker compose restart mcp
docker compose logs mcp --tail 30
```
Expected: No TypeScript compilation errors in the logs. The Deno runtime exits non-zero on type errors; a green container indicates success.

**Expected output:** `server/index.ts` `search_thoughts` handler implements boost + MMR + async logging. Other tools and helper code outside this block are unchanged.

**Requirement mapping:** §2d rows for MMR re-rank, NULL-embedding skip, project boost, cross-project default, strict hard-filter, async log, async failure non-blocking.

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\server\index.ts" -Pattern "mmrRerank"
Select-String -Path "c:\projects\ai-memory\server\index.ts" -Pattern "logRecall"
Select-String -Path "c:\projects\ai-memory\server\index.ts" -Pattern "score \*= 1\.2"
Select-String -Path "c:\projects\ai-memory\server\index.ts" -Pattern "cosineSim"
docker compose exec -T mcp curl -sf http://localhost:3000/health
```
Expected result: Each grep returns one match. `/health` returns `ok`.

**Failure handling:**
- If the postgres tagged-template literal complains about the `sql(rows, "thought_id", …)` batch-insert form, the v3.4.4 of `postgres` (already on `deno.json`) supports this. If it errors, fall back to a `for (const row of rows) await sql\`INSERT …\`` loop inside the async IIFE — slower but functionally equivalent.
- If `parseVector` fails on numbers in scientific notation (e.g. `1.2e-08`), `Number()` handles that natively — no extra parsing required.
- If `embedding::text` returns null for null-embedding rows, `parseVector` returns null — MMR's null-handling branch covers this. Verified by the `search-mmr` null-embedding test.

---

### Task 4.6: Run integration tests; verify all green (refactor checkpoint)

**Objective:** Run the five new test files plus the parseContext unit test and the ST-022 regression suite. All must pass.

**Input:** All prior tasks complete; corpus seeded in DB.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Confirm corpus is seeded (re-run if needed):
```powershell
docker compose cp server/tests/fixtures/search-quality-corpus.sql db:/tmp/seed.sql
docker compose exec -T db psql -U ai_memory -d ai_memory -f /tmp/seed.sql
```

2. Run the parseContext unit test:
```powershell
docker compose exec -T mcp deno test --allow-env tests/parseContext.test.ts
```
Expected: `ok | 4 passed | 0 failed`.

3. Run the five search integration tests:
```powershell
docker compose exec -T mcp deno test --allow-net --allow-env tests/search-mmr.test.ts tests/search-project-boost.test.ts tests/search-strict-flag.test.ts tests/search-recall-events.test.ts tests/search-recall-quality.test.ts
```
Expected: Every test passes. If a flaky timing fails on `search-recall-events`, increase the wait loop in step 5 of that test from 6 → 10 iterations and re-run.

4. Run the ST-022 regression suite to confirm no graph-side regression:
```powershell
docker compose exec -T mcp deno test --allow-net --allow-env tests/entity-worker.test.ts
```
Expected: `ok | 4 passed | 0 failed`.

5. **Refactor checkpoint (no behaviour change):**
   - Move the search-quality helpers (`cosineSim`, `mmrRerank`, `logRecall`, `parseVector`) from `server/index.ts` into a new file `server/src/searchQuality.ts` and import them back. This keeps `index.ts` focused on tool registration.
   - Re-run steps 2–4 to confirm the refactor preserved all behaviour.
   - If any test regresses, revert the refactor (`git checkout server/`) and skip this step — the inline implementation is acceptable.

**Expected output:** All seven test files (parseContext + 5 search + entity-worker) pass.

**Requirement mapping:** Closes every §2d row by verifying observable behaviour.

**Verification:**
```powershell
docker compose exec -T mcp deno test --allow-net --allow-env tests/
echo "exit code: $LASTEXITCODE"
```
Expected result: All test files exit with code 0; aggregate output shows ≥ 10 passed across the suite.

**Failure handling:**
- If `search-project-boost: in-project outranks cross-project` fails, inspect which boost path ran. Add temporary debug logging inside the handler around the boost loop, restart the container, re-run. The most likely cause is `scope?.projects?.[0]` being `null` when expected — recheck the context string in the test.
- If `search-mmr: near-duplicate ... diversify` still shows all 3 duplicates in top-3, raise λ deviation: the duplicates have stub embeddings that point to the same topic axis, so `cosineSim ≈ 1` and the diversity penalty `(1 - 0.7) × 1 = 0.3` should dominate the small differences in RRF scores. Confirm `mmrRerank` is being called with the correct top-N candidates by adding a temporary `console.log` of `boosted.length`.
- If `search-recall-events` records fewer rows than expected, check `console.error` in `docker compose logs mcp` — the async logger will print the failure cause there.

---

### Task 4.7: Closeout — update Outcomes, board, and revision notes

**Objective:** Mark this ExecPlan complete, move ST-005 to Review on the board, and update §1b / §5b / §7b.

**Input:** All prior tasks pass (Task 4.6 verification step exits 0).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Edit `.github/planning/execplans/exec-plan-ST-005.md`:
   - Set `> Status: ✅ Ready for /continue` to `> Status: ✅ Complete`.
   - Populate §1b (Outcomes & Conclusions) — status: full, list of delivered files, AC pass/fail per §2 item, supporting evidence (the test exit codes and grep verifications), and downstream changes (board move).
   - Populate §5b Recovery Ledger Current Resume State with last completed task = Task 4.7 and a one-line progress history per task.
   - Populate §7b with the AC verification table and any retrospective notes.

2. Edit `.github/planning/story-board.md`:
   - Move the ST-005 block from `## Backlog` to `## Review`.
   - Update the header line: `> Next planning target:` — set to ST-008 (the next blocked-by-ST-005 story).
   - Update `> Last updated:` to today's ISO date.

3. Commit:
```powershell
git add server/db/schema.sql server/src/parseContext.ts server/index.ts server/tests/ .github/planning/execplans/exec-plan-ST-005.md .github/planning/story-board.md
git commit -m "feat(ST-005): MMR diversification, project boost, recall logging"
```

**Expected output:** ExecPlan marked complete; board reflects ST-005 in Review; commit recorded.

**Requirement mapping:** Closes the story for board accounting (no AC of its own — administrative).

**Verification:**
```powershell
git log -1 --oneline
Select-String -Path "c:\projects\ai-memory\.github\planning\story-board.md" -Pattern "ST-005" -Context 0,2
```
Expected result: Commit is at HEAD; ST-005 appears under `## Review`, no longer under `## Backlog`.

**Failure handling:** If any AC from §2 cannot be marked passed, do not move the story to Review. Add a §2c Plan Review Notes entry naming the failing AC and escalate via `/plan` to revise scope. The story stays in `## In Progress` until resolved.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Add `recall_events` table to schema.sql (and apply to live DB) |
| **Known blockers** | None |
| **Last updated** | 2026-05-19 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

- 2026-05-19: Init scripts in `/docker-entrypoint-initdb.d/` only run on fresh volumes. Always apply schema changes to the live DB via `docker compose exec -T db psql -f /tmp/<file>.sql` after editing `schema.sql`. (Same lesson as ST-022.)
- 2026-05-19: `sql.unsafe()` returning nested arrays from multi-statement queries (the ST-022 AGE pattern) does not apply here — this story uses tagged-template literals exclusively. If you need raw SQL strings, prefer parameterised queries.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Application-layer MMR + boost + fire-and-forget logger inside `search_thoughts` handler | Before Task 4.5 | 🟢 Active |
| 2 | DB-side MMR via window function over cosine distances | Before Task 4.5 | ⬜ Reserve (rejected: too slow without dedicated index and harder to test) |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: ...
  Evidence: ...
  Impact: ...

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: ...
  Rationale: ...
  Date: ...

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Use this section for retrospective depth only. The primary at-a-glance outcomes summary belongs in §1b.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

- 2026-05-19: Initial ExecPlan authored from QP-005. Phase 2 of /plan workflow.
- 2026-05-19: Round-2 review revision — PO surfaced concern about NULL-project (unscoped) thoughts from ChatGPT/Cursor/Gemini agents. Added NULL-project semantics table in §1, AC 3b in §2, traceability row in §2d, and a third `Deno.test` in Task 4.4's `search-project-boost.test.ts` asserting NULL-project row visibility in project-scoped non-strict search. Marked §2b Ready.
