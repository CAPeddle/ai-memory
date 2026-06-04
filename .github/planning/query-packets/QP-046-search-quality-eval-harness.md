# QP-046: Search-Quality Eval Harness (golden-set regression + recall@k baseline; gate for ST-054)

> Story: ST-046
> Status: Seed — ready for /plan Phase 2
> Created: 2026-06-04
> Seed: Story-board widening (2026-06-04) of ST-046 to serve as the ST-054 retrieval-robustness gate; PO collaborative scoping (this session)
> Companion: `.github/planning/execplans/exec-plan-ST-046.md` (to be rewritten in Phase 2; the existing file is the pre-widening narrow version)
> Related: ST-054 plan `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md`; QP-054 `.github/planning/query-packets/QP-054-retrieval-robustness.md`

---

## PO Intent

ST-046 builds a **reusable search-quality eval harness** against the seeded test corpus.
It is the **measurement apparatus** ST-054 will drive to green — *not* the retrieval fix
itself. The harness must:

1. Catch silent regressions when someone tunes RRF (`k=60`) / MMR (`λ=0.7`) / project-boost
   (`×1.2`) parameters (the original AC-7 reason the story existed).
2. Establish a **recall@k baseline** on incident-style queries (the `build 65008 PRI-5751
   pipeline failure` class) in **two forms** — with identifiers and without — so the
   identifier-dilution gap (ST-054 D2) is *measurable*.
3. Pin the current **false-empty** behaviour of the vector-only `search` tool (ST-054 D1) as
   a characterization, so ST-054's fix is self-proving.

The story closes **green on current `main`** and ships independently. ST-054 then flips the
baselines to improved thresholds (red→green with its fix).

---

## Resolution Adopted (PO-confirmed this session)

**Option A — split the harness from the fix; keep the dependency direction.**

- **ST-046 owns** the corpus extension, the recall@k machinery, the incident relevance set,
  the baseline assertions pinned to *today's* behaviour, and the RRF/MMR golden-set regression.
- **ST-054 owns** the *target* assertions: its DoD flips the ST-046 baselines to the improved
  thresholds (recall@k ≥ target on the identifier form; `search` never returns `[]` when the
  store is non-empty). This is story-level TDD — the failing assertion proves the bug, turning
  it green proves the fix.
- **Dependency unchanged:** ST-054 still `blocked_by` ST-046 because the corpus + recall@k
  mechanism must exist before ST-054 can assert against them. Only the *target numbers* move
  to ST-054.

Rejected alternatives (for the record):
- **Option B** (merge harness into ST-054) — forfeits the standalone regression harness; the PO
  explicitly chose to keep ST-046 as a real harness during ST-054 intake.
- **Option C** (invert: ST-046 `blocked_by` ST-054) — ST-054 would ship without the rigorous gate
  proving it, weakening R5, and contradicts "ST-054 depends on the harness."

---

## Scope (confirmed)

ST-046 delivers **five** things:

1. **Seeded incident corpus.** Add a new `build_failure` topic axis to the corpus generator
   `server/tests/fixtures/build-search-quality-corpus.ts`. The build-failure memories carry the
   semantic lexemes (`build`, `pipeline`, `failure`/`failed`) but contain **no ticket/build
   identifiers**. Identifiers (`65008`, `PRI-5751`) appear **only in the query**, never in stored
   content — this reproduces the exact D2 gap: the no-identifier query form matches lexically;
   the identifier form ANDs to zero rows under `plainto_tsquery`.
2. **recall@k helper.** A reusable function that runs a query through the search path, parses the
   returned thought IDs, and computes recall@k against an expected-id relevance set.
3. **Incident relevance / query set.** Committed data: incident queries in both forms
   (`build pipeline failure` vs `build 65008 PRI-5751 pipeline failure`) with their expected
   build-failure thought IDs.
4. **Baseline assertions pinned to today's behaviour**, encoded with an explicit TDD seam
   (a single `BASELINE` constants block) so ST-054 flips a constant rather than rewriting tests:
   - No-identifier form: recall@k meets the deterministic BM25 baseline (relevant memory present
     in top-k).
   - Identifier form: recall@k baseline = the current (degraded) value — deterministically `0` via
     the BM25 lane, because `plainto_tsquery` ANDs the unmatched identifier tokens to zero rows.
   - `search` (vector-only) characterization: the incident memory is **never surfaced** by the
     `search` tool today (D1 false-empty). One assertion; see determinism note below.
5. **RRF/MMR golden-set regression (AC-7).** Query/expected-result pairs that fail if an RRF/MMR
   parameter change drops a known-good result out of the top-N. Green with default parameters.

---

## Key Decisions

### KD-1 — Determinism: BM25-deterministic by construction
The corpus uses **synthetic orthonormal topic embeddings** (every row of a topic shares one
axis vector via `topicVector(idx, 0)`), while `search` / `search_thoughts` embed the query
**live** via OpenRouter in the HTTP path (no DI seam). A real query embedding vs a synthetic
axis yields ~random cosine, so the **vector lane is non-deterministic** for precise recall@k.

