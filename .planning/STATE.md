---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: Node Client, Reliable Delivery & Regression Safety
status: ready
last_updated: "2026-08-06T12:40:00.000Z"
last_activity: 2026-08-06
last_activity_desc: "Phase 2 executed end to end: hub tracer green, then cross-node/isolation/payload guards proven red-then-green. NODE-01..03 discharged."
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-05)

**Core value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.
**Current focus:** Phase 3 — Node Client, Reliable Delivery & Regression Safety (U3+U4)

## Current Position

Phase: 3 of 4 (Node Client, Reliable Delivery & Regression Safety)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-08-06 — Phase 2 complete; NODE-01, NODE-02, NODE-03 discharged and all four ROADMAP success criteria met.

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 2 (GSD tracking started 2026-08-05; Phase 1 completed pre-GSD)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Policy-Scope Pricing | pre-GSD | — | — |
| 2. Remote Node Identity & Hub | 2 | ~75min | ~38min |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Phase 1 (U1, 2026-08-05):** Policy-scope enforcement surface priced at 64+ hours (8+ days) total; 1 day for the critical-path straightforward subsurface. Candidate A viable IF the straightforward paths prove out at estimate. Pricing gates ADR-016 acceptance — this figure is the deciding input for Phase 4.
- **ST-088 constraint:** No node credential may enter the set `findMissingRequiredEnv` checks in `startupValidation.ts` (L127-141 — inline checks over `OPENROUTER_API_KEY` and `MEMORY_API_KEY`; there is no `REQUIRED_ENV` constant, despite earlier plan drafts naming one). Adding one would prevent boot when no node is configured. Validate in the hub endpoint, not at startup.
- **Graph tools are structurally blocked** (not merely unfixed): AGE nodes carry no scope column. Enforcement requires extraction-time tagging or call gating. ST-082 owns the build; this milestone priced it.
- **Node client must be plain Node.js ESM, zero npm deps:** z2 (Ubuntu 24.04.4) has no Deno. Prefer Node for spool JSONL logic over POSIX shell+curl.
- **Stage 2 findings append-only:** New sections (§13+) are appended to `docs/investigations/ST-084-awcp-host-spike-findings.md`. Stage 1 text stands as written.

### Pending Todos

None yet.

### Blockers/Concerns

- **z2 reachability:** Verify the Ubuntu execution node is still reachable as the first step of Phase 3 (U3). If unreachable, record UNPROVEN for criterion 6 experiments with the same honesty as Stage 1.
- **ST-082 collision watch:** If ST-082 lands before Phase 4, U1 pricing becomes an actual — update the pricing table to reflect actual rather than estimated cost before writing the ADR-016 recommendation.

## Deferred Items

- ENFORCE-01/02/03 (policy-scope implementation) — v2, owned by ST-082 after host decision settled
- CONTACT-01 (Contact Memory domain MCP) — independent product track, v2
- SYNTH-01 (Obsidian companion) — ST-019 dependent, v2

## Session Continuity

### If resuming mid-phase

1. Read `.planning/ROADMAP.md` — find current phase and open plans
2. Read story board ST-088 In Progress section for WIP status and acceptance criteria
3. Read `docs/investigations/ST-084-awcp-host-spike-findings.md` §12a before trusting any Stage 1 claim
4. Check `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` for unit contracts
5. **One In Progress slot** — do not start a second story until ST-088 is done or stalled on an external dependency
6. Commit convention: `feat(workflow): ...` or `docs(adr): ...` with `Story: ST-088` trailer on every commit

### Key file locations

| Artifact | Path |
|----------|------|
| ST-088 canonical plan | `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` |
| Stage 1+2 findings | `docs/investigations/ST-084-awcp-host-spike-findings.md` |
| ADR-016 | `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` |
| Story board | `.github/planning/story-board.md` |
| Hub remote-node source | `server/src/workflow/remoteNodeHub.ts` (created, Phase 2) |
| Node client | `server/scripts/awcp-node-client.js` (to be created, Phase 3) |

---

*State initialized: 2026-08-05*
*Next action: `/gsd-plan-phase 3` — plan Phase 3 (Node Client, Reliable Delivery & Regression Safety, U3+U4). Verify z2 reachability FIRST; if unreachable, record UNPROVEN for criterion 6 with Stage 1's honesty.*
