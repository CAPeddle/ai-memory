---
phase: 03-node-client-reliable-delivery-regression-safety
plan: 04
subsystem: workflow
tags: [node-client, awcp, backoff, d-15, d-17, d-13, event-03, event-04, heartbeat, checkpoint]

requires:
  - phase: 03-node-client-reliable-delivery-regression-safety
    provides: "03-03: bounded spool, oldest-first eviction, visible drop counter (recordDrops/state.json/config.stderrWrite), multi-batch ack-gated flush() with an unreachable outcome"
provides:
  - "server/scripts/awcp-node-client.mjs: flushOnce's full outcome union (acked/rejected/malformed/terminal_auth/unknown_node/too_large/retryable/unreachable), flush()'s terminal-state and bounded-backoff policy (MAX_FLUSH_ATTEMPTS=6, BACKOFF_BASE_MS=1000, BACKOFF_CAP_MS=30000, config.sleepImpl/config.randomImpl), main()'s process.exitCode (0/75/77), emitHeartbeat/emitCheckpoint/runAgent, main's emit/checkpoint/run subcommands, config.heartbeatIntervalMs/AWCP_HEARTBEAT_INTERVAL_MS"
  - "server/tests/awcp-node-client.test.ts: D-15/D-17 outcome-union and backoff tests, heartbeat/checkpoint/runAgent tests, the D-13 credential-leak gate"
affects: [03-05, 03-06]

actuals:
  tokens: 18005
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "flushOnce never throws on a non-200 (03-02/03-03 threw AwcpHttpError) — every hub response maps to a stated outcome the caller branches on explicitly, checked BEFORE the body is parsed (a real 401 is plain text, not JSON; parsing it first was the bug that misclassified D-17's terminal case as merely unreachable)"
    - "flush()'s per-call batch count is no longer fixed upfront from the spool's size at entry (03-03's design) — it now loops dynamically until the spool empties or a terminal/exhausted state is reached, because D-15 requires a single flush() call to both drop a permanent rejection AND deliver the remainder"
    - "A shared backoffOrDefer() closure bounds BOTH the retryable/unreachable branch and a zero-progress 'acked' response (an ack whose acknowledged array does not intersect the batch just sent) to the same MAX_FLUSH_ATTEMPTS ceiling — one place owns 'how many times, how long between' so the two callers cannot drift apart"
    - "runAgent() exposes a plain synchronous stop() rather than registering a real SIGINT/SIGTERM handler itself — only main()'s \"run\" command wires an OS signal to it, so importing/calling runAgent from a test never touches the host process's signal handling"

key-files:
  created: []
  modified:
    - server/scripts/awcp-node-client.mjs
    - server/tests/awcp-node-client.test.ts

key-decisions:
  - "flush()'s loop structure changed from 03-03's fixed-upfront-batch-count design to a dynamic while(true) loop re-reading the spool each iteration, required by D-15's own acceptance criterion (a single flush() call must both drop a rejection and then deliver the remainder) and by D-17's same-call retry policy. This is not a deviation from the plan — the plan's <behavior> and <acceptance_criteria> for Task 1 require it — but it breaks two 03-03-authored tests whose assertions depended on the old one-attempt-per-call behavior; both were updated (see Deviations)."
  - "Discovered during Task 1 testing: a 200 response whose acknowledged array does not intersect the batch actually sent removes nothing from the spool, and resetting the attempt counter on every 'acked' outcome (as a genuine ack legitimately does) spins forever against an unchanging spool. Bounded this with the same MAX_FLUSH_ATTEMPTS/backoff policy used for retryable/unreachable failures. This cannot happen against the real hub (store.ts's read-back ack always covers every event it just accepted), so it is a defensive fix rather than a requirements gap — but a reproducible infinite loop found by testing is a Rule 1 bug regardless of how unreachable the trigger is in production."
  - "The pre-existing EVENT-02 'unreachable flush' and EVENT-03 'post-send throw' tests (03-03) asserted flush()'s outcome as \"unreachable\" with exactly one fetchImpl call. Under the new retry-then-defer policy this is now \"deferred\" after MAX_FLUSH_ATTEMPTS (6) calls; both tests were updated to inject a no-op sleepImpl and assert the new outcome/call-count, per the plan's own guidance that this update is required, not a deviation to dodge."
  - "The 03-03 'partial acknowledgement removes only the acknowledged entry' proof moved from flush() to flushOnce() directly, with the spool removal it exercises reproduced inline. The double it uses (acks a fixed client_seq regardless of what is actually in the batch) models a single ack response correctly but is not a hub any REAL flush() call would keep encountering on retry — the real hub's read-back ack always covers everything it just accepted, so a repeating partial ack is not a steady state to converge against. flushOnce is the correct unit for 'one ack response's removal semantics'; flush()'s multi-call convergence behavior is covered separately by the new backoff/zero-progress tests."
  - "stopTerminal()'s two arguments (outcome, lineReason) were separated after they were briefly conflated: the D-17 401 case's returned outcome must stay \"terminal_auth\" (what main()'s exit-code switch and every acceptance test branch on) while its stderr LINE says \"reason=auth_failed\" per the plan's literal wording. Returning lineReason as the outcome broke both the acceptance-criteria outcome check and main()'s exit-code mapping until caught by the test suite."

