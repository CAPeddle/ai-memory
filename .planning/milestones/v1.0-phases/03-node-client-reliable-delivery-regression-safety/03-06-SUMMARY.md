---
phase: 03-node-client-reliable-delivery-regression-safety
plan: 06
subsystem: infra
tags: [awcp, remote-node, enrolment, criterion-6, adr-016, tailnet, spool, replay, co-tenancy, z2]

requires:
  - phase: 03-node-client-reliable-delivery-regression-safety
    provides: "03-02..03-04: the complete node client (server/scripts/awcp-node-client.mjs) deployed to z2; 03-05: SAFE-01 empty-diff result and SAFE-02 corpus counts (33/33), quoted verbatim into the findings section; 03-01: FEATURE_WORKFLOW enabled on the base mcp service, without which /workflow/nodes/* answers 404"
  - phase: 02-remote-node-identity-hub
    provides: "the hub-side enrolment path and run_events ingestion this plan drove with a real client"
provides:
  - "docs/investigations/ST-084-awcp-host-spike-findings.md ## 16. — the durable criterion-6 artifact: redacted transcripts, a node_id-scoped SQL readback, the closure proof, the element-by-element criterion-6 disposition, the co-tenancy observation, and host-fit friction for criterion 7"
  - "z2 enrolled as node_id 1fbae82b-b12d-46dc-bbbf-d64784402ca4, with the enrolment window closed and closure proven by a 401"
  - "Criterion-7 raw material captured first-hand (## 16.8) rather than written from recall in Phase 4"
  - "Two recorded-not-fixed defects for Phase 4: the schema column is registered_at (not first_seen_at), and last_seen_at never advances on event ingestion"
affects:
  - "Phase 4 (U5+U6) — consumes the criterion-6 disposition, the criterion-7 friction subsection, and the last_seen_at question when writing the final ADR-016 recommendation"
  - "Every future session in this repo — z2 is enrolled, so any suite run against the dev DATABASE_URL de-enrols it; and env changes must be verified INSIDE the process, never from .env or an HTTP response"

actuals:
  tokens: 7787
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Verify a container's environment inside the running process (docker compose exec -T mcp printenv VAR | wc -c), never from the env file or an HTTP response — the only check that survives a silent compose no-op and a malformed env append"
    - "Mechanical credential-leak gate over the staged diff (grep -F -f against a mode-0600 list), run before commit rather than reading the diff by eye"
    - "Capture-and-write-up at experiment time (D-03): the findings section is the artifact, not the database rows"

key-files:
  created: []
  modified:
    - docs/investigations/ST-084-awcp-host-spike-findings.md
    - .planning/STATE.md
    - .planning/phases/03-node-client-reliable-delivery-regression-safety/03-06-PLAN.md

key-decisions:
  - "PO approved both of the plan's flagged open questions before Task 2 ran: the co-tenancy observation (now Task 2 step 8) and the host-fit friction subsection (now ## 16. item 8). The plan, its <open_questions> block, and its acceptance criteria were all amended so the findings section does not reproduce 'This plan does not do it' while doing it."
  - "The co-tenancy probe was sequenced AFTER the scoped SQL readback, not before. It is the only step in Task 2 that writes to the dev database, and it must not sit between the experiments and the capture of their evidence."
  - "The one capture_thought row is retained by decision, with content identifying it as the ST-088/03-06 probe. It was not cleaned up: the suite cannot be run against the dev database here, and a targeted delete would run over the same connection that must not touch workflow."
  - "Repo-rescan is recorded as an adjacent U3 capability, NOT a criterion-6 partial. Criterion 6's text names authenticated ingestion with spooled replay; repo-rescan is not among them, so its absence is a U3 scope gap rather than a criterion-6 shortfall. This corrected the plan's own original framing in two places."
  - "Tasks 1-3 landed in ONE commit rather than three. The <human-check> gate is on this plan's OUTPUT, so the findings section had to be written, staged and read by a human before any commit existed; per-task commits were not available without committing evidence ahead of the gate."

requirements-completed: [EVENT-01, EVENT-02, EVENT-03, EVENT-04]

