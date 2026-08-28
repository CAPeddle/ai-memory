---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Policy-Scope Isolation
current_phase: 5
current_phase_name: first phase of this milestone
status: planning
stopped_at: Phase 5 context gathered
last_updated: "2026-08-28T11:16:12.180Z"
last_activity: 2026-08-28
last_activity_desc: ROADMAP.md created for v1.1 (Phases 5-9, 13/13 requirements mapped)
state_head: 9ae5132af8dd798079b5304a4193a93edfe2d31c
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.
**Current focus:** v1.1 Policy-Scope Isolation (ST-082) — default-deny retrieval/provider-egress enforcement, controlled policy-scope field, negative isolation tests across every egress path.

## Current Position

Phase: 5 of 5 (Policy-Scope Foundation) — first phase of this milestone
Plan: — (roadmap just created, not yet planned)
Status: Ready to plan
Last activity: 2026-08-28 — ROADMAP.md created for v1.1 (Phases 5-9, 13/13 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.1): 0
- Average duration: —
- Total execution time: —

v1.0 velocity (91 commits, 8 GSD-tracked plans across Phases 2-3) is archived in `.planning/MILESTONES.md` and `.planning/milestones/v1.0-*`.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 5. Policy-Scope Foundation | TBD | — | — |
| 6. SQL Retrieval Enforcement | TBD | — | — |
| 7. Graph-Lane Scope Isolation | TBD | — | — |
| 8. Provider-Egress Scope Gating | TBD | — | — |
| 9. Port Contract & Full Isolation Verification | TBD | — | — |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **ADR-016 (v1.0 close):** Candidate A rejected; AWCP is a standalone peer service, topology-neutral on isolation. ST-082's policy-scope enforcement is ai-memory's own obligation, not a co-tenancy tax, and is a precondition of the AWCP adapter contract — not gated on ST-100's still-unscored topology.
- **Open, by design — Phase 5 resolves it:** The primary SQL enforcement mechanism (Row-Level Security vs. explicit per-path WHERE clauses) is genuinely undecided. STACK.md and ARCHITECTURE.md research passes disagree (RLS pooling/owner-exemption hazard vs. no-chokepoint risk of 15 enumerable WHERE-clause sites). Resolve via a technical spike against one real path (e.g. `list_thoughts`) before committing the remaining phases to either mechanism.
- **Sequencing constraint carried into Phase 7:** Graph write-path scope identity (GRAPH-01) must land before graph read-path filtering (GRAPH-02) — filtering already-fused entity nodes is enforcement without effect.
- **Fail-closed, not fail-open:** Do not copy the existing `project` context filter's fail-open shape. Absence of scope must deny, matching PROJECT.md's binding constraint.

### Pending Todos

None yet.

### Blockers/Concerns

- **z2 de-enrolment hazard outlives v1.0.** Any test run against the dev `DATABASE_URL` (including native `./dev.sh`) issues `DROP SCHEMA IF EXISTS workflow CASCADE`, which deletes the real enrolled node's `execution_nodes` row. Use `mcp-test`/`db-test` for suite runs; don't run the full suite against dev unless re-enrolment is acceptable.
- **`docker compose up -d mcp` can silently keep a stale environment** after editing `.env` — compose may report `Running` instead of `Recreated`. Verify env changes inside the running process (`docker compose exec -T mcp printenv VAR`), never from `.env` or an HTTP response.
- **Graph tools are structurally blocked, not merely unfixed** (carried from v1.0 pricing): AGE nodes carry no scope column today. Phase 7 owns the build this milestone priced.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Write-side scoping | CAPTURE-01 (`capture_thought` accepts caller-supplied `policy_scope`) | Deferred | v1.1 requirements definition | v2 — picked up when ST-101 starts |
| Vocabulary | POLICY-03 (scope vocabulary beyond the current 4 values) | Deferred | v1.1 requirements definition | v2 — only if a real use case emerges |
| Topology | ST-100 (score standalone AWCP peer-service topology) | Backlog | v1.0 close | Separate story, not bundled |
| Exposure | ST-102 (`FEATURE_WORKFLOW` unauthenticated dashboard exposure) | Backlog | v1.0 close | Separate story, unrelated surface |
| Contact Memory | CONTACT-01 (Contact Memory domain MCP) | Backlog | Pre-v1.0 | Independent product track, v2 |
| Synthesis companion | SYNTH-01 (Obsidian companion) | Backlog | Pre-v1.0 | ST-019 dependent, v2 |

## Session Continuity

Last session: 2026-08-28T11:16:12.153Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-policy-scope-foundation/05-CONTEXT.md

### Key file locations

| Artifact | Path |
|----------|------|
| v1.1 requirements | `.planning/REQUIREMENTS.md` |
| v1.1 research | `.planning/research/SUMMARY.md` |
| v1.0 archive | `.planning/milestones/v1.0-*` |
| ADR-016 | `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` |
| ST-084 findings (policy-scope pricing) | `docs/investigations/ST-084-awcp-host-spike-findings.md` |
| Story board | `.github/planning/story-board.md` |

---

*State initialized: 2026-08-05*
*Reset for v1.1: 2026-08-28*

*Next action: `/gsd-plan-phase 5` — Phase 5 (Policy-Scope Foundation) resolves the RLS-vs-WHERE spike, ships the vocabulary and migration, and hands every later phase a chosen mechanism.*

## Operator Next Steps

- Review ROADMAP.md for the v1.1 phase structure, then run `/gsd-plan-phase 5`
