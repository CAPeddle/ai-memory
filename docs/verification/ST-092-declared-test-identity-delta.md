---
title: ST-092 — declared test-identity delta, written before the comparison ran
date: 2026-08-20
story: ST-092
baseline: .planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt
---

# ST-092 — declared test-identity delta

**Written before the comparison was run.** A delta authored after seeing the diff is
not a gate, it is a description. Everything below was recorded from the plan and the
commits, and then compared.

## Why this is not the empty-diff gate ST-088 Phase 3 used

Plan 03-05's gate was "the observed identity set is unchanged", and it worked because
Phase 3 was **purely additive** — it added two test files and modified no existing one.
ST-092 modifies six existing test files (`_helpers/serverProcess.ts` plus the five
suites that passed it a port) and adds four new ones. An unqualified empty-diff gate
would either fail for expected reasons or, worse, be quietly relaxed until it passed.

The gate here is: **the observed delta equals the delta declared below.** Anything else
is a regression, whatever the totals say.

## Declared: ADDED identities

New test files, all additive:

| File | Requirement |
|---|---|
| `tests/awcp-node-client-lock.test.ts` | R1 — two real contending client processes |
| `tests/server-process-ports.test.ts` | R7 — ephemeral ports, and the no-hardcoded-port scan |
| `tests/test-database-guard.test.ts` | R6 — the guard's refusal branches and its non-vacuity control |

New tests inside the existing `tests/awcp-node-client.test.ts`, all named with an
`ST-092 R<n>` prefix so they are separable from the Phase 3 identities in that file:

- R2 — directory fsync on `writeSpool` / `writeState`, the production-default control,
  and the propagation test (4)
- R2b — the counter's crash window, the truncate-in-place control, garbage refusal,
  and mode 0600 (4)
- R3 — eviction ordering under a crash, ordinary overflow, and the no-op cases (3)
- R4 — unparseable bodies, invalid ack bodies, the empty-array case, out-of-batch acks,
  and the unchanged-paths control (5)
- R5 — stop wakes the wait, deferred exits 75, success exits 0, terminal-auth still 77,
  one stop checkpoint (5)
- R1 — lock mechanics: live refusal, stale reclaim, unreadable refusal, release,
  foreign-lock release, `main` release on three exit paths, `status` unlocked, refused
  run leaves state byte-identical, undetermined-liveness refusal, and the probe control (10)

## Declared: REMOVED identities

**None.** No test was deleted or renamed. This is the load-bearing half of the
declaration: every pre-existing identity in the baseline must still be present, and a
pre-existing identity that has vanished is the regression signal, whatever else moved.

## Declared: RENAMED identities

**None.** The six modified test files changed how they obtain a port, how a CLI env is
built, and gained a guard call — none of which touches a `Deno.test` name or a
`t.step` name. Modified files do not move identities.

## Declared: identities expected to change OUTCOME

**None.** Every pre-existing identity that was `ok` in the baseline must still be `ok`.

## Method

1. `docker compose --profile test exec -T mcp-test deno test --frozen --allow-net
   --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git
   --junit-path=/tmp/st092.junit.xml tests/`
2. Normalise to `./tests/<file>::<name>[ > <step>] => ok|FAILED`, `LC_ALL=C sort`ed —
   the same form as the baseline.
3. Compare against the baseline with the three header lines stripped.
4. Every added line must be in the ADDED set above. Every removed line is a regression.


---

# Observed result

Run recorded in [`ST-092-regression-final.txt`](ST-092-regression-final.txt), in the
baseline's own format. **482 identities observed against 432 in the baseline.**

Reconciliation, stated as an identity over its parts so it recomputes as the suite
grows rather than going stale:

```
432 baseline  +  50 added  −  0 removed  =  482 observed
```

## Removed: none

**No pre-existing test identity is missing, and none changed outcome.** The failure set
matches the baseline name for name — the same eight `e2e.test.ts` identities and the
same `entity-worker-observability` one, all recorded as FAILED in
`03-REGRESSION-FINAL.txt` itself for want of model-provider egress. That is the half of
the declaration that carries the regression signal, and it holds exactly.

## Added: 50 — 48 declared, 2 added mid-story and recorded here

| File | Observed | Declared |
|---|---|---|
| `tests/awcp-node-client.test.ts` | 33 | 31 — see below |
| `tests/awcp-node-client-lock.test.ts` | 7 | 3 tests + their 4 sub-steps |
| `tests/test-database-guard.test.ts` | 7 | yes |
| `tests/server-process-ports.test.ts` | 3 | yes |

By requirement, inside `awcp-node-client.test.ts`: R1 × 10, R2 × 4, R2b × 4, R3 × 3,
R4 × 5, **R5 × 7** — declared as 5.