patterns-established:
  - "Every non-2xx response the hub can return is enumerated as a named outcome, never inferred from a caught exception — a status-based classification is checkable by a test double per branch, where an exception-based one conflates \"the server said no\" with \"there was no server to ask\""
  - "A retry ceiling is shared infrastructure (backoffOrDefer), not duplicated per failure class — any future failure mode needing bounded retry reuses the same counter/delay/jitter/cap logic instead of re-deriving it"

requirements-completed: [EVENT-03, EVENT-04]

coverage:
  - id: D1
    description: "A 400 naming specific client_seq values drops exactly those entries, increments the visible drop counter with reason permanent_rejection, and the flush makes progress on the remainder within the same call (D-15)"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#D-15: a permanent rejection (400 naming client_seq) drops exactly those entries and the flush makes progress on the remainder"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 400 with a zod-issue body (no client_seq field) drops nothing and returns a distinct \"malformed\" outcome rather than being treated as a per-event rejection"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#D-15: a malformed 400 (zod-issue shape, no client_seq) drops nothing and returns a distinct outcome"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 401 stops the flush after exactly one request, leaves the spool byte-identical, and writes one structured terminal line — the client never distinguishes a wrong bearer from an unenrolled one (D-17)"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#D-17: a 401 stops after exactly one request, leaves the spool byte-identical, and writes one terminal line"
        status: pass
    human_judgment: false
  - id: D4
    description: "404 (unknown node) and 413 (payload too large) are distinct non-retrying outcomes that leave the spool intact"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#a 404 (unknown node) stops after exactly one request and leaves the spool intact"
        status: pass
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#a 413 (payload too large) stops after exactly one request and leaves the spool intact"
        status: pass
    human_judgment: false
  - id: D5
    description: "Retryable/unreachable failures back off with growing, non-decreasing, capped, jittered delays and defer (spool intact) after MAX_FLUSH_ATTEMPTS, with no real sleeping in tests"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#D-17: a retryable/unreachable failure backs off with growing, non-decreasing, capped delays and defers after MAX_FLUSH_ATTEMPTS"
        status: pass
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#a retryable 5xx is distinct from a transport throw but follows the same backoff-then-defer policy"
        status: pass
    human_judgment: false
  - id: D6
    description: "main([\"flush\"]) sets process.exitCode to 0 on success, 77 on terminal auth, 75 on exhausted retry"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#main([\"flush\"]) sets process.exitCode to 0 on success, 77 on terminal auth, 75 on exhausted retry"
        status: pass
    human_judgment: false
  - id: D7
    description: "emit/checkpoint subcommands append correctly-shaped spooled events; checkpoint and heartbeat payloads always carry node_id/hostname/spooled_events/dropped_events (never dropped as undefined) and stay within event_type/payload size limits"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#main([\"emit\", ...]) appends one spool line with the given event_type and payload"
        status: pass
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#main([\"checkpoint\", ...]) appends one checkpoint event whose payload carries phase, node_id, hostname, spooled_events, dropped_events"
        status: pass
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#heartbeat and checkpoint payload builders stay within event_type and payload size limits"
        status: pass
    human_judgment: false
  - id: D8
    description: "runAgent emits one start checkpoint then a heartbeat per tick, stops on signal with exactly one stop checkpoint and a final flush that drains the spool, and stops immediately (no further heartbeat) on a terminal_auth flush"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#runAgent: three ticks emit one start checkpoint and three heartbeats; the stop signal appends one stop checkpoint, flushes once more, and drains the spool"
        status: pass
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#runAgent: a 401 on the first flush stops after exactly one request and appends no heartbeat"
        status: pass
    human_judgment: false
  - id: D9
    description: "The client imports no child_process and invokes no git, keeping the in-process test file inside its existing permission grant"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#awcp-node-client.mjs contains no child_process import and no git invocation"
        status: pass
    human_judgment: false
  - id: D10
    description: "Neither the node bearer nor the enrolment secret appears in captured stdout/stderr (all six output surfaces patched) or on-disk state across a register-flush-retry cycle, including a transport error whose own message embeds the bearer (D-13)"
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts#D-13: neither the node bearer nor the enrolment secret appears in captured output or on-disk state across a register-flush-retry cycle"
        status: pass
    human_judgment: false

