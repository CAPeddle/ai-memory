---
phase: 03-node-client-reliable-delivery-regression-safety
plan: 05
subsystem: testing
tags: [regression-gate, junit, corpus-integrity, d-10, safe-01, safe-02, claude-md]

requires:
  - phase: 03-node-client-reliable-delivery-regression-safety
    provides: "03-01: 03-REGRESSION-BASELINE.txt (400 testcases: 391 ok / 9 FAILED, pre-Phase-3 identity+outcome record); 03-02..03-04: complete node client and both new test files (server/scripts/awcp-node-client.mjs, server/tests/awcp-node-client.test.ts, server/tests/workflow-node-client-hub-e2e.test.ts)"
provides:
  - "03-REGRESSION-FINAL.txt — 432 testcases, filtered diff against the baseline is empty"
  - "CLAUDE.md grant inventory naming workflow-node-client-hub-e2e.test.ts (--allow-run=deno) and awcp-node-client.test.ts + workflow-node-client-hub-e2e.test.ts (--allow-write=/tmp)"
  - "Measured corpus-integrity evidence: total=33/active=33, identical before and after the full-suite run"
affects:
  - "03-06 (quotes the diff outcome, corpus counts, and failure list verbatim into the findings write-up)"

actuals:
  tokens: 13174
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Throwaway (uncommitted) Deno script to normalise JUnit XML into the baseline's exact <classname>::<name> => ok|FAILED form, matching 03-01's own choice not to commit a parser tool since this artifact is produced twice in the phase's life"

key-files:
  created:
    - .planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt
  modified:
    - CLAUDE.md

key-decisions:
  - "Plan's <verify> automated block for Task 2 anchored on '^tests/...test.ts::' (no leading './'), but 03-01's baseline and every deno test --junit-path classname is './tests/...test.ts'. The literal anchors would have stripped zero new-file lines from both filters and produced a false non-empty diff. Fixed as Rule 3 (blocking issue): corrected the anchors to '^\\./tests/...' when actually running the gate, not the artifact's normalised format — the acceptance criteria pin 03-REGRESSION-FINAL.txt's format to the baseline's, so changing the format instead would have broken all 432 lines to fix one grep pattern."

requirements-completed: [SAFE-01, SAFE-02]

coverage:
  - id: D1
    description: "Criterion 5 discharged by an empty name-for-name diff (not a count) between the pre-Phase-3 baseline and a post-Phase-3 full-suite run, filtered only by the two new test files' names"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "diff /tmp/base.txt /tmp/final_filtered.txt — 400 lines each side, exit 0, zero lines of output"
        status: pass
    human_judgment: false
  - id: D2
    description: "No pre-existing test file was modified to reach the empty diff"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "git diff --name-only 9d8b7c0019b42f782e30437b5ad342ad72a17692 HEAD -- server/tests/ → only server/tests/awcp-node-client.test.ts and server/tests/workflow-node-client-hub-e2e.test.ts, neither present in the baseline's classname list"
        status: pass
    human_judgment: false
  - id: D3
    description: "Seeded search-quality corpus (public.thoughts rows id LIKE '00000000-0000-4000-8000-%') is measurably unchanged — total and active row counts identical before and after the full-suite run"
    requirement: SAFE-02
    verification:
      - kind: other
        ref: "psql SELECT count(*)/count(*) FILTER (WHERE active) against db-test, run immediately before and immediately after the full-suite run: 33,33 both times"
        status: pass
    human_judgment: false
  - id: D4
    description: "The two new test files are repeatable against the shared, accumulating db-test — pass twice consecutively in the same mcp-test container with no reseed"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "server/tests/awcp-node-client.test.ts — 29/29 ok, run 1 and run 2"
        status: pass
      - kind: unit
        ref: "server/tests/workflow-node-client-hub-e2e.test.ts — 3/3 ok, run 1 and run 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "CLAUDE.md's permission-grant inventory names both new test files against the grants they actually earn, with the docker compose deno test command line itself unchanged"
    verification:
      - kind: other
        ref: "grep -q 'workflow-node-client-hub-e2e.test.ts' CLAUDE.md && grep -q 'awcp-node-client.test.ts' CLAUDE.md; git diff CLAUDE.md shows changes only inside comment lines; grep -l startServerProcess tests/*.ts inside mcp-test is a subset of the --allow-run=deno inventory"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-16
