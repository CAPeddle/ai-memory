# Roadmap: ai-memory ST-088 Host Viability Milestone

**Milestone:** ST-088 — Policy-Scope Enforcement Pricing, Remote Execution Node, and Final ADR-016 Recommendation
**Mode:** mvp
**Granularity:** standard
**Canonical plan:** [docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md](../docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md)
**Story board:** [.github/planning/story-board.md](../.github/planning/story-board.md) — ST-088 In Progress section is authoritative for WIP limits and acceptance criteria.

## Overview

ST-088 discharges three unproven ST-084 Stage 2 criteria and produces a defended ADR-016 host
recommendation. The milestone gates co-tenancy safety: Candidate A (ai-memory as the AWCP host)
may not be accepted while the §6.1 policy-scope enforcement surface is unpriced. Work proceeds in
four phases that mirror the ST-088 implementation units — pricing first (U1), then hub-side node
infrastructure (U2), then the remote node client and reliability experiments (U3+U4), and finally
the blocking assessment and final ADR-016 disposition (U5+U6). GSD artifacts summarise and route
delivery; `docs/plans/` and the story board remain the canonical delivery record.

## Phases

- [x] **Phase 1: Policy-Scope Pricing** - Classify and price all 15 retrieval/egress paths; discharge the ADR-016 gate (U1)
- [x] **Phase 2: Remote Node Identity & Hub** - Add hub-side tables, node registration, and event ingestion endpoint (U2)
- [ ] **Phase 3: Node Client, Reliable Delivery & Regression Safety** - Implement the node client with spool/replay and run disconnection, duplicate, and invalid-auth experiments (U3+U4)
- [ ] **Phase 4: Blocking Evidence & ADR-016 Host Decision** - Prove or report UNPROVEN execution blocking; write the final ADR-016 recommendation (U5+U6)

## Phase Details

### Phase 1: Policy-Scope Pricing

**Goal**: Every known retrieval and provider-egress path is classified and a defended enforcement estimate exists, discharging the ADR-016 acceptance gate.
**Depends on**: Nothing (first phase)
**Requirements**: SCOPE-01, SCOPE-02
**Status**: ✅ Complete — commit `20aac70` (2026-08-05)
**Delivery artifact**: `docs/investigations/ST-084-awcp-host-spike-findings.md` §13
**Success Criteria** (what must be TRUE):

  1. A pricing table exists listing all 15 paths classified as straightforward, requires-new-parameter, structurally-blocked, or egress-specific.
  2. Every structurally-blocked path has a documented mitigation strategy (gate vs. disable vs. schema change deferred to ST-082).
  3. A defended total enforcement effort (hours/days) is stated and the M+L paths are summed into the ADR-016 gate figure.
  4. The product owner can compare the Candidate A enforcement cost against the Candidate C greenfield setup cost.

**Plans**: Complete

---

### Phase 2: Remote Node Identity & Hub

**Goal**: An authorized Ubuntu execution node can register with the hub, send events, and be rejected when credentials are invalid — with no impact on platform MCP authentication.
**Depends on**: Phase 1
**Requirements**: NODE-01, NODE-02, NODE-03
**Delivery artifacts**: `server/db/workflow/003_execution_nodes.sql`, `server/db/workflow/004_run_events.sql`, `server/src/workflow/remoteNodeHub.ts`, `server/tests/workflow-remote-node-hub.test.ts`
**Success Criteria** (what must be TRUE):

  1. A POST to `/workflow/nodes/register` with a valid per-node bearer returns a `node_id` and upserts a row in `workflow.execution_nodes`.
  2. A registered node can POST events to `/workflow/nodes/:node_id/events` and the hub records them in `workflow.run_events` attributed to that node.
  3. A request with an invalid or missing node bearer is rejected with HTTP 401 and does not affect platform MCP auth or prevent the workflow module from booting.
  4. The `(node_id, client_seq)` unique constraint on `run_events` is enforced — a duplicate insert is silently ignored (`ON CONFLICT DO NOTHING`), not an error.

**Status**: ✅ Complete — commits `587b0cd`, `08fe889`, `ebc7732`, `4f5abdf` (2026-08-06)
**Plans**: 2 plans
**Wave 1**

- [x] 02-01-PLAN.md — Tracer: end-to-end node registration + event ingestion hub (migrations 003/004, store functions, remoteNodeHub.ts, index.ts mount) — NODE-01, NODE-02

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Security & regression expansion: auth rejection, credential isolation, cross-node guard, boot isolation, full regression — NODE-03

**UI hint**: no

---

### Phase 3: Node Client, Reliable Delivery & Regression Safety