coverage:
  - id: D1
    description: "z2 enrolled through the real Phase 2 enrolment path, the window opened for exactly one registration and then closed, with closure proven positively rather than assumed"
    requirement: "EVENT-01"
    verification:
      - kind: e2e
        ref: "findings ## 16.2 — register returned uuid 1fbae82b-b12d-46dc-bbbf-d64784402ca4; closure attempt with a fresh unknown 64-hex bearer plus the old secret returned HTTP 401"
        status: pass
      - kind: integration
        ref: "docker compose exec -T mcp printenv AWCP_NODE_ENROLMENT_SECRET | wc -c => 65 when open, 1 when closed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Baseline delivery with heartbeat and checkpoint — criterion 6's half that spool-and-replay alone does not cover"
    requirement: "EVENT-02"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 baseline block; scoped readback shows client_seq 1 checkpoint, 2-4 heartbeat, 5 checkpoint"
        status: pass
    human_judgment: false
  - id: D3
    description: "Experiment 4 — a node that loses hub connectivity retains bounded local events and replays them when connectivity returns, with entries removed only after acknowledgement"
    requirement: "EVENT-02"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 — flush against unroutable endpoint returned deferred/exit 75 with spool intact at 5; after restore, acked [6,7,8,9,10]/exit 0/spool 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Experiment 5 — replaying an already-delivered (node_id, client_seq) batch produces no duplicate hub state and is still fully acknowledged"
    requirement: "EVENT-01"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 — row count for this node_id 10 before and 10 after the replay flush; identical acks both times"
        status: pass
    human_judgment: false
  - id: D5
    description: "Experiment 6 — invalid authentication is terminal, makes exactly one request, and leaves the spool intact; a wrong bearer is not distinguished from an unenrolled one"
    requirement: "EVENT-03"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 — terminal_auth, exit 77, stderr 'awcp-node-client: terminal reason=auth_failed spooled_events=1', spool still 1"
        status: pass
    human_judgment: false
  - id: D6
    description: "Spool overflow drops the OLDEST event and increments a visible counter rather than silently filling disk"
    requirement: "EVENT-04"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 — three reason=spool_overflow lines for client_seq 12,13,14; status dropped_events=3 spooled_events=5; readback gap at 12-14 is independent evidence of oldest-first eviction"
        status: pass
    human_judgment: false
  - id: D7
    description: "The client_seq counter is monotonic across a real process exit (D-14), not merely across a rebuilt config object"
    requirement: "EVENT-04"
    verification:
      - kind: e2e
        ref: "findings ## 16.3 — client_seq 20 emitted from a fresh process after full drain, strictly greater than every earlier value in the readback"
        status: pass
    human_judgment: false
  - id: D8
    description: "The durable criterion-6 artifact exists and is credential-free: a redacted transcript plus a node_id-scoped SQL readback, committed at experiment time"
    verification:
      - kind: automated_ui
        ref: "grep -c '^## 16\\.' => 1; git diff --cached | grep -F -f /tmp/awcp-credentials.list => no match, re-run against the committed object and every commit on the branch"
        status: pass
      - kind: integration
        ref: "scoped readback: 17 rows for the node_id, heartbeat>0 AND checkpoint>0 AND count>10 => t"
        status: pass
    human_judgment: false
  - id: D9
    description: "Co-tenancy observation — memory tools exercised against the same stack the node streamed into"
    verification:
      - kind: manual_procedural
        ref: "findings ## 16.7 — search_thoughts HTTP 200 / 0.221s, capture_thought HTTP 200 / 0.029s, no behavioural or latency difference observed"
        status: pass
    human_judgment: true
    rationale: "The calls succeeded, but their SUFFICIENCY is a judgment call, not an automated result. This is a two-call smoke signal with no concurrency and no load; a null result must not be read as evidence that the topology scales on this host. Phase 4 needs a human to weigh what it supports."
  - id: D10
    description: "Criterion-6 disposition stated element by element, with repo-rescan classified as an adjacent U3 capability rather than a criterion-6 shortfall"
    verification:
      - kind: manual_procedural
        ref: "findings ## 16.5 disposition table — six named elements each discharged with an evidence pointer"
        status: pass
    human_judgment: true
    rationale: "The plan carries a <human-check> on this plan's OUTPUT: a mechanical gate proves the two known credential strings are absent, but cannot judge whether a quoted line reveals something else worth withholding, nor whether the disposition is an honest account rather than a favourable one. Discharged by a human read before commit, and the disposition's framing was corrected by the PO at that gate."

duration: 117min
completed: 2026-08-18
status: complete
---

# Phase 3 Plan 6: Criterion-6 Real-Node Evidence Summary

**ADR-016 criterion 6 now has the real-node evidence nothing shipped in Phase 3 previously discharged — z2 enrolled through the real Phase 2 path, all eight reliable-delivery behaviours demonstrated against the dev hub over the tailnet, and the result committed as findings `## 16.` rather than left as database rows that any suite run would destroy.**

## Performance

