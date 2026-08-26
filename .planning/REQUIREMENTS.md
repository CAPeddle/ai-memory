# Requirements: ai-memory ST-088 Host Viability Milestone

**Defined:** 2026-08-05
**Core Value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.

## v1 Requirements

Requirements for the current ST-088 milestone. Each maps to exactly one roadmap phase.

### Policy-Scope Pricing

- [x] **SCOPE-01**: The product owner can review a classification of every known memory retrieval and provider-egress path as straightforward, parameter-dependent, structurally blocked, or egress-specific.
- [x] **SCOPE-02**: The product owner can compare a defended total enforcement estimate for Candidate A with the setup and maintenance cost of Candidate C.

### Remote Node Identity

- [x] **NODE-01**: An authorized Ubuntu execution node can register with the hub using a node-specific credential that is distinct from the platform MCP credential. Complete since Phase 2 (2026-08-06); box was stale, corrected 2026-08-26.
- [x] **NODE-02**: A registered node can send heartbeats and execution events that the hub attributes to that node and persists for later inspection. Complete since Phase 2 (2026-08-06); box was stale, corrected 2026-08-26.
- [x] **NODE-03**: Invalid or missing node credentials are rejected without weakening platform MCP authentication or preventing the optional workflow module from booting. Complete since Phase 2 (2026-08-06); box was stale, corrected 2026-08-26.

### Reliable Event Delivery

- [x] **EVENT-01**: Replaying the same `(node_id, client_seq)` event does not create duplicate hub state.
- [x] **EVENT-02**: A node disconnected from the hub retains bounded local events and replays them oldest-first after connectivity returns.
- [x] **EVENT-03**: A node removes a spooled event only after receiving the hub acknowledgement for that event.
- [x] **EVENT-04**: Spool overflow drops the oldest event and records a visible dropped-event counter rather than silently filling disk.

### Workflow Enforcement Evidence

- [x] **BLOCK-01**: The product owner can see whether unresolved `blocking` WorkPacket state has an implemented execution consequence, with the result reported as PROVEN or UNPROVEN from observed behavior. UNPROVEN, findings §17 (2026-08-26).

### Host Decision

- [ ] **HOST-01**: ADR-016 records a final evidence-based recommendation of accept Candidate A, accept Candidate A with explicit changes, or recommend Candidate C.
- [ ] **HOST-02**: The final recommendation reconciles policy-scope cost, remote-node evidence, execution-blocking evidence, shared-runtime blast radius, and current post-Stage-1 code drift.

### Regression Safety

- [x] **SAFE-01**: The existing authenticated MCP memory tools and workflow operations remain functional after remote-node changes.
- [x] **SAFE-02**: Tests for the milestone are repeatable against the shared test stack and do not mutate or deactivate seeded search-corpus rows.

## v2 Requirements

Deferred beyond the ST-088 host-viability milestone.

### Policy-Scope Implementation

- **ENFORCE-01**: Every memory retrieval path enforces default-deny policy scope.
- **ENFORCE-02**: Every external model-provider egress path enforces default-deny policy scope.
- **ENFORCE-03**: Graph tools either enforce scope structurally or refuse calls that could cross a scope boundary.

### Product Expansion

- **CONTACT-01**: Contact Memory exposes stable domain-specific MCP and API tools over platform shards.
- **SYNTH-01**: A local companion synthesizes approved platform memories into an Obsidian vault.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Implementing all policy-scope controls | ST-088 prices and decides the host; ST-082 owns implementation after the host decision |
| General-purpose remote shell | The approved protocol is outbound-only and allow-listed |
| Remote execution on platforms other than the designated Ubuntu node | Stage 2 proves one concrete remote-node slice |
| Graph schema redesign | Stage 2 may recommend gating; extract-time scope tagging is a later implementation decision |
| Contact Memory or Obsidian companion feature work | Independent product tracks that do not contribute evidence to ADR-016 |
| Replacing the existing story board or `docs/plans/` | GSD tracking supplements current governance and must preserve delivery history |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 1 — Policy-Scope Pricing | ✅ Complete (commit `20aac70`, 2026-08-05) |
| SCOPE-02 | Phase 1 — Policy-Scope Pricing | ✅ Complete (commit `20aac70`, 2026-08-05) |
| NODE-01 | Phase 2 — Remote Node Identity & Hub | Complete |
| NODE-02 | Phase 2 — Remote Node Identity & Hub | Complete |
| NODE-03 | Phase 2 — Remote Node Identity & Hub | Complete |
| EVENT-01 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| EVENT-02 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| EVENT-03 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| EVENT-04 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| SAFE-01 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| SAFE-02 | Phase 3 — Node Client, Reliable Delivery & Regression Safety | Complete |
| BLOCK-01 | Phase 4 — Blocking Evidence & ADR-016 Host Decision | Complete |
| HOST-01 | Phase 4 — Blocking Evidence & ADR-016 Host Decision | Pending — recommendation drafted (findings §18.10), held for PO sign-off before ADR-016 itself is updated |
| HOST-02 | Phase 4 — Blocking Evidence & ADR-016 Host Decision | Complete — reconciliation done in findings §18 (the recommendation text's application to ADR-016 is HOST-01's remaining gap, not this one's) |

**Coverage:**

- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-05*
*Last updated: 2026-08-26 — corrected stale NODE-01/02/03 and BLOCK-01 tracking; originally written 2026-08-05 after GSD brownfield initialization*
