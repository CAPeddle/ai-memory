# Project Research Summary

**Project:** ai-memory v1.1 — Policy-Scope Isolation
**Domain:** Brownfield security retrofit — default-deny policy-scope enforcement for a single-user Deno/PostgreSQL MCP memory server
**Researched:** 2026-08-28
**Confidence:** HIGH overall

## Executive Summary

This is a retrofit of a closed-vocabulary, default-deny security boundary (`policy_scope: personal | corporate | mixed | public`) onto an already-shipped multi-lane retrieval system (SQL lexical/vector search, Apache AGE graph traversal, external LLM/embedding provider egress, plus the `KnowledgeSearchPort` workflow contract). All four research passes agree the vocabulary itself should reuse the pattern already shipped for `workflow.work_packets.policy_scope` (`text NOT NULL CHECK (...)`, no `DEFAULT`, mirrored in Zod). What is genuinely unresolved is the primary SQL enforcement mechanism — see Open Decision below.

The greater practical risk is the graph and provider-egress lanes. Graph nodes are written via `MERGE`-by-name with no scope property, meaning differently-scoped thoughts mentioning the same entity are already fused into one node — a write-path corruption no read-side filter can undo. Background workers egress full thought content to OpenRouter on a poll loop with zero scope awareness, and the existing `MODEL_PROVIDER_ENABLED` switch is global, not scope-aware. `fetch` takes a raw UUID with no scope predicate at all — a standing bypass.

Mitigation common to all four documents: resolve the RLS-vs-WHERE-clause decision explicitly before lane work starts; build a full inventory of every code path reading `thoughts` before writing filters; sequence graph-node scope attribution before graph-lane filtering; test with the four-part shape (positive/negative/absent-scope/cross-lane).

## Key Findings

### Recommended Stack

No new runtime dependencies needed for the vocabulary: PostgreSQL `text NOT NULL CHECK (...)` (no DEFAULT), Zod `z.enum(POLICY_SCOPES)`, and a shared `PolicyScope` TypeScript union — direct reuse of the pattern already shipped for `workflow.work_packets.policy_scope`. Both STACK.md and ARCHITECTURE.md independently converge on a new `shared/policyScope.ts`, matching the existing `shared/tagGrammar.ts` precedent.

**Core technologies:** `text NOT NULL CHECK` column (no default); `npm:zod@4.1.13` z.enum; `shared/policyScope.ts`. No ORM, no policy-engine (OPA/Cedar/Casbin) — rejected by both STACK.md and FEATURES.md as over-engineered for one subject x one closed 4-value vocabulary.

### Expected Features

**Must have:** closed-vocabulary `policy_scope` field distinct from `tags`; default-deny filtering at the query layer, before RRF/MMR fusion; enforcement across every retrieval/egress path uniformly (lexical, vector, graph, fetch/search, provider egress, KnowledgeSearchPort); fail-closed on missing scope (request and content); provider-egress gating keyed by scope, not just the global kill switch; negative isolation test suite across every path.

**Should have:** denial observability (`logScopeDenial` sibling to existing `logRecall`).

**Defer:** write-side capture-time scope UX (ST-101); legacy-row backfill tooling; scopes beyond the current closed set; LLM-assisted scope classification.

### Architecture Approach

Four enforcement layers, one per egress class: (1) SQL retrieval — RLS or explicit WHERE (unresolved, see below); (2) graph traversal — gate tools now, defer node tagging; (3) provider egress — pre-fetch scope gate at each OpenRouter call site, workers use their own trusted-session read of each row's scope rather than inheriting a caller's GUC; (4) `KnowledgeSearchPort` — thread a typed `policyScope` parameter through now, even with no real adapter yet.

**Major components:** `shared/policyScope.ts`; primary SQL enforcement mechanism (chokepoint for search_thoughts/list_thoughts/thought_stats/capture_thought/fetch/search); graph-lane gate; provider-egress gates per call site; KnowledgeSearchPort signature change.

### Critical Pitfalls

1. Don't copy the existing `project` filter's fail-open shape — must reject on absence, not pass through.
2. `fetch`/`search` are a standing bypass — no scope predicate, no context parameter at all.
3. Graph nodes have zero scope attribution; `MERGE`-by-name already fuses entities across scopes — read-side filtering alone cannot fix this.
4. Background workers egress raw content to OpenRouter unconditionally; the global `MODEL_PROVIDER_ENABLED` switch is not scope-aware.
5. Positive-path-only testing proves nothing — need the four-part test shape per lane.
6. Scope is caller-supplied free text, not a server-verified identity — the threat model needs to be written down explicitly before lane work begins.

## Open Decision: RLS vs. Explicit WHERE-Clause Enforcement (STACK.md vs. ARCHITECTURE.md disagree)

**Not resolved by this synthesis — must be decided during roadmap/plan-phase.**

