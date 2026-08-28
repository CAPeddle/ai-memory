# Roadmap: ai-memory

## Milestones

- ✅ **v1.0 ST-088 Host Viability** — Phases 1-4 (shipped 2026-08-28) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Policy-Scope Isolation** — Phases 5-9 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (5, 6, 7, ...): Planned milestone work
- Decimal phases (5.1, 5.2): Urgent insertions (marked with INSERTED)

<details>
<summary>✅ v1.0 ST-088 Host Viability (Phases 1-4) — SHIPPED 2026-08-28</summary>

- [x] Phase 1: Policy-Scope Pricing — completed 2026-08-05
- [x] Phase 2: Remote Node Identity & Hub (2/2 plans) — completed 2026-08-06
- [x] Phase 3: Node Client, Reliable Delivery & Regression Safety (6/6 plans) — completed 2026-08-18
- [x] Phase 4: Blocking Evidence & ADR-016 Host Decision — completed 2026-08-26

Full phase detail, success criteria, and requirement coverage: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 Policy-Scope Isolation (In Progress)

**Milestone Goal:** Enforce `scope.tags` as a real default-deny retrieval boundary between corporate and personal content, discharging ai-memory's own isolation obligation (ADR-016 criterion 5 — neutral between topologies).

- [ ] **Phase 5: Policy-Scope Foundation** - Closed-vocabulary scope field, migration, and the chosen SQL enforcement mechanism
- [ ] **Phase 6: SQL Retrieval Enforcement** - Default-deny scope filtering across every SQL-backed retrieval tool
- [ ] **Phase 7: Graph-Lane Scope Isolation** - Scope-aware entity identity and graph query enforcement
- [ ] **Phase 8: Provider-Egress Scope Gating** - Background workers stop sending out-of-scope content to OpenRouter
- [ ] **Phase 9: Port Contract & Full Isolation Verification** - Typed port parameter, full negative-isolation test suite, denial logging

## Phase Details

### Phase 5: Policy-Scope Foundation

**Goal**: A closed-vocabulary policy-scope field exists on every thought with no default-allow gap, and the primary SQL enforcement mechanism for every later phase is chosen and documented.
**Depends on**: Phase 4 (v1.0 — shipped)
**Requirements**: POLICY-01, POLICY-02, DECISION-01
**Success Criteria** (what must be TRUE):

  1. Every thought (new and pre-existing) carries a non-null `policy_scope` value from the closed vocabulary (`personal`/`corporate`/`mixed`/`public`) — no row exists in a default-allow gap during or after migration.
  2. A written threat-model/trust-boundary statement documents the chosen primary SQL enforcement mechanism (Row-Level Security vs. explicit WHERE clauses), validated by a technical spike against one real query path.
  3. A cross-scope visibility matrix specifies what each scope value may see (e.g., does `personal` see `public`? what does `mixed` grant?), ready for every subsequent phase to implement against.

**Plans:** 2 plans
Plans:
**Wave 1**

- [ ] 05-01-PLAN.md — Policy-scope vocabulary, migration (007), and insert-site fixes (POLICY-01, POLICY-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 05-02-PLAN.md — DECISION-01 spike (RLS vs. WHERE) and ADR-018 (mechanism, trust boundary, visibility matrix)

### Phase 6: SQL Retrieval Enforcement

**Goal**: Every SQL-backed retrieval surface denies out-of-scope content by default, closing the standing fetch/search bypass.
**Depends on**: Phase 5
**Requirements**: RETRIEVAL-01, RETRIEVAL-02, RETRIEVAL-03, RETRIEVAL-04
**Success Criteria** (what must be TRUE):

  1. `search_thoughts` filters by permitted scope before RRF/MMR fusion runs — out-of-scope thoughts never enter ranking.
  2. `list_thoughts` and `thought_stats` never list or count rows outside the caller's permitted scope.
  3. `fetch` and `search` (ChatGPT-compatible tools) resolve/require a scope and deny out-of-scope content reachable by UUID, closing the current no-predicate bypass.
  4. A request that cannot resolve a scope is denied outright, not defaulted to broad access.

**Plans**: TBD

### Phase 7: Graph-Lane Scope Isolation

**Goal**: Graph traversal respects policy-scope boundaries at both entity-identity and query time.
**Depends on**: Phase 5
**Requirements**: GRAPH-01, GRAPH-02
**Success Criteria** (what must be TRUE):

  1. Entity-worker node identity includes `policy_scope`, so thoughts from different scopes mentioning the same entity produce distinct graph nodes instead of fusing into one.
  2. `graph_search` denies traversal results outside the caller's permitted scope via a scope-aware Cypher predicate.
  3. `graph_traverse` remains gated/denied for arbitrary caller Cypher — no new bypass is introduced by this phase.

**Plans**: TBD

### Phase 8: Provider-Egress Scope Gating

**Goal**: Background workers never send out-of-scope content to an external model provider.
**Depends on**: Phase 5
**Requirements**: EGRESS-01
**Success Criteria** (what must be TRUE):

  1. Entity-extraction, consolidation, and embedding-backfill workers each apply a policy-scope gate before any OpenRouter call, independent of the existing global `MODEL_PROVIDER_ENABLED` switch.
  2. A worker encountering a thought with a denied or absent scope skips egress for that thought rather than sending its content externally.

**Plans**: TBD

### Phase 9: Port Contract & Full Isolation Verification

**Goal**: The typed port contract carries scope end-to-end, and every egress path has proof — not just implementation — that default-deny holds.
**Depends on**: Phase 6, Phase 7, Phase 8
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03
**Success Criteria** (what must be TRUE):

  1. `KnowledgeSearchPort.search()` accepts a typed `policyScope` parameter, implemented consistently across all fake adapters.
  2. Every egress path (lexical, vector, graph, fetch/search, provider egress, port) has passing tests proving positive access, negative cross-scope denial, absent-scope denial, and cross-lane consistency.
  3. Every scope denial is logged via `logScopeDenial`, sibling to the existing `logRecall`, making cross-scope access attempts provable and auditable.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Policy-Scope Pricing | v1.0 | — | Complete | 2026-08-05 |
| 2. Remote Node Identity & Hub | v1.0 | 2/2 | Complete | 2026-08-06 |
| 3. Node Client, Reliable Delivery & Regression Safety | v1.0 | 6/6 | Complete | 2026-08-18 |
| 4. Blocking Evidence & ADR-016 Host Decision | v1.0 | — | Complete | 2026-08-26 |
| 5. Policy-Scope Foundation | v1.1 | 0/2 | Not started | - |
| 6. SQL Retrieval Enforcement | v1.1 | 0/TBD | Not started | - |
| 7. Graph-Lane Scope Isolation | v1.1 | 0/TBD | Not started | - |
| 8. Provider-Egress Scope Gating | v1.1 | 0/TBD | Not started | - |
| 9. Port Contract & Full Isolation Verification | v1.1 | 0/TBD | Not started | - |

---

*Roadmap created: 2026-08-05*
*v1.1 phases added: 2026-08-28*
*Story board at `.github/planning/story-board.md` and `docs/plans/` remain canonical delivery artifacts.*
