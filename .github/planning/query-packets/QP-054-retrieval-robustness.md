# QP-054: Retrieval Robustness (false-empty, identifier dilution, zero-result observability)

> Story: ST-054
> Status: Scoped — ready for ExecPlan authoring
> Created: 2026-06-04
> Scoped: 2026-06-05 via /plan PO question rounds
> Seed: Session analysis 2026-06-04 (build-failure false-empty incident) + adversarial design review + local-instance validation
> Companion ce-plan artifact: `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md`

---

## PO Intent

A consuming agent in another repo was told to investigate a build failure and searched
ai-memory with a hyper-specific query — `build 65008 PRI-5751 pipeline failure`. The
`search` tool returned `{"results":[]}`. The PO's expectation: even a very specific query
that names exact identifiers should surface *connected* build-failure memories, not a flat
empty result that reads as "no such memory exists."

ST-054 makes the **retrieval path robust** so that specificity narrows results without
silently erasing them, identifiers stop poisoning recall, and zero-result events become
observable instead of invisible. It is the tooling-side fix; consumer-side capture/query
discipline is the weaker lever and is explicitly **not** the remedy here.

## Problem Statement (verified in-session against current source + local instance)

Three distinct, independently-proven defects:

### D1 — `search` fails closed (false negative by omission)

