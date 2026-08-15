---
phase: 3
slug: node-client-reliable-delivery-regression-safety
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test runner (built-in), Deno 2.0 — no external runner |
| **Config file** | `server/deno.json` (`"frozen": true`) |
| **Quick run command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp tests/workflow-remote-node-hub.test.ts` |
| **Full suite command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` |
| **Estimated runtime** | quick ~10s · full ~4m15s |

**Grant note (D-09).** The client's spool path must be injectable so its tests write under `/tmp`
and stay inside the existing `--allow-write=/tmp` grant. If any test needs `~/.awcp/`, CLAUDE.md's
grant inventory must be widened *and* its comment block updated — that inventory is documented as
load-bearing, and a stale one reads as "these are the only files that spawn anything".

**Stack prerequisite (D-01).** `FEATURE_WORKFLOW` must be enabled on the base `mcp` service before
any real-node leg runs; today `POST /workflow/nodes/register` returns 404 on the dev hub. The
`mcp-test` service is unaffected — `workflow-node-hub-e2e.test.ts` supplies its own environment
when spawning.

---

## Sampling Rate

- **After every task commit:** run the quick command above
- **After every plan wave:** run the full suite command
- **Before `/gsd-verify-work`:** full suite must be green
- **Max feedback latency:** ~15 seconds for the quick command

**Baseline comparison is by test identity, not by count (D-10).** Record the file and test name of
each of the nine known provider-401 failures (`OpenRouter 401: Missing Authentication header`) and
compare name-for-name over the pre-Phase-3 test files only. A count comparison hides a regression
whenever one break coincides with one flaky recovery, and this phase's new tests join the same
suite so the total shifts regardless.

---

## Per-Task Verification Map

*Populated by `/gsd-plan-phase` once `03-NN-PLAN.md` files define task IDs. Every task must carry
an automated verify or a Wave 0 dependency.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| — | — | — | EVENT-01..04, SAFE-01/02 | — | — | — | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `FEATURE_WORKFLOW` enabled on the base `mcp` service in `docker-compose.yml`, container
      recreated, and `POST /workflow/nodes/register` verified to return something other than 404 —
      this gates every real-node task and is currently not task-shaped anywhere
- [ ] Client-logic test file created (new, or extending `server/tests/workflow-remote-node-hub.test.ts`)
      with the spool path injected under `/tmp`
- [ ] Nine provider-401 failing tests enumerated by file and test name, recorded as the D-10 baseline

*Existing infrastructure otherwise covers the phase: Deno runner, `_helpers/serverProcess.ts` for
spawned-hub tests, and Phase 2's per-`node_id` scoping pattern that D-02 requires new assertions to
follow.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-node run on z2 producing criterion-6 evidence | EVENT-01..04 | Requires the physical Ubuntu node over the tailnet; no CI runner has tailnet membership | `ssh personal-server`, run the client against `http://100.106.232.78:3000`, capture stdout/stderr, then commit the transcript plus a scoped SQL readback into the findings doc |
| Enrolment window open → register → close → closure proof | — | Mutates the dev stack's environment and requires two container recreates | Follow D-11 steps 1–6; the closure proof is a further registration with a fresh unknown bearer returning 401 |
| Disconnection experiment (experiment 4) | EVENT-02, EVENT-03 | Simulated client-side on z2 per D-18; never by stopping the dev hub | Drop the tailnet link or misconfigure the client's endpoint, observe spooling, restore, observe replay |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