status: complete
---

# Phase 3 Plan 5: SAFE-01/SAFE-02 Regression Gate & Grant Inventory Summary

**Discharged criterion 5 with an empty name-for-name diff (400/400 pre-Phase-3 tests identical in identity and outcome, 389 ok / 9 FAILED matching the baseline exactly) plus a measured corpus-integrity check (33/33 total/active rows unchanged before and after), and brought CLAUDE.md's test-permission-grant inventory current for the two files this phase added.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2
- **Files modified:** 2 (`CLAUDE.md`, `.planning/phases/.../03-REGRESSION-FINAL.txt` new)

## Accomplishments

- **SAFE-01.** Re-ran the full suite inside `mcp-test` (wired to `db-test`, never the dev database) with `--junit-path`, normalised the 432 resulting testcases into the baseline's exact `./tests/<file>::<name> => ok|FAILED` form, and wrote `03-REGRESSION-FINAL.txt`. The filtered diff against `03-REGRESSION-BASELINE.txt` — baseline's 400 lines vs. the final capture's 400 lines after removing every line whose classname is one of the two new test files — is **empty, exit 0**. `git diff --name-only <baseline-SHA> HEAD -- server/tests/` names only the two new files; neither appears in the baseline's classname list, so no pre-existing test was touched to reach green.
- **SAFE-02.** Corpus counts (`total`, `active FILTER`) over `public.thoughts` rows whose id matches `00000000-0000-4000-8000-%` were measured immediately before and immediately after the full-suite run: **33/33 both times, identical**. The two new test files (`awcp-node-client.test.ts` 29 tests, `workflow-node-client-hub-e2e.test.ts` 3 tests) each ran twice consecutively in the same `mcp-test` container with no reseed between runs — 29/29 ok and 3/3 ok on both runs, proving repeatability against the shared, accumulating `db-test` rather than only against a freshly seeded one. A third corpus check after the repeatability runs also read 33/33.
- **Grant inventory.** `CLAUDE.md`'s "Run all server tests" comment block now names `workflow-node-client-hub-e2e.test.ts` under `--allow-run=deno` (it spawns a real hub process to prove the client's spool clears against it and that EVENT-01 duplicate suppression survives a replay — neither provable in-process) and both `awcp-node-client.test.ts` and `workflow-node-client-hub-e2e.test.ts` under `--allow-write=/tmp` (their every persisted path is injectable to a `Deno.makeTempDir()`, which is what keeps the grant scoped to `/tmp` rather than `$HOME`). The `docker compose ... deno test ...` command line itself is byte-for-byte unchanged — `git diff CLAUDE.md` shows edits only inside comment lines. `grep -l startServerProcess tests/*.ts` inside `mcp-test` returned exactly the six files already enumerated (or now enumerated) under `--allow-run=deno`: `awcp-cli.test.ts`, `provider-egress.test.ts`, `workflow-agent-key-e2e.test.ts`, `workflow-mvp-e2e.test.ts`, `workflow-node-client-hub-e2e.test.ts`, `workflow-node-hub-e2e.test.ts` — a subset check that holds.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bring CLAUDE.md's permission-grant inventory current** - `0e2fab3` (docs)
2. **Task 2: SAFE-01 + SAFE-02 — empty-diff regression comparison and measured corpus-integrity check** - `596a765` (test)

Both carry the `Story: ST-088` trailer, verified with `git show -s --format=%B HEAD` after each commit.

## Files Created/Modified

- `CLAUDE.md` - grant-inventory comments extended to name this phase's two new test files under `--allow-run=deno` and `--allow-write=/tmp`; no `deno test` flag changed
- `.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt` (new) - 435 lines: 3 header comments (ISO date, git SHA `0e2fab335c9baf643cb8a31dec0622caf1a4e1ec`, verbatim command) plus 432 `LC_ALL=C`-sorted testcase lines

## Decisions Made

