---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_phase_name: node-client-reliable-delivery-regression-safety
status: executing
stopped_at: Completed 03-05-PLAN.md
last_updated: "2026-08-16T07:28:54.481Z"
last_activity: 2026-08-16
last_activity_desc: Phase 03 execution started
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 8
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-05)

**Core value:** Knowledge worth retaining must remain accurately recallable across tools, sessions, projects, and time without leaking across policy boundaries.
**Current focus:** Phase 03 — node-client-reliable-delivery-regression-safety

## Current Position

Phase: 03 (node-client-reliable-delivery-regression-safety) — EXECUTING
Plan: 6 of 6
Status: Ready to execute
Last activity: 2026-08-16 — Phase 03 execution started

Progress: [█████████░] 88%

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
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | 25m | 2 tasks | 2 files |
| Phase 03 P02 | 45m | 2 tasks | 2 files |
| Phase 03 P03 | 35m | 3 tasks | 2 files |
| Phase 03 P04 | 60m | 3 tasks | 2 files |
| Phase 03 P05 | 40m | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Phase 1 (U1, 2026-08-05):** Policy-scope enforcement surface priced at 64+ hours (8+ days) total; 1 day for the critical-path straightforward subsurface. Candidate A viable IF the straightforward paths prove out at estimate. Pricing gates ADR-016 acceptance — this figure is the deciding input for Phase 4.
- **ST-088 constraint:** No node credential may enter the set `findMissingRequiredEnv` checks in `startupValidation.ts` (L127-141 — inline checks over `OPENROUTER_API_KEY` and `MEMORY_API_KEY`; there is no `REQUIRED_ENV` constant, despite earlier plan drafts naming one). Adding one would prevent boot when no node is configured. Validate in the hub endpoint, not at startup.
- **Graph tools are structurally blocked** (not merely unfixed): AGE nodes carry no scope column. Enforcement requires extraction-time tagging or call gating. ST-082 owns the build; this milestone priced it.
- **Node client must be plain Node.js ESM, zero npm deps:** z2 (Ubuntu 24.04.4) has no Deno. Prefer Node for spool JSONL logic over POSIX shell+curl.
- **Stage 2 findings append-only:** New sections are appended to `docs/investigations/ST-084-awcp-host-spike-findings.md`; Stage 1 text stands as written. **Phase 3 writes `## 16.`, not §13** — that document already carries two sections numbered `## 13.` (`:730` and `:1039`), so a third would make the number useless as a reference. ROADMAP's delivery-artifact line records the supersession.
- [Phase ?]: D-10 baseline captured pre-Phase-3 (400 testcases: 391 ok / 9 FAILED, matches expected count exactly, no delta) and FEATURE_WORKFLOW enabled on base mcp service per D-01 — dev hub node surface now mounts (401 instead of 404).
- [Phase ?]: SAFE-01/SAFE-02 deliberately left Pending after 03-01 — 03-05-PLAN.md owns the actual full-suite identity-diff discharge against this plan's baseline.
- [Phase ?]: 03-02: flushOnce returns {outcome, acked, acknowledged} — the acknowledged field is additive beyond the plan's literal spec, needed so EVENT-01's test can assert event_id-inclusive deep-equality without a second raw HTTP call
- [Phase ?]: 03-02: node:os hostname() requires --allow-sys=hostname under Deno's node: compat layer (empirically confirmed) but not under real Node — registerNode wraps it in try/catch and falls back to omitting the optional field; process.platform used instead of os.platform() since it needs no syscall permission
- [Phase ?]: 03-03: flush() return shape gained delivered/remaining fields additively — acked kept for 03-02 tracer-test compatibility rather than being replaced
- [Phase ?]: 03-03: transport-level throws (fetchImpl itself throwing) are distinguished from AwcpHttpError inside flush()'s catch — only genuine transport failures become outcome=unreachable; 400/401 still propagate unchanged, preserving 03-04's scope
- [Phase ?]: 03-03: D-14 restart proof added — client_seq counter confirmed independent of spool contents even after full drain or spool deletion, closing ROADMAP criterion 1's vacuous-pass mode
- [Phase ?]: 03-04: flush() loop restructured to dynamic (re-reads spool each iteration) so a single call can both drop a D-15 rejection and deliver the remainder — required by the plan's own Task 1 acceptance criteria, not a deviation
- [Phase ?]: 03-04: found and fixed a real infinite-loop bug during testing — a 200 whose acknowledged array does not intersect the batch sent made zero progress but reset the retry counter every time; bounded it with the same MAX_FLUSH_ATTEMPTS backoff policy used for retryable/unreachable
- [Phase ?]: 03-04: flushOnce now checks res.status before parsing the body — a real 401 is plain text, not JSON, and the old unconditional res.json() call would have misclassified it as unreachable, defeating D-17
- [Phase ?]: 03-05: SAFE-01/SAFE-02 discharged by empty name-for-name diff (400/400 identical, same 9 known failures) and measured corpus counts (33/33 total/active unchanged before/after full suite run)
- [Phase ?]: 03-05: Plan's Task 2 verify grep anchors lacked the './' prefix that every baseline/JUnit classname carries — corrected when running the gate (Rule 3), not by changing 03-REGRESSION-FINAL.txt's format
- [Phase ?]: 03-05: CLAUDE.md grant inventory now names workflow-node-client-hub-e2e.test.ts (--allow-run=deno) and awcp-node-client.test.ts + workflow-node-client-hub-e2e.test.ts (--allow-write=/tmp); docker compose command line itself unchanged
- [Phase ?]: 03-05: this was the last permitted full-suite run for the phase — 03-06 enrols a real node next; workflow-mvp-e2e.test.ts's DROP SCHEMA must not run again until after the real-node leg completes

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**z2 reachability**~~ — **RESOLVED 2026-08-15, both directions.** Inbound: `ssh personal-server` (the `~/.ssh/config` alias for Tailscale `100.65.192.115`). A bare `ssh z2` fails publickey because it matches no alias and offers no key — that near-miss is what made the node look unreachable, so use the alias. Node is Ubuntu `6.8.0-136`, **Node v18.19.1, no Deno**, matching the plan's §7.1 assumption. Outbound: `curl http://100.106.232.78:3000/health` **from z2** returns `{"status":"healthy"}`. Criterion 6 is therefore **provable — do not record UNPROVEN on reachability grounds.** Spooled replay from a real client is what still has to discharge it.
- ~~**Loopback-only `mcp-test`**~~, ~~**`.js` vs ESM**~~, ~~**unset enrolment secret**~~ — **all three SETTLED 2026-08-15 in `03-CONTEXT.md` (D-01..D-04, D-11).** Do not re-raise them as open questions. In short: the real-node leg points at the dev hub on `:3000` and its rows stay as criterion-6 evidence; the client is **`awcp-node-client.mjs`**, because the repo has no `package.json` at any level and a bare `.js` would resolve as CommonJS; enrolment is opened by setting `AWCP_NODE_ENROLMENT_SECRET`, used for one registration, then closed again.
- **CORRECTION 2026-08-15 (`ce-doc-review` P0): the dev hub does not expose the node surface at all.** `POST /workflow/nodes/register` returns **404**, not the "quiet 401" recorded earlier — the routes mount only inside `if (workflowFeatureEnabled())`, and `FEATURE_WORKFLOW` is set solely by `docker-compose.workflow.yml`. **The earlier claim was inferred from source, not observed**; the preflight probed `/health`, which answers identically either way. `FEATURE_WORKFLOW` must be enabled on the **base `mcp` service** (not via the overlay, which also disables the entity/consolidation/backfill workers and the model provider) before any real-node leg runs. See `03-CONTEXT.md` D-01.
- **CORRECTION 2026-08-15: D-02's original reason was false.** `workflow-remote-node-hub.test.ts` **does** read `execution_nodes` and `run_events` throughout; what makes a foreign node's rows harmless is that every read is **scoped** by `node_id` or `bearer_token_hash`. The conclusion stands, the reason does not — and every new Phase 3 assertion over those tables must carry the same scoping.
- **The existing suite destroys the criterion-6 evidence.** `workflow-mvp-e2e.test.ts:104` and `:601` both run an unconditional `DROP SCHEMA IF EXISTS workflow CASCADE`, which also deletes z2's registration and de-enrols it behind the opaque 401. Capture evidence into findings `## 16.` at experiment time. **The plan sequences around this**: the last destructive full-suite run is wave 5 (`03-05`), enrolment is wave 6 (`03-06`) — do not run the full suite after enrolment.
- **Node 18 emits an ExperimentalWarning on global `fetch`.** Settled as D-06: use `fetch` and suppress the warning, because captured stderr is evidence in this phase and the notice would otherwise open every transcript.
- **z2 IS NOW ENROLLED (2026-08-18, plan 03-06) — the de-enrolment hazard is live, not theoretical.** `node_id` `1fbae82b-b12d-46dc-bbbf-d64784402ca4`, enrolment window opened, used once, and closed (closure proven by a 401). **Any test run against the dev `DATABASE_URL` — including the native `./dev.sh` inner loop — issues `DROP SCHEMA IF EXISTS workflow CASCADE`, deletes z2's `execution_nodes` row, and de-enrols the node behind the opaque 401.** The criterion-6 evidence cannot be regenerated without reopening a window D-11 deliberately closed. Use `mcp-test`/`db-test` for every suite run. The durable artifact is findings `## 16.`, not the rows. This hazard outlives Phase 3.
- **`docker compose up -d mcp` can silently keep stale environment.** Observed 2026-08-18: after editing `.env`, compose reported `Running` rather than `Recreated` and left the old process serving `:3000`. Compounding it, `.env` had no trailing newline, so an append concatenated onto the previous line — defeating both `sed '/^VAR=/d'` and `grep -c '^VAR'`, each of which then reported the reassuring answer. **Verify env changes inside the process** (`docker compose exec -T mcp printenv VAR | wc -c`), never from `.env` or an HTTP response.
- **ST-082 collision watch:** If ST-082 lands before Phase 4, U1 pricing becomes an actual — update the pricing table to reflect actual rather than estimated cost before writing the ADR-016 recommendation.

## Deferred Items

- ENFORCE-01/02/03 (policy-scope implementation) — v2, owned by ST-082 after host decision settled
- CONTACT-01 (Contact Memory domain MCP) — independent product track, v2
- SYNTH-01 (Obsidian companion) — ST-019 dependent, v2

## Session Continuity

**Last session:** 2026-08-16T07:28:54.467Z
**Stopped at:** Completed 03-05-PLAN.md
**Resume file:** None

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
| Node client | `server/scripts/awcp-node-client.mjs` (to be created, Phase 3 — `.mjs`, not `.js`, per D-04) |
| Phase 3 decisions | `.planning/phases/03-node-client-reliable-delivery-regression-safety/03-CONTEXT.md` |

---

*State initialized: 2026-08-05*
*Next action: `/gsd-plan-phase 3`. Read `03-CONTEXT.md` first — its thirteen decisions are locked and must not be re-litigated. Reachability is verified; do not re-probe it. `ROADMAP.md`'s **Delivery artifacts** line is already corrected to `.mjs`; the ST-088 spike plan's U3 still names `.js` and is deliberately left as-is — it is Tier-1 authority and `03-CONTEXT.md` flags the supersession rather than editing it.*