[server/index.ts:43-65](../../../server/index.ts#L43-L65). The ChatGPT-compat `search`
tool is vector-only with a hard floor: `1 - (embedding <=> q) >= 0.5`
([server/index.ts:51](../../../server/index.ts#L51)). A specific query loaded with
high-entropy identifiers is pushed below 0.5 → empty result. To an agent, empty is
indistinguishable from "memory is empty." **Validated on the local instance:** the exact
query returned HTTP 200 `{"results":[]}` from `search`, while `search_thoughts` (no floor)
returned 10 results.

### D2 — Identifiers poison both lanes (recall dilution)

The query mixes the semantic core (*build / pipeline / failure*) with identifiers
(`65008`, `PRI-5751`) that carry no useful embedding signal but shift the query vector.
Worse on the keyword lane: `plainto_tsquery('english', …)` **ANDs every lexeme**
([server/index.ts:131](../../../server/index.ts#L131),
[server/db/search.sql:18-19](../../../server/db/search.sql#L18-L19)), so the BM25 lane
requires *every* token — including the unique identifiers no prior memory contains —
collapsing that lane to zero rows. This is the structural form of the PO's intuition
("a memory shouldn't lead with the ticket"): identifiers must be normalized out of the
*retrieval text* and kept as *exact-match metadata*, not destroyed.

### D3 — Zero-result queries are invisible (observability gap)

`search` never logs recall at all. `search_thoughts` calls `logRecall`
([server/index.ts:207](../../../server/index.ts#L207)) only after building results, and
both the early empty-return ([server/index.ts:166](../../../server/index.ts#L166)) and
`logRecall` itself ([server/src/searchQuality.ts:62](../../../server/src/searchQuality.ts#L62))
bail on `!results.length`. So a false-empty leaves **no trace** — the failure mode cannot
currently be measured.

### D3b — `search_thoughts` thin-corpus noise (false positive by presence)

Validation finding: on a thin corpus `search_thoughts` returned 10 results that were all
low-signal/unrelated, formatted identically to high-confidence hits. The score is computed
(`rrf: 0.XXXX`) but there is no structured quality band telling a consuming agent "these
are best-guesses, not authoritative." Returning confident noise can be worse than returning
nothing.

## Corpus reality (validated 2026-06-04)

A direct DB check on the local corpus found **0** matches for `65008`, `PRI-5751`,
`build failure`, `build failed`, `CI failure` (1 unrelated `pipeline` hit). So the incident
was *both* a retrieval defect (D1) *and* an empty corpus. ST-054 fixes the retrieval path;
it cannot conjure memories that were never captured. This is why the **ST-046 eval harness
must seed a known corpus** to prove recall — otherwise "0 results" is ambiguous between
"broken ranking" and "nothing to find."

## PO Decisions

### Scoping round 2026-06-04

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `search` 0.5 floor | **Fix in place + characterization test** | The floor is an internal quality knob, not part of the MCP contract (which is the `{results:[{id,title,url}]}` shape). Returning `[]` when relevant memories exist is closer to a bug than a guarantee clients depend on. A characterization test pins the response shape so the fix can't drift it. Adding a flag was rejected: ChatGPT calls `search` with a fixed single-arg signature, so a behavioral param is the *riskier* path. |
| Identifier normalization | **Non-destructive: raw + derived retrieval text + metadata facets** | `content` stays immutable (audit/traceability). A derived normalized field feeds embedding + `to_tsvector`. Identifiers land in the existing `metadata` JSONB ([server/index.ts:94](../../../server/index.ts#L94)) as exact-match facets. No data loss. |
| Connected-retrieval (Story B) | **Reshape ST-034**, no new story | ST-034 already owns the graph-expansion cardinality spike; widen it to carry the orchestration outcome (conditional, thin-result-triggered graph expansion + bounded-boost fusion) rather than spawning a duplicate. |
| Eval harness | **Expand ST-046; ST-054 depends on it** | ST-046 (golden-set regression tests) already exists and uses the seeded corpus. Build the incident-query relevance set + no-false-empty regression there; ST-054 consumes it as its proof gate. Avoids two competing harnesses. |
| Value / lane | **Value 5, Backlog until Ready ExecPlan** | Correctness defect affecting every consuming agent on real incident queries. Per `/plan` lifecycle, ST-054 remains Backlog until its ExecPlan is marked `✅ Ready for /continue`; only then does the board move Backlog → Refined. |

### Scope lock round 2026-06-05

| Decision | Choice | Rationale |
|----------|--------|-----------|
| D1 `search` fallback policy | **Floor with fallback** | Keep the legacy `>= 0.5` similarity floor as the preferred high-confidence path. If no rows clear the floor, return the top-k nearest neighbors by similarity instead of `[]`. This preserves strong-match behavior while eliminating false-empty responses when nearest neighbors exist. |
| D2 storage shape | **Persist `search_text`** | BM25 must index normalized retrieval text, not raw `content`, so the schema gains a persisted derived field that feeds `search_vector`. Raw `content` remains immutable. |
| D2 identifier boundary | **Strip Jira-style tickets and bare build numbers; preserve UUIDs, error codes, and versions** | Strip `[A-Z]{2,}-\d+` tokens such as `PRI-5751` and bare numeric build identifiers `\d{4,}`. Preserve UUIDs, semantic versions, and error-code-like tokens so ST-049's BM25-precision goals are not undermined. |
| D2 historical rows | **Fallback old rows to raw `content`; defer historical re-normalization/backfill** | The schema should make old rows continue behaving as today by deriving `search_vector` from `coalesce(search_text, content)`. A full historical re-normalization/backfill is a follow-up story, not part of ST-054. |
| D2 normalizer drift guard | **Store `normalizer_version`** | Persist the version used for document-side `search_text` so future regex changes can detect rows needing re-normalization. The ExecPlan should pin the initial version in tests. |
| D3 zero-result storage | **Add a `recall_queries` table** | `recall_events` is row-per-returned-thought. A query-level table cleanly records both zero-result and non-zero query summaries with `tool`, raw query, normalized query, project/profile, result count, and timestamps without weakening `recall_events.thought_id`. |
| D3b quality signal | **Structured JSON response with score plus band** | `search_thoughts` should return machine-parseable JSON containing a `results` array. Each result includes `id`, text/content, score, and a discrete `high`/`medium`/`low` band so consuming agents do not parse prose or infer thresholds. |

## In Scope (ST-054)

1. **D1 fix** — graceful-degradation in `search` ([server/index.ts:43-65](../../../server/index.ts#L43-L65)):
   keep the legacy `>= 0.5` floor as the preferred path, but when no rows clear the floor,
   return the top-k nearest neighbors by similarity instead of an empty set. Characterization
   test pins the `{results:[{id,title,url}]}` shape.
2. **D2 fix** — a non-destructive identifier-normalization helper applied at **capture**
   (derive persisted `search_text`, store `normalizer_version`, and populate `metadata` facets)
   and at **query** (normalize the query string before embedding/`plainto_tsquery`). Raw `content`
   untouched. Existing rows without `search_text` fall back to raw `content`; historical
   re-normalization/backfill is out of scope.
3. **D3 fix** — log zero-result queries for both `search` and `search_thoughts` so the
   false-empty rate is measurable via a query-level `recall_queries` table (feeds the harness + future stats).
4. **D3b fix** — `search_thoughts` response carries a per-result quality signal
   in structured JSON: each result includes a normalized score plus a `high`/`medium`/`low`
   quality band. Score is already computed; this is a contract/format change.
5. Tests for each, plus the ST-046 eval-harness gate (recall@k on incident-style queries
   with/without identifiers; no-false-empty regression).

## Out of Scope

- **Graph-expanded "connected" retrieval** — owned by reshaped ST-034 (depends on its
  cardinality bounding strategy; do not retrofit here).
- **Capture-side prompting/governance** ("lead with the problem, not the ticket" as a
  prompt rule) — the weak consumer-side lever; ST-054 makes it structural instead.
- **Building the eval harness itself** — that is ST-046's expanded scope; ST-054 consumes it.
- **Historical re-normalization/backfill of all existing thoughts** — ST-054 adds the schema and
  new-capture path, while old rows fall back to raw `content`. A follow-up story owns full
  re-normalization if production data warrants it.
- Changing the embedding model/dimension, RRF k, MMR λ, or the project-boost factor.
- New auth surface, rate limiting, migration-runner adoption.

## Resolved Planning Choices

The 2026-06-05 `/plan` session resolved the seed packet's open questions as follows:

1. **D1 policy:** floor-with-fallback. Prefer rows above the legacy `0.5` similarity floor;
   if none clear it, return top-k nearest neighbors instead of `[]`.
2. **D2 normalization rules:** strip Jira-style tickets (`[A-Z]{2,}-\d+`) and bare build
   numbers (`\d{4,}`), while preserving UUIDs, semantic versions, and error-code-like tokens.
3. **D2 storage:** persist `search_text` and `normalizer_version`; update BM25 indexing to use
   `coalesce(search_text, content)` so existing rows keep today's behavior until a future backfill.
4. **D3 storage:** add `recall_queries` for query-level observability, including zero-result
   queries for both `search` and `search_thoughts`.
5. **D3b signal shape:** return structured JSON from `search_thoughts`, with per-result score and
   `high`/`medium`/`low` band.
6. **Historical backfill:** out of scope for ST-054. New captures use normalized retrieval text;
   existing rows are not re-normalized in this story.

## Dependencies

- **Formerly blocked by:** ST-046 (eval harness). ST-046 is Done as of 2026-06-05, so ST-054 can now consume `server/tests/search-golden-set.test.ts` as its proof gate.
- **Relates to / reconcile with:** ST-049 (query routing / BM25 precision for short tokens),
  ST-034 (reshaped — connected retrieval), ST-028/ST-044 (zero-result logging feeds
  worker/tool observability), ST-039 (backfill-sweep pattern reuse if `search_text` persists).
- **Requires:** Docker dev + test stacks; seeded test corpus.

## Estimated Complexity

Medium-high. Focused retrieval changes across `server/index.ts`, a new normalization helper,
schema changes for `search_text`, `normalizer_version`, and `recall_queries`, plus ST-046
eval-gate consumption. No new agent-facing tool. The contested surface (`search` contract) is
settled to fix-in-place, while `search_thoughts` intentionally changes format to structured JSON.

## Required Reading for /plan Phase 2

`plan.prompt.md` Phase 2 treats this query packet as the *sole input*. The companion **ce-plan
artifact `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md` is required reading** for that
session: it carries the implementation-unit breakdown (U1–U8), enumerated test scenarios, KTD
rationale (including the deepening-pass additions: floor-with-fallback policy, structured quality
signal, generated-`search_vector` reindex cost, normalizer-version-drift risk), and the System-Wide
Impact analysis. The ExecPlan §4 / §2d should lift directly from it.

## Recommended Next Step (sequencing)

1. Author the ST-054 ExecPlan from this scoped query packet, the ST-046 harness, and the ce-plan artifact.
2. Include a follow-up story for historical re-normalization/backfill if the ExecPlan needs an explicit downstream placeholder.

ST-054 stays in **Backlog** until its ExecPlan is authored and flipped `✅ Ready for /continue`
(Refined ⟺ Ready ExecPlan per `plan.prompt.md`).