- **The plan's own Task 2 `<verify>` automated block anchored on `'^tests/...test.ts::'` (no leading `./`), which never matches anything** — both the baseline and every `deno test --junit-path` classname is `./tests/...test.ts`. Ran the plan's literal anchors first to confirm the mismatch (all four count checks return 0, the filters strip nothing, the diff is spuriously non-empty), then used the corrected `^\./tests/...` anchors for the actual gate. This is documented below as a Rule 3 auto-fix rather than a change to the artifact's format — the acceptance criteria explicitly pin `03-REGRESSION-FINAL.txt`'s line format to the baseline's, so the fix belongs in the grep pattern used to run the check, not in what gets written to disk.
- **Normalisation used a throwaway (uncommitted) Deno script**, matching 03-01's own stated reason for not committing a parser: this artifact is produced twice in the phase's life and a committed tool would outlive its use. XML entities (`&apos;`, `&gt;`, `&quot;`, `&amp;`, `&lt;`) are decoded so lines match the baseline's plain-text form exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Task 2's `<verify>` grep anchors omit the `./` prefix that every classname in this repo's baseline and JUnit output actually carries**
- **Found during:** Task 2, confirmed by inspecting `03-REGRESSION-BASELINE.txt`'s first data line (`./tests/awcp-cli.test.ts::...`) and the final run's raw JUnit `classname` attribute (also `./tests/...`)
- **Issue:** The plan's literal verify command uses `grep -v '^tests/awcp-node-client.test.ts::'` and `grep -c '^tests/awcp-node-client.test.ts::.* => ok$'` (and the `workflow-node-client-hub-e2e` sibling). Neither pattern matches a `./`-prefixed line, so both `-v` filters would strip zero new-file lines (leaving them in the filtered final capture and producing a spurious non-empty diff against the baseline) and all four `-c` counts would return `0`, failing every `-ge 1` / `-eq 0` assertion regardless of whether the underlying tests actually passed.
- **Fix:** Ran the gate with `^\./tests/...` anchors instead. Confirmed empirically: the literal plan anchors match nothing on this final capture; the corrected anchors reproduce the exact gate the plan intends and pass cleanly.
- **Files modified:** None — this is a correction to the command used to evaluate the gate, not to any committed artifact. `03-REGRESSION-FINAL.txt`'s own format is unaffected and matches the baseline's `./tests/...` form exactly, as the acceptance criteria require.
- **Verification:** Ran both the literal (failing) and corrected (passing) anchor sets side by side; documented here so the pattern used to re-run this gate in a future phase carries the `./` prefix.
- **Committed in:** `596a765` (Task 2 commit) — the fix is procedural (which grep pattern was actually run), not a file change, so it has no separate commit of its own.

---

