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

Abbreviations for the automated commands, all run from the repo root:

- **QUICK-E2E** = `docker compose --profile test exec -T mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno tests/workflow-node-client-hub-e2e.test.ts`
- **QUICK-UNIT** = `docker compose --profile test exec -T mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp tests/awcp-node-client.test.ts`
- **FULL** = `docker compose --profile test exec -T mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/`

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01 T1 | 03-01 | 1 | SAFE-01, SAFE-02 | T-03-01-04 | Baseline taken against `db-test`, never the dev database; records identities *and* outcomes | measurement | FULL with `--junit-path=/tmp/baseline.junit.xml`, then format + count assertions on `03-REGRESSION-BASELINE.txt` | ✅ existing suite | ⬜ pending |
| 03-01 T2 | 03-01 | 1 | SAFE-01 | T-03-01-01, T-03-01-02 | Flag verified inside the running container, not inferred from an HTTP response | config probe | `docker compose exec -T mcp printenv FEATURE_WORKFLOW` = `true` **and** `POST /workflow/nodes/register` = `401` | ✅ (curl) | ⬜ pending |
| 03-02 T1 | 03-02 | 2 | EVENT-03 | T-03-02-01, T-03-02-03, T-03-02-04 | `0700`/`0600` state modes; no credential persisted; ack wire type asserted uncoerced | integration (real process) | QUICK-E2E | ❌ W0 — file created by this task | ⬜ pending |
| 03-02 T2 | 03-02 | 2 | EVENT-01 | T-03-02-05 | Scoped `WHERE node_id =` assertions; cleanup-in-`finally` by `bearer_token_hash` | integration (real process) | QUICK-E2E | ❌ W0 | ⬜ pending |
| 03-03 T1 | 03-03 | 3 | EVENT-04 | T-03-03-01, T-03-03-02, T-03-03-03 | Bounded spool; crash-safe rewrite-and-rename proven by an injected mid-write failure | unit (in-process) | QUICK-UNIT | ❌ W0 — file created by this task | ⬜ pending |
| 03-03 T2 | 03-03 | 3 | EVENT-02, EVENT-03 | T-03-03-02 | Byte-identical spool after a failed flush; oldest-first order asserted on the wire | unit (in-process) | QUICK-UNIT | ❌ W0 | ⬜ pending |
| 03-03 T3 | 03-03 | 3 | EVENT-01 (discriminator) | T-03-03-04 | Counter rebuilt from disk after a drain and after spool deletion | unit (in-process) | QUICK-UNIT | ❌ W0 | ⬜ pending |
| 03-04 T1 | 03-04 | 4 | EVENT-03, EVENT-04 | T-03-04-02, T-03-04-03, T-03-04-04 | Terminal states on 400/401/404/413; bounded backoff; single request on 401 | unit (in-process) | QUICK-UNIT | ❌ W0 | ⬜ pending |
| 03-04 T2 | 03-04 | 4 | — (criterion-6 scope: heartbeat, checkpoint) | T-03-04-05 | Synthetic payloads only; no `child_process`, no `git` | unit (in-process) | QUICK-UNIT | ❌ W0 | ⬜ pending |
| 03-04 T3 | 03-04 | 4 | — (D-13 gate) | T-03-04-01 | Six output surfaces captured; positive control so absence cannot pass vacuously | unit (in-process) | QUICK-UNIT | ❌ W0 | ⬜ pending |
| 03-05 T1 | 03-05 | 5 | SAFE-01 | T-03-05-04 | Grant inventory names every file that earns each grant; flags unchanged | doc check | `grep` for both new test filenames in `CLAUDE.md`; `grep -l startServerProcess tests/*.ts` subset check | ✅ existing | ⬜ pending |
| 03-05 T2 | 03-05 | 5 | SAFE-01, SAFE-02 | T-03-05-01, T-03-05-02, T-03-05-03 | Empty filtered `diff`; corpus `total`/`active` unchanged; two consecutive green runs | regression | FULL with `--junit-path=/tmp/final.junit.xml`, then `diff` of the filtered baseline and final captures | ✅ existing | ⬜ pending |
| 03-06 T1 | 03-06 | 6 | EVENT-01..04 (enrolment) | T-03-06-02, T-03-06-03 | Secret verified by `printenv \| wc -c`; closure proven by a 401, not assumed | manual/scripted (real node) | `printenv` length check + scoped `execution_nodes` count + `stat` on z2's `~/.awcp` modes | ✅ (ssh/curl/psql) | ⬜ pending |
| 03-06 T2 | 03-06 | 6 | EVENT-01, EVENT-02, EVENT-03, EVENT-04 | T-03-06-05, T-03-06-06 | Client-side disconnection only; every readback `node_id`-scoped | manual/scripted (real node) | scoped `run_events` readback asserting ≥1 `heartbeat` and ≥1 `checkpoint` row, plus `status` output | ✅ (ssh/psql) | ⬜ pending |
| 03-06 T3 | 03-06 | 6 | EVENT-01..04 (evidence) | T-03-06-01 | Mechanical pre-commit credential gate over the staged diff | doc check | `grep -n '^## 16\.'` on the findings doc **and** `git diff --cached \| grep -F -f /tmp/awcp-credentials.list` finding nothing | ✅ (git/grep) | ⬜ pending |

**Sampling continuity:** no three consecutive tasks lack an automated verify — every task above carries one.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `FEATURE_WORKFLOW` enabled on the base `mcp` service in `docker-compose.yml`, container
      recreated, and `POST /workflow/nodes/register` verified to return something other than 404 —
      this gates every real-node task. **Now task-shaped: 03-01 Task 2**, with the flag verified from
      inside the running container (`docker compose exec -T mcp printenv FEATURE_WORKFLOW`) rather than
      inferred from the HTTP response.
- [ ] Client-logic test file created with the spool path injected under `/tmp`. **Resolved as two
      files, not one:** `server/tests/awcp-node-client.test.ts` (in-process, 03-03/03-04) and
      `server/tests/workflow-node-client-hub-e2e.test.ts` (real process, 03-02). The split is forced —
      hub-side duplicate suppression (EVENT-01) is a server property that an in-process spool test
      structurally cannot observe. `server/tests/workflow-remote-node-hub.test.ts` is left unmodified
      and used as the scoping/assertion analog only.
- [ ] Provider-401 failing tests enumerated by file and test name, recorded as the D-10 baseline —
      **03-01 Task 1**, extended beyond D-10's letter: the baseline records **passing** tests too, as
      `file::name => ok|FAILED`. A failures-only baseline misses a test that *disappears* (renamed,
      skipped, file excluded), which registers as neither a new failure nor a changed count — the same
      class of miss D-10 was written to close. D-10 states nine known failures; if the observed count
      differs, 03-01 records the delta as a finding rather than adjusting the expectation.

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