**STACK.md recommends explicit `WHERE policy_scope = ANY($allowedScopes)` predicates** per existing query, and explicitly rejects RLS for this milestone. Reasoning: RLS needs a second Postgres role (current single `ai_memory` role owns every table; RLS doesn't apply to owners without `FORCE`); RLS requires session-scoped `SET`/GUC wiring correctly re-applied on every checkout from a **pooled** connection (`postgres.js`, max 10) — and this codebase's own workflow schema migration file already documents this exact pooling hazard for AGE's sticky `search_path` state, i.e., it has already been burned by this class of bug once. For 15 enumerable read paths (already priced at 64+ hours by ST-084), explicit WHERE clauses are "the correct scope for this milestone; RLS is a heavier, later escalation."

**ARCHITECTURE.md recommends Postgres RLS (`FORCE ROW LEVEL SECURITY`)** as the primary mechanism, with a shared `withPolicyScope()` transaction helper (`sql.begin(async (tx) => { await tx SET LOCAL app.policy_scope = ${scope}; ... })`) as the single chokepoint. Reasoning: a predicate added to 14 of 15 paths equals a predicate added to none — the 15th is the breach, and this recurs every time a new tool/lane is added (this milestone alone added `search`/`fetch`/`graph_search` after the original 15-path inventory). RLS forced on the table filters **every** query including ones written next year, closing ST-084's "no chokepoint" risk. ARCHITECTURE.md names specific mitigations for both of STACK.md's objections: `FORCE ROW LEVEL SECURITY` for owner-exemption, and `SET LOCAL` inside a mandatory `sql.begin()` transaction wrapper for the pooling hazard — arguing the risk is addressable with a disciplined, testable pattern rather than disqualifying.

**Both documents are HIGH-confidence and grounded in the same codebase facts; neither is factually wrong about the other's stated risk.** They differ on whether the pooling hazard is disqualifying or merely requires disciplined `SET LOCAL`-in-transaction usage. Recommend the roadmap stage this as an explicit Phase 0 decision point, ideally with a small technical spike (prototype `withPolicyScope()` + forced RLS against one simple path, e.g. `list_thoughts`) before committing the remaining 14+ paths to either mechanism. Both documents independently agree that whichever mechanism wins, `capture_thought`'s `ON CONFLICT` merge must never union `policy_scope` across two closed values.

## Implications for Roadmap

### Phase 0: Threat model and enforcement-mechanism decision
**Rationale:** Pitfall 6 (caller-declared scope, not identity-bound) and the RLS-vs-WHERE disagreement both need resolution before lane-specific work, since they determine what later phases' tests can claim.
**Delivers:** Written threat-model statement; chosen SQL enforcement mechanism; cross-scope visibility matrix (does `personal` see `public`? what does `mixed` grant?).
**Avoids:** Pitfall 6; prevents the STACK/ARCHITECTURE disagreement being silently resolved ad hoc.

### Phase 1: Vocabulary, migration, and shared type
**Rationale:** True root dependency — every other phase needs the field to exist.
**Delivers:** `shared/policyScope.ts`; `thoughts.policy_scope` column (NOT NULL CHECK, no default, `personal` interim backfill); scope columns on `recall_events`/`recall_queries`.
**Avoids:** Pitfall 1's shape (must diverge from the `project` filter's fail-open pattern from day one).

### Phase 2: Primary SQL retrieval enforcement (search_thoughts, list_thoughts, thought_stats, capture_thought read-back)
**Rationale:** The "obvious" lanes; the mechanism validated here becomes the template for later SQL paths.
**Delivers:** Default-deny filtering ahead of RRF/MMR fusion, using the Phase 0-selected mechanism.
**Avoids:** Pitfalls 1 and 5 (partially — negative tests required here too).

### Phase 3: fetch/search bypass closure
**Rationale:** Currently open, standing bypass reachable by id — must not be deferred.
**Delivers:** `context`/scope parameter added to `fetch`/`search` tool schemas, routed through the same scope-resolution helper as Phase 2.
**Avoids:** Pitfall 2.

### Phase 4: Graph-node scope identity (write path)
**Rationale:** Must precede graph-lane read enforcement — filtering already-fused nodes is cosmetic. Flagged as the item most likely to need deeper research/design.
**Delivers:** `entityWorker.ts`'s `MERGE` keyed on `(label, name, policy_scope)`; explicit decision on pre-existing (already-fused) graph data.
**Avoids:** Pitfall 3.

### Phase 5: Graph-lane read enforcement
**Rationale:** Sequenced after Phase 4.
**Delivers:** `graph_search` gets a scope-aware Cypher predicate; `graph_traverse` likely stays gated/denied under active scope indefinitely (arbitrary caller Cypher is not safely filterable).
**Avoids:** Pitfall 3.

### Phase 6: Provider-egress gating
**Rationale:** A structurally distinct trust surface (async workers vs. sync request handlers) — should not be folded into Phase 2.
**Delivers:** Pre-fetch scope gates at `embeddings.ts`, `entityWorker.ts`, `consolidationLLM.ts`; worker row-selection queries gain a scope predicate; `search_thoughts`'s `getEmbedding()` reordered to run after the scope check.
**Avoids:** Pitfalls 4 (unconditional worker egress; global-switch confusion).

