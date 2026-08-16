---
phase: 03-node-client-reliable-delivery-regression-safety
plan: 01
subsystem: regression-safety-infra
tags: [docker-compose, feature-flag, workflow, regression-baseline, D-10, D-01]
dependency-graph:
  requires: []
  provides:
    - "03-REGRESSION-BASELINE.txt (pre-Phase-3 test identity+outcome record)"
    - "FEATURE_WORKFLOW=true on base mcp service (dev hub node surface mounted)"
  affects:
    - "03-02..03-06 (all later Phase 3 plans depend on the dev hub node surface being mounted)"
    - "03-05 (SAFE-01/SAFE-02 discharge — the identity diff against this baseline)"
tech-stack:
  added: []
  patterns:
    - "JUnit XML normalised to sorted `file::name => ok|FAILED` lines for test-identity comparison (D-10)"
    - "Compose environment: block as explicit allowlist — new FEATURE_WORKFLOW line mirrors AWCP_NODE_ENROLMENT_SECRET's comment convention"
key-files:
  created:
    - .planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt
  modified:
    - docker-compose.yml
decisions:
  - "D-10 baseline captured against mcp-test/db-test (never the dev database), before any Phase 3 production code exists"
  - "FEATURE_WORKFLOW enabled on the base mcp service's environment: block (hardcoded \"true\"), not via docker-compose.workflow.yml, per D-01"
  - "SAFE-01/SAFE-02 requirements NOT marked complete by this plan — 03-05-PLAN.md declares the same IDs and owns the actual full-suite identity-diff discharge; this plan only builds the measuring instrument (the baseline) and the prerequisite (the flag)"
metrics:
  duration: "~25 min"
  completed: 2026-08-16
actuals:
  tokens: 11816
  tasks: 2
  commits: 2
status: complete
---

# Phase 3 Plan 1: Regression Baseline & FEATURE_WORKFLOW Enablement Summary

Captured a machine-diffable, test-identity-keyed regression baseline before any Phase 3 code
landed, then enabled `FEATURE_WORKFLOW` on the base `mcp` compose service so the dev hub's
`/workflow/nodes/*` node-client surface actually exists — unblocking every later Phase 3 plan.

## What Was Built

**Task 1 — D-10 regression baseline.** Ran the full existing suite inside `mcp-test` (wired to
`db-test`, never the dev database) with `--junit-path`, normalised every `<testcase>` into a
sorted `<classname>::<name> => ok|FAILED` line, and committed
`.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt`.
400 testcases recorded: 391 `ok`, 9 `FAILED`. Prepended three `# `-comment lines: ISO date, the
git SHA the baseline was taken at (`9d8b7c0019b42f782e30437b5ad342ad72a17692`), and the verbatim
command.

**Task 2 — D-01 FEATURE_WORKFLOW enablement.** Added one new line, `FEATURE_WORKFLOW: "true"`,
to the `mcp` service's `environment:` block in `docker-compose.yml`, immediately after the
`AWCP_NODE_ENROLMENT_SECRET` line, with a 12-line comment block naming ST-088, the 404-vs-401
diagnostic distinction, and why `/health` cannot tell them apart. Recreated the container
(`docker compose up -d mcp`) and verified from inside the running process
(`docker compose exec -T mcp printenv FEATURE_WORKFLOW` → `true`), not by inference from an HTTP
response. `POST /workflow/nodes/register` now answers `401` (was `404`); `/health` stays healthy.

## The Nine Known Baseline Failures — Actual Composition

D-10/CONTEXT.md characterizes these as "the nine known provider-401 failures," which is accurate
as shorthand for their shared root cause (the placeholder `OPENROUTER_API_KEY` in this
environment) but not literally true of the failure text. Reading the actual JUnit failure
messages, the composition is:

| Test | Failure mode |
|---|---|
| `e2e: entity_mentions CHECK constraint rejects unknown label` | Literal `OpenRouter 401: Missing Authentication header` |
| `e2e: capture_thought → entity extraction populates graph_search, graph_traverse, and entity_mentions` | Downstream timeout — "Entity extraction did not complete within 44s" |
| `e2e: entity_mentions re-extraction removes stale rows and inserts new ones` | Downstream timeout, same shape |
| `e2e: entity_mentions cascade-deletes when the thought is removed` | Downstream timeout, same shape |
| `e2e: search_thoughts returns pre-seeded thought via vector lane` | Downstream — vector lane returns no IDs (embedding never computed) |
| `e2e: consolidate promotes shard → wiki and archives the source shard` | Downstream — `consolidation_log.wiki_id` never set within 30s |
| `e2e: in-project rows outrank cross-project rows for the same query` | Downstream — ranking assertion against corpus rows whose embeddings never computed |
| `e2e: MMR diversifies near-duplicate zoom hits out of top-3` | Downstream — same ranking/embedding dependency |
| `entity worker observability — creates worker_runs record and emits lifecycle events` | Downstream — `worker_runs` lifecycle-event count off by one (0 vs 1) |

