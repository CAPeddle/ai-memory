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