### Phase 7: KnowledgeSearchPort contract + negative isolation test suite
**Rationale:** Port change is cheap and can land in parallel any time after Phase 1; the full test suite is the milestone's actual acceptance evidence and should close out the milestone once every lane exists.
**Delivers:** `policyScope: PolicyScope` threaded through `KnowledgeSearchPort.search()` and the five fake adapters; red/green negative-isolation test pair per egress class, covering positive/negative/absent-scope/cross-lane.
**Avoids:** Pitfall 5 across every lane.

### Phase Ordering Rationale

- Phase 0 exists because two research passes disagree on the core mechanism, and the trust-boundary pitfall is architectural, not tactical.
- Phase 4 before Phase 5 is a hard dependency — filtering fused graph nodes is "enforcement without effect."
- Phase 6 is separated from Phase 2 because they are different trust surfaces requiring different mechanisms.
- Phase 7's test suite is last because negative isolation tests require the other enforcement mechanisms to exist first — but the `KnowledgeSearchPort` type change can land early/in parallel.

### Research Flags

Needs deeper research during planning:
- **Phase 0:** A small technical spike (prototype `withPolicyScope()` against `list_thoughts`) before finalizing the RLS-vs-WHERE decision.
- **Phase 4:** Data-migration decision for already-populated (fused) graph data — not a pure code change.
- **Phase 6:** PO-level decisions on cross-scope provider-routing (can extracted entities cross scope boundaries?) flagged as unresolved by ST-084.

Standard patterns (skip research-phase):
- **Phase 1:** Directly copies an already-shipped, proven pattern.
- **Phase 3:** Mechanical once Phase 2's mechanism is chosen.
- **Phase 7 (port signature):** Type-only change; no fake adapter currently branches on scope.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Grounded directly in existing shipped code for the vocabulary; external corroboration is secondary only |
| Features | MEDIUM-HIGH | Cross-verified against general RAG/RLS/ABAC literature; HIGH where grounded directly in this repo's code |
| Architecture | HIGH for the four-layer decomposition; the RLS recommendation is HIGH in isolation but sits in direct, unresolved tension with STACK.md | Grounded in official PostgreSQL/AGE docs and the prior ST-084 investigation |
| Pitfalls | HIGH | Every pitfall cites exact file:line references from current HEAD; external literature used only for cross-validation |

**Overall confidence:** HIGH, with one explicit, load-bearing open decision (RLS vs. explicit WHERE-clause enforcement) the roadmap must resolve rather than inherit silently.

### Gaps to Address

- RLS vs. explicit-WHERE mechanism choice — resolve via a Phase 0 technical spike.
- Cross-scope visibility matrix — PO decision, not settled by research.
- Provider-routing policy per scope (Phase 6) — ST-084 §13.4 names this unresolved.
- `fetch`/`search` versioning strategy — optional-param-with-deny-on-absence vs. new versioned tool; not decided by research.
- "Context assembly"/"exports" code-path mapping — confirm no export surface beyond `KnowledgeSearchPort`/`gatherAdvisoryContext()` and the workflow dashboard/API JSON endpoints exists before declaring Phase 7's inventory complete.
- Whether AGE tagging (Phases 4/5) belongs in this milestone at all, given `graph_traverse` likely stays denied regardless of tagging — worth revisiting at Phase 0.

## Sources

### Primary (HIGH confidence)
- Direct codebase reads at current HEAD (2026-08-28): `server/db/schema.sql`, `server/db/workflow/001_workflow_schema.sql`, `server/src/workflow/*`, `server/src/embeddings.ts`, `server/src/entityWorker.ts`, `server/src/consolidationLLM.ts`, `server/src/parseContext.ts`, `server/src/searchQuality.ts`, `server/src/auth.ts`, `server/src/db.ts`, `server/index.ts`, `shared/tagGrammar.ts`, `server/tests/provider-egress.test.ts`
- `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1, §6.3, §7.2, §13, §16, §18.8
- `.planning/PROJECT.md`, `.github/planning/story-board.md` (ST-082)
- PostgreSQL Row Security Policies docs (postgresql.org/docs/current/ddl-rowsecurity.html); Apache AGE MATCH clause docs (age.apache.org/age-manual/master/clauses/match.html)

### Secondary (MEDIUM confidence)
- Postgres RLS for Multi-Tenant SaaS (dev.to); Supabase RAG with Permissions docs; OWASP RAG Security Cheat Sheet; Row Level Security for Tenants — Crunchy Data blog
- The Multi-Tenant RAG Nightmare — pgvector + RLS (kawshik.dev); Why your vector index breaks under multi-tenancy (andela.com)

### Tertiary (LOW confidence)
- Enums vs Check Constraints — Crunchy Data blog; Top Open-Source Authorization Tools 2026 — Permit.io blog

---
*Research completed: 2026-08-28*
*Ready for roadmap: yes — with one explicit open decision (RLS vs. explicit WHERE-clause enforcement) flagged for Phase 0 resolution*