- **Duration:** ~117 min (includes the human-check gate on the output)
- **Started:** 2026-08-18 11:26Z (first precondition probe)
- **Completed:** 2026-08-18 13:23Z (merge of PR #50)
- **Tasks:** 3 of 3
- **Files modified:** 3 (plus 2 in the separate planning-state fix)

## Accomplishments

- **Criterion 6 discharged for every element it names** — authentication, heartbeat, checkpoint, spool, replay, and experiments 4-6, each with an evidence pointer in `## 16.5`. ADR-016 stays Proposed/Conditional; Phase 4 owns the recommendation.
- **All eight behaviours proven on the real node**, not the three the phase's shorthand names: baseline heartbeat/checkpoint, experiments 4-6, spool overflow, and the D-14 counter across a real process exit.
- **The evidence is durable.** The write-up plus a `node_id`-scoped readback is committed; the rows themselves survive neither `DROP SCHEMA` nor `docker compose down -v` (D-03).
- **Criterion-7 raw material captured first-hand** (`## 16.8`) so Phase 4 does not write inheritance cost from recall.
- **A silent security failure was caught and documented** — the enrolment window nearly stayed open (see Issues Encountered). This is the phase's most transferable finding.

## Task Commits

Tasks 1-3 landed in a **single** commit rather than one per task:

1. **Tasks 1-3 (enrol + experiments + findings)** — `c8cd774` (feat), squashed to `b32b6ab` on `main` via PR #50

**Deliberate deviation from the atomic-commit convention, with cause:** this plan's `<human-check>` is on its *output*. The `## 16.` section had to be written, staged, and read end-to-end by a human before any commit existed, so per-task commits were unavailable without committing evidence ahead of the gate. Tasks 1 and 2 produce no repo artifact of their own — their output is remote state on z2 and captured transcripts under `/tmp` — so there was nothing to commit until Task 3 wrote the section.

A second, separate commit `2e94be4` (fix) carried the planning-state root-cause fix described under Deviations; it is not part of this plan's scope.

## Files Created/Modified

- `docs/investigations/ST-084-awcp-host-spike-findings.md` — new `## 16.` section (374 lines): numbering rationale, enrolment open/close with redacted transcripts, all experiment transcripts, the scoped SQL readback, the criterion-6 disposition, regression-safety carry-forward, co-tenancy, host-fit friction, open questions, standing hazard
- `.planning/STATE.md` — standing de-enrolment hazard and the stale-environment failure mode recorded in Blockers/Concerns
- `.planning/phases/.../03-06-PLAN.md` — amended for the two PO-approved open questions; `.planning/STATE.md` added to `files_modified`

## Decisions Made

See `key-decisions` in frontmatter. The load-bearing five: both open questions approved and folded in; the co-tenancy probe sequenced after the readback; the `capture_thought` row retained with provenance rather than cleaned up; repo-rescan reclassified as an adjacent U3 capability; and the single-commit shape forced by the output gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's readback query named a column that does not exist**
- **Found during:** Task 2 (step 7, scoped SQL readback)
- **Issue:** `SELECT ... first_seen_at ...` failed with `column "first_seen_at" does not exist`. The actual schema is `node_id, bearer_token_hash, registered_at, last_seen_at, status, hostname, platform`.
- **Fix:** Used `registered_at`. `bearer_token_hash` remained deliberately unselected (D-13).
- **Verification:** Query returned the single expected row; recorded in `## 16.4` as a plan defect for Phase 4.
- **Committed in:** `c8cd774`

**2. [Rule 2 - Correctness] The credential-leak gate did not cover every credential the run handled**
- **Found during:** Task 2 (step 8, co-tenancy)
- **Issue:** The co-tenancy probe required `MEMORY_API_KEY`, which was not in `/tmp/awcp-credentials.list`, so the mechanical gate would not have caught it leaking into the diff.
- **Fix:** Appended it to the list (verified no empty line, which would make `grep -F -f` match everything) before composing the section.
- **Verification:** Final gate ran with 3 entries and found no match in the staged diff, the committed object, or any commit on the branch.
- **Committed in:** `c8cd774`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 correctness)
**Impact on plan:** Both were necessary for correctness. No scope creep — the plan's task boundaries were unchanged.

**Separately, outside this plan's scope:** `.planning/STATE.md` progress metadata reported `total_phases: 2` against a 4-phase roadmap with no `percent`. Root-caused to two independent defects (STATE declaring `milestone: v1.0` while ROADMAP's headings never said `v1.0`, defeating GSD's `milestoneBounded` gate; and `✅ Complete` cells defeating an anchored `/^complete$/i` test). Fixed at the source in ROADMAP.md and regenerated via GSD's own `syncStateFrontmatter` — deliberately NOT bundled into the evidence commit. See `2e94be4`.

## Issues Encountered

**1. The enrolment window nearly stayed open — a silent failure, and the phase's most transferable finding.**

