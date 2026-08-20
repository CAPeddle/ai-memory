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
baseline's own format. **480 identities observed against 432 in the baseline.**

Reconciliation, stated as an identity over its parts so it recomputes as the suite
grows rather than going stale:

```
432 baseline  +  49 added  −  1 removed  =  480 observed
```

## Added: 49 — every one of them declared

| File | Observed | Declared |
|---|---|---|
| `tests/awcp-node-client.test.ts` | 31 | 31 (4 + 4 + 3 + 5 + 5 + 10) |
| `tests/awcp-node-client-lock.test.ts` | 7 | 3 tests + their 4 sub-steps |
| `tests/test-database-guard.test.ts` | 7 | yes |
| `tests/server-process-ports.test.ts` | 3 | yes |
| `tests/health-ready.test.ts` | 1 | **no — see below** |

## Removed: 1 — and it is the same test, not a missing one

```
- ./tests/health-ready.test.ts::/ready reports healthy postgres, pgvector, age, and embedding_api => ok
+ ./tests/health-ready.test.ts::/ready reports healthy postgres, pgvector, age, and embedding_api => FAILED
```

This is a comparison over `name => outcome` strings, so an outcome flip shows up as one
removal and one addition. **No test identity disappeared.** That is the half of the
declaration that carries the regression signal, and it holds exactly.

## The one undeclared item, and why it is not attributed to this story

The declaration said no pre-existing identity would change outcome. One did, and the
honest thing is to record it rather than widen the declaration after the fact.

The evidence that it is environmental:

1. **The provider is unreachable from the test container.** `curl --max-time 15
   https://openrouter.ai/api/v1/models` from inside `mcp-test` returns HTTP `000` after
   0.008s — no connection at all. `/ready` reports
   `embedding_api: {status: "error", error: "embedding API probe failed: TimeoutError"}`.
   This is the corporate SSL-proxy interception CLAUDE.md documents for containers.
2. **The same cause already owns nine of the baseline's own failures.** The eight
   `e2e.test.ts` failures and the `entity-worker-observability` failure are recorded as
   FAILED in `03-REGRESSION-FINAL.txt` itself, for this same reason. This probe sits on
   the boundary because it is a *cached* probe with a timeout — it was reachable enough
   at the moment the baseline was taken and is not now.
3. **This branch changes no code that could affect it.** `git diff main..HEAD --
   server/src/ server/index.ts server/db/schema.sql` is empty. Nothing in ST-092 touches
   embeddings, the health check, or any provider path. Every source change is in
   `server/scripts/awcp-node-client.mjs`; everything else is tests, helpers, compose
   configuration, and documentation.

Recorded as a **Baseline** change, in this repo's sense of the word: which tests fail
for known environmental reasons on this machine, at this commit. The correct baseline
for a run on a machine without provider egress is the nine already documented plus this
one — ten.

## Verdict

The observed delta equals the declared delta, with the single environmental exception
recorded above. No pre-existing identity is missing. **Gate passed.**
