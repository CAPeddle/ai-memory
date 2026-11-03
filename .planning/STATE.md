---
gsd_state_version: "1.0"
milestone: v1.1
milestone_name: Policy-Scope Isolation
current_phase: 6
current_phase_name: SQL Retrieval Enforcement
status: planning
stopped_at: Phase 05 complete, ready to plan Phase 6
last_updated: "2026-11-03T21:37:33.646Z"
last_activity: 2026-11-03
last_activity_desc: Phase 05 complete, transitioned to Phase 6
state_head: f7223ec82b974e6e7f4dfb5ccbc143046d9b02a4
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 2
  completed_plans: 2
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-03)

**Core value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.
**Current focus:** Phase 6 — SQL Retrieval Enforcement

## Current Position

Phase: 6 — SQL Retrieval Enforcement
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-03 — Phase 05 complete, transitioned to Phase 6

Progress: [███████░░░] 67%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.1): 2
- Average duration: —
- Total execution time: —

v1.0 velocity (91 commits, 8 GSD-tracked plans across Phases 2-3) is archived in `.planning/MILESTONES.md` and `.planning/milestones/v1.0-*`.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 5. Policy-Scope Foundation | 2 | 28 min | 14 min |
| 6. SQL Retrieval Enforcement | TBD | — | — |
| 7. Graph-Lane Scope Isolation | TBD | — | — |
| 8. Provider-Egress Scope Gating | TBD | — | — |
| 9. Port Contract & Full Isolation Verification | TBD | — | — |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 05 P01 | 16 min | 3 tasks | 17 files |
| Phase 05 P02 | 12min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **ADR-016 (v1.0 close):** Candidate A rejected; AWCP is a standalone peer service, topology-neutral on isolation. ST-082's policy-scope enforcement is ai-memory's own obligation, not a co-tenancy tax, and is a precondition of the AWCP adapter contract — not gated on ST-100's still-unscored topology.
- **[Phase 05] Mechanism settled — ADR-018 Accepted 2026-11-03:** Row-Level Security keyed on transaction-local `app.policy_scope`, set only via `withPolicyScope()`, with an allow-list guard. Accepted as the mechanism decision only; enforcement is not enabled. The PO accepted the SC #2 spike (real table + pool, not via `list_thoughts`) by override; handler-level proof moves to Phase 6.
- **Sequencing constraint carried into Phase 7:** Graph write-path scope identity (GRAPH-01) must land before graph read-path filtering (GRAPH-02) — filtering already-fused entity nodes is enforcement without effect.
- **Fail-closed, not fail-open:** Do not copy the existing `project` context filter's fail-open shape. Absence of scope must deny, matching PROJECT.md's binding constraint.
- [Phase 05]: promote() carries policy_scope forward from the source shard; capture_thought writes interim 'corporate' (D-05); thoughts.policy_scope has no DEFAULT
- [Phase 05]: Phase 5 plan work lives on branch gsd/phase-05-policy-scope-foundation (main reported protected by the executor guard)
- [Phase 05]: 05-02: DECISION-01 resolved as Postgres RLS keyed on transaction-local app.policy_scope (set_config via withPolicyScope), allow-list guard; proven on db-test only, not enabled in production (ADR-018)
- [Phase 05]: 05-02: A non-superuser application runtime role is a precondition of Phase 6 enabling RLS (ai_memory is a superuser; RLS would be a silent no-op)

### Roadmap Evolution

- Phase 10 added (2026-09-25): Planning Migration Handover — ST-095 extended with ST-097 Workstream A (A4–A7), split back from CAPeddle/awcp#20; closes v1.1 so v1.2 starts on GSD.

### Pending Todos

None yet.

### Blockers/Concerns

- **z2 de-enrolment hazard outlives v1.0.** Any test run against the dev `DATABASE_URL` (including native `./dev.sh`) issues `DROP SCHEMA IF EXISTS workflow CASCADE`, which deletes the real enrolled node's `execution_nodes` row. Use `mcp-test`/`db-test` for suite runs; don't run the full suite against dev unless re-enrolment is acceptable.
- **`docker compose up -d mcp` can silently keep a stale environment** after editing `.env` — compose may report `Running` instead of `Recreated`. Verify env changes inside the running process (`docker compose exec -T mcp printenv VAR`), never from `.env` or an HTTP response.
- **[Phase 05 → 6] Non-superuser runtime role is a precondition of enabling RLS.** `ai_memory` is a superuser; RLS would be a silent no-op. Who introduces the role (Phase 6 or a prerequisite story) is open (ADR-018 Non-Goals).
- **[Phase 05 → 6] Global conflict key merges across scopes (WR-02, OPEN).** `UNIQUE (content_fingerprint)` collapses identical content from two scopes into one row; becomes a cross-scope write once capture declares scope, and an existence oracle under RLS. Recorded open in ADR-018's threat table; Phase 6 must decide (likely `UNIQUE (content_fingerprint, policy_scope)`) before capture-side scope lands.
- **[Phase 05] Untriaged review warnings:** WR-01 (007 guard / migrate.ts v7 probe find the CHECK by name only), WR-03 (backfill records no count), IN-01..IN-09. See `05-REVIEW.md`.
- **Graph tools are structurally blocked, not merely unfixed** (carried from v1.0 pricing): AGE nodes carry no scope column today. Phase 7 owns the build this milestone priced.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Write-side scoping | CAPTURE-01 (`capture_thought` accepts caller-supplied `policy_scope`) | Deferred | v1.1 requirements definition | v2 — picked up when ST-101 starts |
| Vocabulary | POLICY-03 (scope vocabulary beyond the current 4 values) | Deferred | v1.1 requirements definition | v2 — only if a real use case emerges |
| Topology | ST-100 (score standalone AWCP peer-service topology) | Transferred to CAPeddle/awcp#19 (2026-09-25) | v1.0 close | AWCP-owned, not ai-memory work |
| Exposure | ST-102 (`FEATURE_WORKFLOW` unauthenticated dashboard exposure) | Transferred to CAPeddle/awcp#23 (2026-09-25) | v1.0 close | AWCP-owned decision; any fix still lands in ai-memory `server/` until extraction |
| Contact Memory | CONTACT-01 (Contact Memory domain MCP) | Backlog | Pre-v1.0 | Independent product track, v2 |
| Synthesis companion | SYNTH-01 (Obsidian companion) | Backlog | Pre-v1.0 | ST-019 dependent, v2 |

## Session Continuity

Last session: 2026-11-03
Stopped at: Phase 05 complete, ready to plan Phase 6
Resume file: None

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

*Next action: merge the Phase 5 PR, then `/gsd-plan-phase 6` — Phase 6 wires every SQL retrieval path onto `withPolicyScope()` and enables RLS, after settling the non-superuser role and the WR-02 conflict key.*

## Operator Next Steps

- Merge the Phase 5 PR (ST-082), then run `/gsd-plan-phase 6`. Phase 6 planning must take up the non-superuser runtime role and the WR-02 conflict key first.