After removing the secret from `.env`, `docker compose up -d mcp` reported `Running` rather than `Recreated` and left the old process — still holding the secret — serving `:3000`. The cause was subtler than a missed recreate: `.env` had **no trailing newline**, so `printf ... >> .env` concatenated the assignment onto the end of the preceding `ANTHROPIC_API_KEY=` line. Consequently `sed '/^AWCP_NODE_ENROLMENT_SECRET=/d'` matched nothing and exited 0, and `grep -c '^AWCP_NODE_ENROLMENT_SECRET' .env` read `0` — **both returning the reassuring answer while the window stood open.** Only a byte-level inspection located it at offset 128 of another line.

It was caught solely because the plan mandates verifying the value *inside the running process* rather than inferring it from `.env` or from an HTTP response (the hub answers the same opaque 401 for a wrong bearer, an unenrolled bearer, and a secret it never received). `ANTHROPIC_API_KEY` was restored to its exact original 128 bytes; it is not referenced in `docker-compose.yml`, so nothing consumed the corrupted value. Recorded in `## 16.2` and in STATE.md Blockers/Concerns.

**2. The Docker stack was down at session start.** All five containers had exited (SIGTERM) before work began. Brought up with `docker compose up -d` and every precondition re-verified before Task 1 — the workflow schema survived in its volume with zero enrolled nodes, i.e. a clean starting state.

## Environmental Drift Check

**Not applicable to this plan.** 03-01's caveat concerns two ranking-sensitive tests whose outcome could shift between the regression *baseline* and the *gate* if `db-test` restarted — a hazard specific to the SAFE-01/SAFE-02 comparison that 03-05 owned. 03-06 ran **no test suite at all** (deliberately: D-03 prohibits any suite run against the dev database after enrolment), so there is no baseline-to-gate comparison here to drift. The 03-05 result is quoted into `## 16.6` as a number, not re-derived.

## Requirements

`requirements: [EVENT-01, EVENT-02, EVENT-03, EVENT-04]` — all four discharged; see the `coverage` block for the itemised mapping. EVENT-01 (duplicate suppression) is proven twice: by the replay in Experiment 5 and by the hub's own row count holding at 10.

## Verification Evidence

- Enrolment window: `65` chars in-process when open, `1` when closed; closure proven by a **401** to a fresh unknown bearer presenting the old secret, built via `curl --config` so no header value reached argv.
- D-12: concatenating every file under z2's `~/.awcp/` and matching against a mode-0600 credential list found **no match**; `~/.awcp` is `0700`, `node_id` is `0600`, `~/.awcp-enrol.env` removed.
- Scoped readback: **17 rows** (20 emitted − 3 overflow-dropped) with the gap at 12-14 visible; `heartbeat>0 AND checkpoint>0 AND count>10` => `t`.
- D-18 honoured: the `mcp` container was created at `11:33:25Z`, before the first experiment event at `11:34:55Z`, and was never stopped, restarted, or recreated during Task 2. Disconnection was simulated client-side by repointing `AWCP_HUB_URL` at an unroutable endpoint.
- Credential-leak gate: clean against the staged diff, the committed object, and every commit on the branch. Credential material shredded after merge-safe.
- CI on PR #50: `dotnet-build` pass, `contact-memory-tests` pass, `server-integration-tests` pass (4m4s) — the first CI signal for this wave, since earlier Phase 3 PRs stacked into an integration branch.

## Next Phase Readiness

**Phase 4 (U5+U6) inherits three things it did not have:** the element-by-element criterion-6 disposition, first-hand criterion-7 friction (`## 16.8`), and two recorded-not-fixed defects — the `first_seen_at`/`registered_at` schema mismatch and, more substantively, `last_seen_at` never advancing despite 17 delivered events.

**Standing hazard that outlives this phase:** z2 remains enrolled. Any test run against the dev `DATABASE_URL`, including the native `./dev.sh` inner loop, issues `DROP SCHEMA IF EXISTS workflow CASCADE` and de-enrols it behind the opaque 401. Use `mcp-test`/`db-test`. The findings section survives regardless — that is the point of D-03.

**Open questions carried, not answered:** whether `FEATURE_WORKFLOW` stays enabled on the base `mcp` service (this run depended on it being on, and on `:3000` being published on all interfaces, because z2 reaches the hub over the tailnet); and whether repo-rescan should have been built at all.

ADR-016 remains **Proposed/Conditional**.

## Self-Check: PASSED

- All three tasks executed; all acceptance criteria met.
- Both PO-approved open questions folded in and reflected in the plan, its `<open_questions>` block, and the findings section consistently.
- `<human-check>` on the output discharged by a human read before commit, which is also where the repo-rescan framing was corrected.
- No credential in any commit, proven mechanically rather than by eye.
