# QP-054: Retrieval Robustness (false-empty, identifier dilution, zero-result observability)

> Story: ST-054
> Status: Seed — ready for /plan
> Created: 2026-06-04
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

## PO Decisions (scoping round 2026-06-04)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `search` 0.5 floor | **Fix in place + characterization test** | The floor is an internal quality knob, not part of the MCP contract (which is the `{results:[{id,title,url}]}` shape). Returning `[]` when relevant memories exist is closer to a bug than a guarantee clients depend on. A characterization test pins the response shape so the fix can't drift it. Adding a flag was rejected: ChatGPT calls `search` with a fixed single-arg signature, so a behavioral param is the *riskier* path. |
| Identifier normalization | **Non-destructive: raw + derived retrieval text + metadata facets** | `content` stays immutable (audit/traceability). A derived normalized field feeds embedding + `to_tsvector`. Identifiers land in the existing `metadata` JSONB ([server/index.ts:94](../../../server/index.ts#L94)) as exact-match facets. No data loss. |
| Connected-retrieval (Story B) | **Reshape ST-034**, no new story | ST-034 already owns the graph-expansion cardinality spike; widen it to carry the orchestration outcome (conditional, thin-result-triggered graph expansion + bounded-boost fusion) rather than spawning a duplicate. |
| Eval harness | **Expand ST-046; ST-054 depends on it** | ST-046 (golden-set regression tests) already exists and uses the seeded corpus. Build the incident-query relevance set + no-false-empty regression there; ST-054 consumes it as its proof gate. Avoids two competing harnesses. |
| Value / lane | **Value 5, Refined** | Correctness defect affecting every consuming agent on real incident queries. |

## In Scope (ST-054)

1. **D1 fix** — graceful-degradation in `search` ([server/index.ts:43-65](../../../server/index.ts#L43-L65)):
   return top-k nearest neighbors instead of an empty set when everything is below the old
   floor (exact policy — lower floor vs. top-k-with-score — settled during /plan). Characterization
   test pins the `{results:[{id,title,url}]}` shape.
2. **D2 fix** — a non-destructive identifier-normalization helper applied at **capture**
   (derive retrieval text + populate `metadata` facets) and at **query** (normalize the
   query string before embedding/`plainto_tsquery`). Raw `content` untouched.
3. **D3 fix** — log zero-result queries for both `search` and `search_thoughts` so the
   false-empty rate is measurable (feeds the harness + future stats).
4. **D3b fix** — `search_thoughts` response carries a per-result quality signal
   (confidence band or min-score flag) so consumers can distinguish authoritative hits
   from thin-corpus guesses. Score is already computed; this is a contract/format change.
5. Tests for each, plus the ST-046 eval-harness gate (recall@k on incident-style queries
   with/without identifiers; no-false-empty regression).

## Out of Scope

- **Graph-expanded "connected" retrieval** — owned by reshaped ST-034 (depends on its
  cardinality bounding strategy; do not retrofit here).
- **Capture-side prompting/governance** ("lead with the problem, not the ticket" as a
  prompt rule) — the weak consumer-side lever; ST-054 makes it structural instead.
- **Building the eval harness itself** — that is ST-046's expanded scope; ST-054 consumes it.
- Changing the embedding model/dimension, RRF k, MMR λ, or the project-boost factor.
- New auth surface, rate limiting, migration-runner adoption.

## Open Questions for /plan

1. **D1 policy:** lower the floor to a smaller constant, remove it and return top-k by
   similarity, or keep a floor but fall back to top-k-tagged-low-confidence when the floor
   filters everything? (Leaning: floor-with-fallback so the common case is unchanged but
   empty-when-results-exist is impossible.)
2. **D2 normalization rules:** which identifier patterns to strip (`\bPRI-\d+\b`,
   `\b[A-Z]{2,}-\d+\b` Jira-style, `\b\d{4,}\b` build numbers) and where the boundary sits
   between "identifier noise" and "meaningful token" (e.g. version numbers, error codes —
   note ST-049 wants error codes/UUIDs to stay BM25-precise). Reconcile with ST-049.
3. **D2 storage:** is a new derived `search_text` column warranted, or can normalization
   happen inline at embed/tsquery time without persisting? (Persisting helps BM25 via the
   generated `search_vector`; inline-only is simpler. Decide in /plan.)
4. **D3b signal shape:** numeric score passthrough, a 3-band label (high/med/low), or an
   absolute-similarity floor flag? Must be machine-parseable by a consuming agent, not just
   prose in the text block.
5. **D2 backfill:** do existing thoughts get re-normalized/re-faceted, or only new captures?
   (If `search_text` is persisted + drives the generated `search_vector`, existing rows need
   a one-time backfill — overlaps ST-039's embedding-backfill sweep pattern.)

## Dependencies

- **Blocked by:** ST-046 (eval harness must exist to prove the recall gate).
- **Relates to / reconcile with:** ST-049 (query routing / BM25 precision for short tokens),
  ST-034 (reshaped — connected retrieval), ST-028/ST-044 (zero-result logging feeds
  worker/tool observability), ST-039 (backfill-sweep pattern reuse if `search_text` persists).
- **Requires:** Docker dev + test stacks; seeded test corpus.

## Estimated Complexity

Medium. Four focused changes across `server/index.ts` and a new normalization helper, one
possible schema delta (`search_text` + facets), plus the eval-gate consumption. No new
agent-facing tool. The contested surface (`search` contract) is settled to fix-in-place.

## Required Reading for /plan Phase 2

`plan.prompt.md` Phase 2 treats this query packet as the *sole input*. The companion **ce-plan
artifact `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md` is required reading** for that
session: it carries the implementation-unit breakdown (U1–U8), enumerated test scenarios, KTD
rationale (including the deepening-pass additions: floor-with-fallback policy, structured quality
signal, generated-`search_vector` reindex cost, normalizer-version-drift risk), and the System-Wide
Impact analysis. The ExecPlan §4 / §2d should lift directly from it.

## Recommended Next Step (sequencing)

1. Run `/plan` for **ST-046** first — it owns the eval harness (seeded incident corpus + recall@k +
   no-false-empty regression) that is ST-054's proof gate.
2. Then run `/plan` for **ST-054**, consuming this packet + the ce-plan artifact.

ST-054 stays in **Backlog** until its ExecPlan is authored and flipped `✅ Ready for /continue`
(Refined ⟺ Ready ExecPlan per `plan.prompt.md`).