Only one carries the literal `OpenRouter 401` string; the other eight are downstream symptoms of
the same missing credential (entity extraction and embedding computation both call out to
OpenRouter and fail identically in this environment). The **count and test identities match
D-10's expected nine exactly — no delta** — which is what the identity-comparison methodology
cares about; this table exists so 03-05 doesn't misread "nine 401s" literally when it re-runs the
comparison and greps for that string.

**Caveat for 03-05:** two of the nine (`in-project rows outrank cross-project rows`, `MMR
diversifies near-duplicate zoom hits out of top-3`) are ranking-sensitive against the seeded
search corpus in `db-test`. `db-test` accumulates state across runs and is wiped only when its
container stops (CLAUDE.md's documented gotcha) — this container has been up 21 hours at time of
baseline capture. If `db-test` is restarted before 03-05's comparison runs, these two could shift
for reasons unrelated to any Phase 3 code change; that would be environmental drift, not a
regression, and worth checking before concluding otherwise.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' automated `<verify>` blocks passed
unmodified.

## Requirements

This plan's frontmatter lists `requirements: [SAFE-01, SAFE-02]`, but **neither is marked
complete here.** `03-05-PLAN.md` declares the same two IDs, and 03-05 owns the actual discharge —
the full-suite re-run and test-identity diff against this plan's baseline, after all Phase 3
production code has landed (STATE.md: "the last destructive full-suite run is wave 5"). This plan
built the measuring instrument (the baseline) and cleared the prerequisite (the flag); it did not
take the measurement. `.planning/REQUIREMENTS.md` intentionally still shows SAFE-01/SAFE-02 as
Pending.

## Open Question Recorded, Not Resolved — T-03-01-02

Enabling `FEATURE_WORKFLOW` on the base `mcp` service also mounts `/api/workflow/*` and the
**unauthenticated `/workflow` dashboard shell**, newly reachable on `0.0.0.0:3000` (every
interface, per `docker-compose.yml`'s `3000:3000` publish) — not just the tailnet. This is
accepted for the duration of Phase 3 (the shell is static and every data route behind it is
bearer-guarded — see threat register row T-03-01-02 in `03-01-PLAN.md`), but **whether the flag
stays enabled after Phase 3 ends is an open maintainer decision, not silently resolved by this
plan.** Turning it off afterward restores today's surface but re-breaks any future real-node work
with an opaque 404 rather than a 401. See `03-01-PLAN.md`'s `<open_questions>` block for the full
framing; this needs an explicit maintainer call before or at phase close, and should be routed
into the phase's §16 findings write-up (03-06) alongside the criterion-6 evidence.

## Verification Evidence

```
$ docker compose exec -T mcp printenv FEATURE_WORKFLOW
true

$ curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3000/workflow/nodes/register
401

$ curl -sf http://localhost:3000/health
{"status":"healthy"}

$ git status --porcelain server/
(empty)
```

Regression baseline file: 403 lines total (3 header comments + 400 testcase lines), sorted
`LC_ALL=C`, 391 `ok` / 9 `FAILED`.

## .env Criterion

The plan's Task 2 acceptance criteria require confirming `.env` gained no `FEATURE_WORKFLOW`
entry. `.env` is blocked from direct inspection by the sandbox's permission system (denied on
both `cat` and `grep`), so this is stated **by construction rather than by direct verification**:
this plan's only file edit was to `docker-compose.yml` (see the git diff in the Task 2 commit);
no command in this session wrote to `.env`.

## Self-Check: PASSED

- `.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt` — FOUND
- `docker-compose.yml` `FEATURE_WORKFLOW: "true"` line — FOUND (line 58, under `mcp:`, confirmed by `grep -n`)
- Commit `c3caa2a` (Task 1) — FOUND in `git log --oneline --all`
- Commit `40da558` (Task 2) — FOUND in `git log --oneline --all`
