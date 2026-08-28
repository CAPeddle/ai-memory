# Requirements: ai-memory v1.1 Policy-Scope Isolation

**Defined:** 2026-08-28
**Core Value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.

## v1 Requirements

Requirements for the v1.1 milestone. Each maps to roadmap phases.

### Vocabulary

- [ ] **POLICY-01**: A closed-vocabulary `policy_scope` field (`personal` | `corporate` | `mixed` | `public`) exists on thoughts, distinct from free-form descriptive tags (ADR-012's tag vocabulary unchanged)
- [ ] **POLICY-02**: Existing thoughts are backfilled to a scope value with no default-allow gap during the transition

### Enforcement Decision

- [ ] **DECISION-01**: The primary SQL enforcement mechanism (Row-Level Security vs. explicit per-path `WHERE` clauses) is chosen via a technical spike, with a written threat-model/trust-boundary statement and a cross-scope visibility matrix (does `personal` see `public`? what does `mixed` grant?)

### Retrieval

- [ ] **RETRIEVAL-01**: `search_thoughts` enforces default-deny scope filtering before RRF/MMR fusion
- [ ] **RETRIEVAL-02**: `list_thoughts` enforces default-deny scope filtering
- [ ] **RETRIEVAL-03**: `thought_stats` enforces default-deny scope filtering
- [ ] **RETRIEVAL-04**: `fetch` and `search` (ChatGPT-compatible tools) gain a scope parameter and enforce default-deny, closing the current no-predicate bypass

### Graph

- [ ] **GRAPH-01**: Entity-worker node identity includes `policy_scope` so differently-scoped thoughts mentioning the same entity no longer fuse into one graph node
- [ ] **GRAPH-02**: `graph_search` applies a scope-aware predicate; `graph_traverse` stays gated/denied for arbitrary caller Cypher

### Provider Egress

- [ ] **EGRESS-01**: Background workers (entity extraction, consolidation, embedding backfill) gate OpenRouter egress by policy scope, not just the existing global `MODEL_PROVIDER_ENABLED` switch

### Port & Verification

- [ ] **VERIFY-01**: `KnowledgeSearchPort.search()` carries a typed `policyScope` parameter
- [ ] **VERIFY-02**: Negative isolation tests exist across every egress path (lexical, vector, graph, fetch/search, provider egress, port) — each proving positive access, negative cross-scope denial, absent-scope denial, and cross-lane consistency
- [ ] **VERIFY-03**: Scope denials are logged (`logScopeDenial`, sibling to the existing `logRecall`), so a cross-scope access attempt is provable and auditable rather than silently blocked

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Write-Side Scoping

- **CAPTURE-01**: `capture_thought` accepts a caller-supplied `policy_scope` parameter at write time (ST-101's need — picked up when that story starts)

### Broader Vocabulary

- **POLICY-03**: Policy-scope vocabulary extended beyond the current four values, if a real use case emerges

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| A general-purpose policy engine (OPA, Cedar, Casbin) | Over-engineered for one subject × one closed 4-value vocabulary — rejected by both stack and features research |
| Row-Level Security as a foregone conclusion | Genuinely undecided vs. explicit WHERE clauses — resolved by DECISION-01, not assumed here |
| Replacing ADR-012's free-form tag vocabulary | The policy-scope field is additive, not a tag-vocabulary rewrite |
| Legacy-row backfill tooling beyond the interim default | POLICY-02 covers the transition; a general reclassification tool is not this milestone's job |
| LLM-assisted scope classification | Scope is caller-declared, not inferred — inference is a different, unstarted trust model |
| Scoring the standalone AWCP peer-service topology (ST-100) | Separate backlog story, spike-only, no code |
| Disposition of the `FEATURE_WORKFLOW` dashboard exposure (ST-102) | Separate backlog story, unrelated surface |
| Migrating prism-llm-wiki content (ST-101) | Blocked on this milestone, not part of it — needs write-side scoping (v2 CAPTURE-01) first |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POLICY-01 | Phase 5 | Pending |
| POLICY-02 | Phase 5 | Pending |
| DECISION-01 | Phase 5 | Pending |
| RETRIEVAL-01 | Phase 6 | Pending |
| RETRIEVAL-02 | Phase 6 | Pending |
| RETRIEVAL-03 | Phase 6 | Pending |
| RETRIEVAL-04 | Phase 6 | Pending |
| GRAPH-01 | Phase 7 | Pending |
| GRAPH-02 | Phase 7 | Pending |
| EGRESS-01 | Phase 8 | Pending |
| VERIFY-01 | Phase 9 | Pending |
| VERIFY-02 | Phase 9 | Pending |
| VERIFY-03 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓ (roadmap created 2026-08-28 — Phases 5-9)

---
*Requirements defined: 2026-08-28*
*Last updated: 2026-08-28 after roadmap creation (Phases 5-9, full coverage)*