The two extra R5 identities are a defect found by measuring the R5 change rather than
trusting it, and fixed in the same story. Racing the heartbeat wait against a stop
signal woke the loop immediately but left the `setTimeout` pending, and a pending timer
keeps Node's event loop alive — so the stop checkpoint and final flush completed at
once while the process outlived its own shutdown. A/B against a hub that acks
immediately, 45s heartbeat: **42.2s to exit without the abort signal, 82ms with it.**
The two tests are the wiring assertion and the control that drives the real
`defaultSleep`, so the wiring test cannot pass against a sleep that ignores the signal.

Recorded as an addition to the declaration rather than folded into it silently. The
declaration's purpose is to make an unexpected identity visible; an unexpected identity
that turned out to be a genuine fix is exactly what it is supposed to surface.

## An earlier run, and why it is worth recording

The first full-suite run at this scope showed one pre-existing identity flipping
outcome — `/ready reports healthy postgres, pgvector, age, and embedding_api` going
`ok → FAILED`. It did **not** reproduce in this final run, and the diagnosis at the
time was that the container has no route to the provider at all (`curl --max-time 15
https://openrouter.ai/api/v1/models` from inside `mcp-test` returns HTTP `000` in 8ms,
the SSL-proxy interception CLAUDE.md documents), and that this particular probe is
*cached with a timeout* — so it sits on the boundary rather than failing outright like
the nine that own the baseline's recorded failures.

A non-reproducing flip is weaker evidence than a stable one, and saying so is the point
of leaving this paragraph in: the identity is `ok` in the artifact above, and the honest
reading is that this probe is flaky on a machine without provider egress, not that it
was ever affected by this story. `git diff main..HEAD -- server/src/ server/index.ts
server/db/schema.sql` is empty, so nothing on this branch can reach it.

## Verdict

Zero removed, zero outcome changes, and every addition either declared in advance or
recorded above with the defect it came from. **Gate passed.**

---

## Round 2 — PR #52 review remediation (declared before the comparison ran)

Codex and Copilot reviewed `f0c5fc0` on PR #52 and raised four findings. Three were
fixed on this branch; the fourth (stale-lock reclaim) is deferred and is not part of
this delta. Only one of the three is test-bearing.

**Expected delta: +1 identity, 0 removed, 0 outcome changes. 482 → 483.**

Added:

- `./tests/awcp-node-client.test.ts::ST-092 R5: defaultSleep removes its abort listener
  when the timer fires, not only when it aborts`

The other two fixes are not test-bearing and are declared as such deliberately, so their
absence from the delta is a recorded expectation rather than an oversight:

- `allocateSeq`'s corruption message interpolates `config.home` instead of a hard-coded
  `~/.awcp/`. Asserting on the wording of an operator hint pins prose, not behavior.
- `AwcpLockError`'s live-holder branch now names the pid-reuse recovery. Same reasoning.
  The existing spawned-process test already asserts the refusal exits 69 and names the
  holder's pid, which is the behavior; the added sentence is guidance.

### The control that mattered

The listener test was first run against the unfixed code and **failed on its assertion**
(`removed` was 0 against an expected 10). The first attempt at that control was invalid
and is recorded here because the failure mode is easy to repeat: reverting the whole
function also removed its `export`, so the test failed to *compile*, which proves the
module surface and says nothing about the leak. The valid control keeps the export and
reverts only the listener logic.

### Amendment to the round-2 declaration

The declaration above said **+1**. It was written when three of the four review fixes
were believed non-test-bearing and the fourth was deferred. The PO then set a standing
rule — *write a test that proves the bug first, watch it fail, then fix* — which
invalidated both halves of that judgement. The corrected declaration is **+4, 0 removed,
0 outcome changes. 482 → 486**, adding:

- `ST-092 R5: defaultSleep removes its abort listener when the timer fires, not only when it aborts`
- `ST-092 R2b: the corrupt-counter refusal names the home actually in use, not a hard-coded ~/.awcp`
- `ST-092 R1: the refusal for a live holder says what to do when the recorded pid was reused`
- `ST-092 R1: two clients that find the same stale lock must not both come away holding it`

Amended rather than rewritten, because the gap between the two numbers is the finding:
"not test-bearing" was doing the work of "I do not want to write this test." Both message
fixes turned out to have a discriminating assertion available, and in both cases the
*obvious* assertion was not it — the old `allocateSeq` message already contained the
configured home via `seqPath`, and the old `AwcpLockError` message already named the
lock path. Only `!includes("~/.awcp")` and the presence of the recovery sentence
actually separate old from new.

### The undeclared outcome flip, and the first explanation being wrong

The round-2 runs showed `entity-worker-observability :: records errors when item
processing fails` going `ok → FAILED`. It was not declared, so it was chased.

**The first diagnosis was wrong and is left here because the way it was wrong is the
lesson.** The evidence for "environmental" was real but incomplete: the test passes when
its file is run alone, and `git diff origin/main..HEAD -- server/src/ server/index.ts
server/db/` is empty, so this branch cannot have changed the subject's behaviour. That
was enough to rule out a *behaviour* regression and was mistaken for enough to rule out
this branch entirely.

