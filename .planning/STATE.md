---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: Node Client, Reliable Delivery & Regression Safety
status: ready
last_updated: "2026-08-15T00:00:00.000Z"
last_activity: 2026-08-15
last_activity_desc: "Phase 2 merged to main (PR #47 -> 47284cc, CI green). Phase 3 preflight done: z2 reachable both directions, so criterion 6 is provable; three constraints recorded for discuss-phase to settle."
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
Status: Ready to discuss — `/gsd-plan-phase 3` was run 2026-08-15 and stopped at its CONTEXT.md gate by choice; discuss-phase is the next gate, then re-run plan-phase.
Last activity: 2026-08-15 — Phase 2 merged to `main` (PR #47 → `47284cc`, all three CI jobs green, including `server-integration-tests`, red since 2026-08-04 and cleared by this merge). Phase 3 preflight resolved the reachability blocker and three constraints below.

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
| 2. Remote Node Identity & Hub | 2 | not measured | not measured |

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

- ~~**z2 reachability**~~ — **RESOLVED 2026-08-15, both directions.** Inbound: `ssh personal-server` (the `~/.ssh/config` alias for Tailscale `100.65.192.115`). A bare `ssh z2` fails publickey because it matches no alias and offers no key — that near-miss is what made the node look unreachable, so use the alias. Node is Ubuntu `6.8.0-136`, **Node v18.19.1, no Deno**, matching the plan's §7.1 assumption. Outbound: `curl http://100.106.232.78:3000/health` **from z2** returns `{"status":"healthy"}`. Criterion 6 is therefore **provable — do not record UNPROVEN on reachability grounds.** Spooled replay from a real client is what still has to discharge it.
- **Only the dev `mcp` service is reachable from z2, and it is backed by the persistent dev database.** `docker-compose.yml:54` publishes `3000:3000` on all interfaces; `mcp-test` is `127.0.0.1:3001:3000` — loopback-only. So a real node POSTing `run_events` over the tailnet writes to `db`, not `db-test`. CLAUDE.md's "tests never touch the dev database" guarantee covers the Deno suite, not an external node, so it does not protect this path. Three options, each with a cost: pollute dev data, republish `mcp-test` off loopback, or stand up a third stack. **SAFE-01/02 ("existing tests pass unmodified") is what dev-state drift threatens**, so this is a decision with consequences, not a preference.
- **`server/scripts/awcp-node-client.js` + ESM is a `SyntaxError` as specified.** The repo contains **no `package.json` at any level**, so Node resolves a bare `.js` as CommonJS. Pick `.mjs`, a scoped `package.json` with `"type":"module"`, or CJS — at plan time, not mid-execution. Node 18 also emits an ExperimentalWarning on global `fetch`, which will land in any captured stderr.
- **`AWCP_NODE_ENROLMENT_SECRET` is unset/empty in both `mcp` and `mcp-test`**, so enrolment is closed and the client's first registration gets the quiet 401 by design until an operator sets it. Prior verification covered the variable's *spelling* across three files, not that it holds a *value*.
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
*Next action: `/gsd-discuss-phase 3`, then `/gsd-plan-phase 3`. Reachability is already verified (see Blockers/Concerns) — do not re-probe it. Discuss-phase should settle the three constraints recorded there: where the real-node leg points given `mcp-test` is loopback-only, the `.mjs`/scoped-`package.json`/CJS choice, and who sets `AWCP_NODE_ENROLMENT_SECRET`.*