**Goal**: A minimal Node.js client running on the Ubuntu execution node spools, replays, and delivers events reliably across disconnection, duplicate delivery, and authentication failure scenarios — while existing MCP tools remain fully operational.
**Depends on**: Phase 2
**Requirements**: EVENT-01, EVENT-02, EVENT-03, EVENT-04, SAFE-01, SAFE-02
**Delivery artifacts**: `server/scripts/awcp-node-client.mjs` (`.mjs`, not `.js` — the repo has no `package.json` at any level, so Node resolves a bare `.js` as CommonJS and an ESM client would not parse; see `03-CONTEXT.md` D-04), experiment results in `docs/investigations/ST-084-awcp-host-spike-findings.md` **§16** — not §13. That document already carries two sections numbered `## 13.` (Stage 1's "Proposed ADR-016 amendments" at :730 and Phase 1's "Stage 2 Unit 1" appended after `## 14`/`## 15` at :1039), so a third would make the number useless as a reference; `03-CONTEXT.md`'s "§13" is superseded by the same supersession-note pattern D-04 used for the `.mjs` filename
**Success Criteria** (what must be TRUE):

  1. Replaying the same `(node_id, client_seq)` event a second time produces no duplicate hub state and the client receives the same ack both times.
  2. A node that loses hub connectivity retains bounded local events in `~/.awcp/spool.jsonl` (oldest-first) and replays them successfully when connectivity returns.
  3. A spool entry is removed only after the hub acknowledges it — not on send, not on retry attempt.
  4. When spool capacity is exceeded the oldest event is dropped and a visible counter increments rather than silently filling disk.
  5. Authenticated MCP memory tools and workflow operations pass their existing tests unmodified after all node changes are applied.

**Plans**: 2/6 plans executed

**Wave 1**

- [x] 03-01-PLAN.md — Wave 0 prerequisites: D-10 regression baseline captured by test identity, and `FEATURE_WORKFLOW` enabled on the base `mcp` service — SAFE-01, SAFE-02

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — Tracer: one event end to end (client → real hub process → ack → spool cleared), plus the EVENT-01 duplicate-replay proof — EVENT-01, EVENT-03

**Wave 3** *(blocked on Wave 2)*

- [ ] 03-03-PLAN.md — Spool reliability: bounding and oldest-first eviction with a visible drop counter, retention and replay through disconnection, and the D-14 `client_seq` durability proof — EVENT-02, EVENT-03, EVENT-04

**Wave 4** *(blocked on Wave 3)*

- [ ] 03-04-PLAN.md — Failure semantics: D-15 permanent rejection, D-17 terminal auth state with bounded backoff, heartbeat/checkpoint reporting, and the D-13 credential-leak gate — EVENT-03, EVENT-04

**Wave 5** *(blocked on Wave 4)*

- [ ] 03-05-PLAN.md — Regression safety: empty-diff identity comparison against the baseline, measured corpus integrity, and CLAUDE.md's grant inventory — SAFE-01, SAFE-02

**Wave 6** *(blocked on Wave 5 — the last destructive full-suite run must precede enrolment)*

- [ ] 03-06-PLAN.md — Real-node leg on z2: enrolment opened/used/closed with a closure proof, experiments 4–6, and the criterion-6 findings section — EVENT-01, EVENT-02, EVENT-03, EVENT-04

**Waves are strictly sequential.** Plans 02–04 all modify `server/scripts/awcp-node-client.mjs`, so
`files_modified` overlap forces the ordering; the shared, accumulating `db-test` database is a
supporting reason, not the primary one.

**UI hint**: no

---

### Phase 4: Blocking Evidence & ADR-016 Host Decision

**Goal**: The product owner receives an honest account of whether `blocking` WorkPacket state gates actual execution, and ADR-016 records a final, evidence-based host recommendation that reconciles all ST-088 evidence.
**Depends on**: Phase 3
**Requirements**: BLOCK-01, HOST-01, HOST-02
**Delivery artifacts**: `docs/investigations/ST-084-awcp-host-spike-findings.md` §13 (U5 finding), `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` (status updated from Proposed/Conditional)
**Success Criteria** (what must be TRUE):

  1. The Stage 2 findings document records a PROVEN or UNPROVEN verdict for `blocking` WorkPacket state with a specific file:line citation for the implemented consequence (or explicit absence of one).
  2. ADR-016 status is no longer Proposed/Conditional — it records one of: Accept Candidate A, Accept A with Required Changes, or Recommend Candidate C.
  3. The final recommendation is reconciled against all five evidence inputs: U1 pricing table, experiments 4–6 results, execution-blocking finding, shared-runtime blast-radius assessment, and post-Stage-1 code drift (§12a).
  4. ADR-016 §1 gate progress section confirms criterion 5, 6, and 7 are each recorded as discharged or UNPROVEN-with-rationale.

**Plans**: TBD
**UI hint**: no

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Policy-Scope Pricing | — | ✅ Complete | 2026-08-05 |
| 2. Remote Node Identity & Hub | 2/2 | ✅ Complete | 2026-08-06 |
| 3. Node Client, Reliable Delivery & Regression Safety | 2/6 | In Progress|  |
| 4. Blocking Evidence & ADR-016 Host Decision | 0/TBD | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 1 | Complete |
| SCOPE-02 | Phase 1 | Complete |
| NODE-01 | Phase 2 | Complete |
| NODE-02 | Phase 2 | Complete |
| NODE-03 | Phase 2 | Complete |
| EVENT-01 | Phase 3 | Pending |
| EVENT-02 | Phase 3 | Pending |
| EVENT-03 | Phase 3 | Pending |
| EVENT-04 | Phase 3 | Pending |
| SAFE-01 | Phase 3 | Pending |
| SAFE-02 | Phase 3 | Pending |
| BLOCK-01 | Phase 4 | Pending |
| HOST-01 | Phase 4 | Pending |
| HOST-02 | Phase 4 | Pending |

**v1 requirements: 14/14 mapped ✓**

---

*Roadmap created: 2026-08-05*
*Phases derive from ST-088 implementation units defined in `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md`.*
*Story board at `.github/planning/story-board.md` and `docs/plans/` remain canonical delivery artifacts.*