The timeline did not support it. `records errors` was `ok` in the run before the round-2
tests were added and `FAILED` in both runs after. So the suite was run at `f0c5fc0` with
the round-2 work stashed: **9 failures, the baseline — the test passes.** One sample
each way is not determinism, but it is enough to stop calling it environmental.

**What it actually is.** The assertion is `errors === 1`; the observed value is `2`. The
test inserts one deliberately-failing thought, runs `processQueue()`, and reads the
newest `worker_runs` row — but it never clears `entity_extraction_queue`, so retry-
scheduled items left by earlier tests are still in it and are processed by the same run.
The failure output shows exactly that: `[entityWorker] retryable failure (attempt 3/5,
retry in 4s)` for an id this test never created. It is a pre-existing isolation defect —
the test assumes a queue it owns and does not arrange one.

This branch's contribution is timing only. Four added tests in `awcp-node-client.test.ts`
lengthen a file that sorts before `entity-worker-observability.test.ts`, shifting when
the retry backoffs land relative to it.

**Left unfixed here deliberately, with a discriminator.** Fixing it means clearing a
queue shared with other suites, in a subsystem this story does not touch. The retry storm
that supplies the stray error exists because this machine has no provider egress — those
retries are `OpenRouter 401: Missing Authentication header`. CI supplies a real
`OPENROUTER_API_KEY`, so the same storm should not occur there, and **CI on this PR is the
discriminator**: it was green at `f0c5fc0`. If it stays green, the local red is an
artifact of the no-egress environment; if it goes red on this test, the isolation defect
needs its own fix and its own story.

---

## Round 3 — the fix's own review (declared before the comparison ran)

Codex reviewed `4e058af` and found a defect in the round-2 lock fix itself: a reclaimer
killed between fsyncing its appended claim and collapsing the claim log leaves that claim
in the file permanently, so every later client appends behind a dead claimant and refuses
forever. **This is the same brick that ruled out a separate `.takeover` file, reached by
another route** — the round-2 rationale rejected one permanent-blocker design and then
shipped one. The finding is correct and the inconsistency was ours.

**Expected delta: +2 identities, 0 removed, 0 outcome changes. 486 → 488.**

- `ST-092 R1: a claim left behind by a crashed reclaimer must not brick the lock forever`
  — the red. Written first; against `4e058af` it failed with `acquireLock` throwing
  `AwcpLockError` where it must take the lock.
- `ST-092 R1: a claim whose process is still alive still wins, and we refuse behind it`
  — **not** a red/green control, and labelled as such in the test body. It passes both
  before and after by construction. It exists because the fix's risk is the opposite of
  the bug: "abandon a dead claim" must not become "ignore every earlier claim", which
  would hand the lock to a contender while a live claimant holds it.

### A wrong first attempt at the fix, kept because the suite caught it

The abandonment scan initially returned `"held"` from inside the loop, which jumped over
the `writeFileAtomic` that collapses the claim log. Four tests went red, including two
that had been green for the whole story — the lock was left as `<stale>\n<ours>` rather
than a single record. Worth recording because of what caught it: not the new test, which
only asserts the holder's pid, but the pre-existing `one SIGKILL must not brick the node`
test, which asserts the lock's contents after a reclaim. A narrow new test and a broad old
one failed for the same cause, and the old one localised it.

### The entity-worker flip, third and final reading

Round 3 adds two more tests to the same file and the flip is **gone** — `records errors
when item processing fails` is `ok`, and the suite is back to the baseline 9 failures.

That falsifies the round-2 correction as well. The reasoning there was: it passed before
the round-2 tests and failed after, and a control run at `f0c5fc0` with the work stashed
passed, therefore this branch's added tests expose it. Adding *more* tests should then
have made it worse. It did the opposite.

The honest account across four full-suite runs, same machine, same stack:

| Run | Round-2 tests | Round-3 tests | `records errors` |
|---|---|---|---|
| simplify pass | no | no | ok |
| round 2 (first) | yes | no | FAILED |
| round 2 (final) | yes | no | FAILED |
| control at `f0c5fc0` | no | no | ok |
| round 3 | yes | yes | **ok** |

So it is intermittent, and the causal conclusion drawn from one sample each way was drawn
from noise. **The control run was itself uncontrolled** — one execution of a
timing-sensitive test is not evidence about what causes it to fail.

What survives, because it was read from the failure rather than inferred from the
timeline: the assertion is `errors === 1` and the observed value was `2`, and the test
never clears `entity_extraction_queue`, so retry-scheduled items from earlier tests are
processed by the same run. That isolation defect is real and independent of this branch —
it decides only *whether* the flake fires, not whether the defect exists. It belongs to
the entity-worker area and wants its own story.

The methodological point is worth more than the finding: two successive explanations were
offered here with real evidence behind each, and both were wrong. The first mistook "the
subject is untouched" for "this branch is uninvolved"; the second mistook `n=1` on a flaky
test for a controlled comparison.