duration: ~1h
completed: 2026-08-16
status: complete
---

# Phase 3 Plan 4: Terminal States, Bounded Backoff, Heartbeat/Checkpoint & the D-13 Leak Gate Summary

**Every non-200 the hub can return now maps to a stated `flushOnce` outcome with a matching `flush()` policy (D-15's permanent-rejection drop-and-continue, D-17's terminal auth and bounded exponential backoff), plus heartbeat/checkpoint reporting as ordinary spooled events, a `runAgent` loop, and a proven D-13 credential-leak gate — with a genuine infinite-loop bug (a zero-progress "acked" response) found and fixed along the way.**

## Performance

- **Duration:** ~1h (includes a real debugging investigation — see Issues Encountered)
- **Tasks:** 3
- **Files modified:** 2 (`server/scripts/awcp-node-client.mjs`, `server/tests/awcp-node-client.test.ts`)
- **Tests:** 29 (all passing, twice consecutively, in the same `mcp-test` container)

## Accomplishments

- **D-15.** `flushOnce` returns an explicit outcome union instead of throwing on non-200: `acked`, `rejected` (a 400 whose `issues` elements carry a numeric `client_seq` — the oversized-single-payload path), `malformed` (a 400 in the other, zod-issue shape — unreachable in normal operation since `FLUSH_MAX_EVENTS` already caps every batch below the hub's `.max(500)`), `terminal_auth` (401), `unknown_node` (404), `too_large` (413), `retryable` (5xx or any other unrecognised non-2xx), `unreachable` (a thrown `fetchImpl`). `flush()`'s loop restructured from 03-03's fixed-upfront-batch-count design to a dynamic loop so a single call can both drop a `rejected` batch's named entries AND deliver the remainder — proven on a 5-event spool where the middle entry is rejected and the rest are then delivered in the same `flush()` call.
- **D-17.** A 401 stops the flush after exactly one request, leaves the spool byte-identical, and writes one structured line `awcp-node-client: terminal reason=auth_failed spooled_events=<M>` — the client never reports a wrong bearer differently from an unenrolled one. 404/413/malformed are likewise non-retrying. Retryable/unreachable failures back off with `min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2**(attempt-1))` plus ±20% jitter (applied before the cap, so no delay can ever exceed 30s regardless of jitter), up to `MAX_FLUSH_ATTEMPTS = 6` attempts, then return `deferred` with the spool intact. `main` sets `process.exitCode` (0/75/77) via `process.exitCode`, never `process.exit()`, so pending stream writes flush before the process ends.
- **Heartbeat and checkpoint.** `emitHeartbeat`/`emitCheckpoint` append ordinary `event_type: "heartbeat"`/`"checkpoint"` events through the same `/events` endpoint the spool already drains through — the hub has no dedicated route for either and none was built. `runAgent` is the long-running loop: a start checkpoint, then heartbeat+flush per tick (`config.heartbeatIntervalMs`, default 60s via `AWCP_HEARTBEAT_INTERVAL_MS`), a stop checkpoint and final flush on signal, and an immediate exit (no further tick) if any flush returns `terminal_auth`. `runAgent` itself never registers a real `SIGINT`/`SIGTERM` handler — it exposes a plain `stop()`; only `main`'s `"run"` command wires an OS signal to it, so calling `runAgent` from a test never touches the host process's signal handling.
- **D-13.** A new gate drives a full `registerNode → flush(success) → flush(401) → flush(transport error whose own message embeds the bearer)` cycle with all six output surfaces patched (`console.log/error/warn/info`, `process.stdout.write`, `process.stderr.write`) and asserts neither the bearer nor the enrolment secret appears in captured output or in any file under the injected home directory — with a positive control (the D-17 terminal line) proving the collector was actually watching, not passing vacuously on an empty capture.

## Task Commits

Each task was committed atomically:

1. **Task 1: D-15 + D-17 — permanent rejection drops what the hub named; authentication failure reaches a terminal state** - `b267a1e` (feat)
2. **Task 2: Heartbeat and checkpoint reporting through the events endpoint, and the run loop that drives them** - `bb386ef` (feat)
3. **Task 3: D-13 — the credential-leak gate over a register, flush and retry cycle** - `ac9b2a2` (test)

**Plan metadata:** committed alongside this SUMMARY (see final commit).

## Files Created/Modified

- `server/scripts/awcp-node-client.mjs` - `flushOnce`'s outcome union; `flush`'s terminal-state/bounded-backoff policy with a shared `backoffOrDefer` helper covering both retryable/unreachable AND zero-progress `acked` responses; `MAX_FLUSH_ATTEMPTS`/`BACKOFF_BASE_MS`/`BACKOFF_CAP_MS`/`DEFAULT_HEARTBEAT_INTERVAL_MS` constants; `config.sleepImpl`/`config.randomImpl`/`config.heartbeatIntervalMs`; `main`'s `process.exitCode` and `overrides` parameter; `emitHeartbeat`/`emitCheckpoint`/`runAgent`; `main`'s `emit`/`checkpoint`/`run` subcommands.
- `server/tests/awcp-node-client.test.ts` - new fetch test doubles per `flushOnce` outcome branch (`rejectingFetch`, `malformedFetch`, `unauthorizedFetch`, `notFoundFetch`, `tooLargeFetch`, `serverErrorFetch`); D-15/D-17 outcome and backoff tests; `main` exit-code tests; heartbeat/checkpoint/`runAgent` tests; the D-13 gate; two pre-existing 03-03 tests updated for the new retry-then-defer semantics; the 03-03 partial-ack proof moved to `flushOnce`.

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on each. In brief:
- `flush()`'s loop restructured to dynamic (required by D-15/D-17's own acceptance criteria, not a deviation).
- A zero-progress `acked` response is bounded by the same backoff/exhaustion policy as retryable/unreachable (Rule 1 fix, found during testing).
- Two pre-existing EVENT-02/EVENT-03 tests updated for the new outcome semantics (retry-then-defer instead of single-attempt-unreachable).
- The partial-ack proof moved from `flush()` to `flushOnce()` — the correct unit for "one ack response's removal semantics" given a hub that always fully acks what it accepts.
- `stopTerminal(outcome, lineReason)` separated the returned outcome from the stderr line's wording after a bug conflated them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `flush()` could loop forever on a 200 response that acknowledges nothing in the current batch**
- **Found during:** Task 1, while testing the pre-existing EVENT-03 partial-acknowledgement test against the rewritten `flush()` loop
- **Issue:** The new dynamic `flush()` loop resets its attempt counter and continues unconditionally on every `"acked"` outcome. A response whose `acknowledged` array does not intersect the batch just sent (impossible against the real hub, per `store.ts`'s always-complete read-back ack, but producible by a test double or an adversarial/buggy response) removes nothing from the spool, so the identical request is resent and identically (non-)acknowledged forever — an infinite loop, reproduced and confirmed via an isolated repro script before the fix.
- **Fix:** Extracted a shared `backoffOrDefer()` helper (attempt counter, jittered/capped delay, `MAX_FLUSH_ATTEMPTS` exhaustion → `deferred`) and applied it to BOTH the retryable/unreachable branch and any `"acked"` response whose removal makes zero progress.
- **Files modified:** `server/scripts/awcp-node-client.mjs`
- **Verification:** Isolated repro script confirmed the hang (26+ calls before a manual safety cutoff); after the fix, the same scenario returns `deferred` after exactly 6 calls. The full suite passes twice consecutively with no hang.
- **Committed in:** `b267a1e` (Task 1 commit)

**2. [Rule 1 - Bug] `flushOnce` called `res.json()` before checking `res.status`, misclassifying a real 401 as `"unreachable"`**
- **Found during:** Task 1, while implementing per the advisor's pre-flagged risk (a real 401 is `new Response("Unauthorized", {status:401})` — plain text, not JSON)
- **Issue:** The 03-02/03-03 code's unconditional `await res.json()` before checking status would throw a `SyntaxError` on a real 401's non-JSON body, and `flush()`'s catch block would misclassify that as a transport failure — exactly the D-17 misclassification the plan's advisor call warned about.
- **Fix:** `flushOnce` now branches on `res.status` FIRST and only parses a JSON body for the one status (400) that actually returns one.
- **Files modified:** `server/scripts/awcp-node-client.mjs`
- **Verification:** The 401 test double's `.json()` method is written to reject (mirroring the real hub's plain-text body) rather than quietly resolving — a double that resolved would let this exact regression pass.
- **Committed in:** `b267a1e` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own `flush()`/`flushOnce()` rewrite, found and fixed before committing).
**Impact on plan:** Both fixes are required for correctness of the exact behavior this plan implements (bounded retry, D-17's terminal auth classification). No scope creep — neither fix touches code outside `flushOnce`/`flush`.

## Issues Encountered

**A real hang, diagnosed and fixed before the first commit.** Running the full test suite after Task 1's initial implementation hung indefinitely (confirmed via a 180s `timeout` wrapper and a background-task poll) rather than failing loudly. Isolated the cause with a throwaway repro script outside the committed test file: the pre-existing `partialAckFetch` test double (03-03) always acknowledges a fixed `client_seq` regardless of what the current batch actually contains, which under the OLD `flush()` (one `flushOnce` call per invocation) never mattered, but under the NEW dynamic loop caused an unbounded resend-and-reacknowledge-nothing cycle. This surfaced the zero-progress-`acked` bug documented above as Auto-fixed Issue 1, and separately required moving the 03-03 partial-ack proof to `flushOnce` (documented in Decisions Made) since the double models a single ack response correctly but not a hub a real `flush()` call would keep re-encountering. No production code shipped with this bug; it was found and fixed entirely within Task 1 before any commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `server/scripts/awcp-node-client.mjs` now carries the complete failure-terminal-state, backoff, and liveness-reporting surface (`flushOnce`'s full outcome union, `flush`'s bounded retry, `emitHeartbeat`/`emitCheckpoint`/`runAgent`, `main`'s `emit`/`checkpoint`/`run`/exit-codes) this phase's node client needed before the real z2 run.
- D-13's credential-leak gate is proven and repeatable — future changes to `flushOnce`/`flush`/`registerNode` are checked against it automatically by the same suite.
- No blockers. `03-05-PLAN.md` (SAFE-01/02 full-suite identity-diff, `CLAUDE.md` grant inventory) is next in the phase's wave sequence, followed by `03-06` (the real z2 run and findings write-up).
- Note for `03-06`: this plan's pre-existing `no-process-globals` deno-lint findings (20 → 25, all in `server/scripts/awcp-node-client.mjs`'s existing `process.*` usage, matching the file's established convention since 03-02) were left as-is per the deviation-rules scope boundary (pre-existing/consistent-with-established-pattern, not introduced by this plan's own new category of issue) — flagging here in case a later plan wants to address the whole category at once.

## Self-Check: PASSED

- `server/scripts/awcp-node-client.mjs` — FOUND
- `server/tests/awcp-node-client.test.ts` — FOUND
- Commit `b267a1e` (Task 1) — FOUND in `git log --oneline --all`
- Commit `bb386ef` (Task 2) — FOUND in `git log --oneline --all`
- Commit `ac9b2a2` (Task 3) — FOUND in `git log --oneline --all`
- 29 tests passing, twice consecutively, in `mcp-test`
- `workflow-node-client-hub-e2e.test.ts` (03-02's tracer) still passes unmodified
- `git status --porcelain server/src server/index.ts` — empty

---
*Phase: 03-node-client-reliable-delivery-regression-safety*
*Completed: 2026-08-16*