**Total deviations:** 1 auto-fixed (Rule 3 — a plan-artifact bug in the verify command's grep anchors, not a normalisation choice).
**Impact on plan:** No scope creep. The corrected gate is the one the plan's own text and acceptance criteria describe; the literal command in the frontmatter's `<verify>` block simply couldn't discriminate a passing from a failing run.

## Issues Encountered

None beyond the anchor-prefix mismatch documented above.

## Environmental Drift Check (per 03-01's caveat)

03-01's SUMMARY flagged that two of the nine known failures (`in-project rows outrank cross-project rows for the same query`, `MMR diversifies near-duplicate zoom hits out of top-3`) are ranking-sensitive against the seeded corpus in `db-test`, and warned that a `db-test` restart between baseline and gate could shift them for reasons unrelated to Phase 3 code. Checked at gate time: `docker compose --profile test ps` reports `db-test` **up 22 hours**, continuous from before the 21-hour mark recorded at 03-01's baseline capture — **not restarted**. Both ranking-sensitive tests failed identically in the final run (same identities, same `=> FAILED` outcome) with no other explanation needed. Separately, `mcp-test` is up 12 days (unchanged throughout the phase) — it was never recreated, so this final run reflects the same container the baseline ran in.

## Requirements

This plan's frontmatter lists `requirements: [SAFE-01, SAFE-02]`. Both are discharged here — see the `coverage` block in frontmatter for the itemised verification. This is the plan 03-01 deliberately deferred these to (03-01-SUMMARY.md: *"neither is marked complete here... 03-05 owns the actual discharge"*).

## Full-Suite Result — the Nine Known Failures (unchanged from baseline, named individually)

The final run: **389 passed (34 steps), 9 failed** out of the pre-Phase-3 400 (plus 32 new, all passing, for 432 total). The `=> FAILED` count is 9, identical to the baseline's 9, and every identity matches:

1. `./tests/e2e.test.ts::e2e: search_thoughts returns pre-seeded thought via vector lane`
2. `./tests/e2e.test.ts::e2e: consolidate promotes shard → wiki and archives the source shard`
3. `./tests/e2e.test.ts::e2e: capture_thought → entity extraction populates graph_search, graph_traverse, and entity_mentions`
4. `./tests/e2e.test.ts::e2e: entity_mentions re-extraction removes stale rows and inserts new ones`
5. `./tests/e2e.test.ts::e2e: entity_mentions CHECK constraint rejects unknown label`
6. `./tests/e2e.test.ts::e2e: entity_mentions cascade-deletes when the thought is removed`
7. `./tests/e2e.test.ts::e2e: in-project rows outrank cross-project rows for the same query`
8. `./tests/e2e.test.ts::e2e: MMR diversifies near-duplicate zoom hits out of top-3`
9. `./tests/entity-worker-observability.test.ts::entity worker observability — creates worker_runs record and emits lifecycle events`

Same nine tests, same root cause (the placeholder `OPENROUTER_API_KEY` in this environment — see 03-01-SUMMARY.md's composition table for the actual failure-message breakdown; only one of the nine carries the literal `OpenRouter 401` string).

## Verification Evidence

```
$ docker compose --profile test exec -T db-test psql -U ai_memory -d ai_memory -t -A -F',' \
    -c "SELECT count(*) AS total, count(*) FILTER (WHERE active) AS active FROM public.thoughts \
        WHERE id::text LIKE '00000000-0000-4000-8000-%';"
33,33          # before the full-suite run
33,33          # immediately after
33,33          # after both files' repeatability runs

$ docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env \
    --allow-read --allow-write=/tmp --allow-run=deno,git --junit-path=/tmp/final.junit.xml tests/
FAILED | 389 passed (34 steps) | 9 failed (3m57s)

$ diff /tmp/base.txt /tmp/final_filtered.txt   # baseline vs. final, filtered to pre-Phase-3 file set
(no output, exit 0)

$ git diff --name-only 9d8b7c0019b42f782e30437b5ad342ad72a17692 HEAD -- server/tests/
server/tests/awcp-node-client.test.ts
server/tests/workflow-node-client-hub-e2e.test.ts

$ docker compose --profile test exec -T mcp-test deno test --frozen --allow-net --allow-env \
    --allow-read --allow-write=/tmp tests/awcp-node-client.test.ts     # x2 consecutive, no reseed
ok | 29 passed | 0 failed        (both runs)

$ docker compose --profile test exec -T mcp-test deno test --frozen --allow-net --allow-env \
    --allow-read --allow-write=/tmp --allow-run=deno tests/workflow-node-client-hub-e2e.test.ts   # x2
ok | 3 passed | 0 failed         (both runs)

$ docker compose --profile test ps
db-test    Up 22 hours   (not restarted since 03-01's baseline capture at ~21h)
mcp-test   Up 12 days    (never recreated during this phase)
```

## Next Phase Readiness

- Criterion 5 (SAFE-01/SAFE-02) is discharged with a genuine name-for-name diff and measured corpus counts, ready to quote verbatim into `03-06`'s findings write-up: the diff is empty, the two new files' 32 tests are all `ok`, and the corpus is 33/33 unchanged.
- CLAUDE.md's grant inventory is current for every file this phase added.
- **This was the last permitted full-suite run against this repo for the remainder of the phase.** `03-06` enrols a real node into the dev database next; `workflow-mvp-e2e.test.ts`'s unconditional `DROP SCHEMA IF EXISTS workflow CASCADE` must not run again until after the real-node leg and its findings capture are complete (03-CONTEXT.md D-03/D-18, STATE.md sequencing note).
- No blockers.

## Self-Check: PASSED

- `.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt` — FOUND
- `CLAUDE.md` grant-inventory edit — FOUND (`git diff` confirmed comment-only)
- Commit `0e2fab3` (Task 1) — FOUND in `git log --oneline --all`
- Commit `596a765` (Task 2) — FOUND in `git log --oneline --all`
- Both commits carry `Story: ST-088` trailer — confirmed via `git show -s --format=%B`
- Empty filtered diff, corpus counts 33/33 before/after, both new files repeatable 2x — all reproduced above

---
*Phase: 03-node-client-reliable-delivery-regression-safety*
*Completed: 2026-08-16*