Therefore: all recall@k **baselines are pinned to the deterministic BM25 lexical lane** (and/or
structural SQL probes like the e2e vector-lane test's `plainto_tsquery` precondition check). The
vector lane is treated as non-authoritative noise that RRF tolerates. No network dependence in
the recall baselines.

### KD-2 — The one unavoidable network touch: `search` D1 characterization
The vector-only `search` tool has **no BM25 lane** — any assertion on it requires the live query
embedding. The PO accepted **one** `search` characterization assertion in ST-046 that documents
the false-empty: the incident memory is never surfaced by `search` today. Its *outcome* is robust
(synthetic corpus never clears the `0.5` floor against a real query embedding, so `search` returns
`[]` / does not surface the memory regardless of the exact embedding value). All other baselines
stay network-free.

### KD-3 — TDD seam encoded structurally
Expected values live in one named constants block so the ST-054 diff is "edit a constant /
flip a flag," not "rewrite the test body." This makes the gate auditable and the red→green
transition a one-liner. ST-054's ExecPlan will reference these constants by name.

### KD-4 — recall@k definition
recall@k = |relevant ∩ top-k| / |relevant|. For single-expected-id incident queries this is
binary (1 if the expected ID is in the top-k, else 0). The exact `k` and any aggregate threshold
across the relevance set are settled in Phase 2 against the regenerated corpus, but `k` is fixed
(not tuned to make a baseline pass) and documented.

### KD-5 — Corpus regeneration workflow
The corpus is **generated, not hand-edited**. Editing the generator requires regenerating
`search-quality-corpus.sql` (and `search-quality-queries.json`) and committing the regenerated
artifacts in the same change. The generator runs in the container:
`docker compose --profile test exec mcp-test deno run --allow-write tests/fixtures/build-search-quality-corpus.ts`.
Phase 2 must verify added rows do not break existing `e2e.test.ts` assertions (which hard-code
IDs `…001`–`…004` and use `limit: 29`); new rows use IDs beyond the current `…1d` and a new topic
axis, which is additive.

---

## In Scope

- New `build_failure` topic + identifier-free incident memories in the corpus generator; regenerated `.sql` + `.json`.
- Reusable recall@k helper (test helper under `server/tests/_helpers/` or inline in the test file — Phase 2 decides).
- New test file `server/tests/search-golden-set.test.ts`: RRF/MMR golden-set regression + incident recall@k baselines + the single `search` D1 characterization.
- A `BASELINE` constants block encoding the TDD seam for ST-054.

## Out of Scope (explicit)

- The retrieval **fix** itself — identifier normalization (D2), floor-with-fallback for `search` (D1), zero-result logging (D3), quality bands (D3b). All owned by **ST-054**.
- The **target** assertions (identifier-form recall ≥ target; `search` never-empty) — authored/greened by **ST-054**, which flips the ST-046 baseline constants.
- Latency assertions — owned by **ST-050** (`blocked_by` ST-046).
- An embedding-stub injection seam in `index.ts` — rejected as out of scope (KD-1 handles determinism by construction).

---

## Board edits to apply at finalization (LE-owned)

- **ST-046:** strike the two target-flavoured ACs (identifier-form recall@k *threshold*;
  `search` never returns empty) and replace with baseline/mechanism wording:
  - recall@k *machinery* + incident relevance set (both forms) exist and are consumable.
  - baselines pinned to current behaviour (no-id form green; id form = today's degraded value;
    `search` D1 false-empty characterization).
  - RRF/MMR golden-set regression catches parameter drift.
- **ST-054:** reword the Gate bullet from "passes the ST-046 eval harness" to "adds and greens the
  target assertions on ST-046's harness," and add as ST-054 ACs: identifier-form recall@k ≥ target,
  and `search` never returns `[]` when a relevant memory exists.

---

## Acceptance (observable)

1. `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts` passes on current `main`.
2. Temporarily changing RRF `k` (e.g. 60→10) in `server/index.ts` makes at least one golden-set assertion fail; reverting restores green.
3. The identifier-form incident query baseline deterministically records recall@k = 0 via the BM25 lane (the ANDed unmatched-identifier collapse), and the no-identifier form records the relevant memory present in top-k.
4. The `search` D1 characterization asserts the incident memory is not surfaced by `search` today.
5. Regenerated corpus does not break `tests/e2e.test.ts` (full suite green).
6. The `BASELINE` constants block is present and named so ST-054 can flip it.

---

## Open Questions for Phase 2

- Exact `k` for recall@k and whether to assert per-query or an aggregate over the relevance set.
- Whether the recall@k helper lives in `server/tests/_helpers/` (reusable by ST-054) or inline.
- Number of build_failure rows to seed (enough for a non-trivial top-k; ≥ 4 suggested).
- Whether the golden-set regression reads `search-quality-queries.json` or defines pairs inline.
