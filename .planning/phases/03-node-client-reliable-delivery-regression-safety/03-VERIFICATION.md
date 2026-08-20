---
phase: 03-node-client-reliable-delivery-regression-safety
verified: 2026-08-18T16:05:00Z
status: human_needed
score: 12/13 must-haves verified
behavior_unverified: 0
uncertain_truths: 1
overrides_applied: 0
uncertain_items: # UNCERTAIN, not behavior-unverified: the gap is ARTIFACT ABSENCE, not test absence.
  - truth: "The seeded search-quality corpus in db-test has the same total row count and the same active-row count after a full suite run as before it (SAFE-02)."
    test: "Bring up `docker compose --profile test up -d`, measure `SELECT count(*), count(*) FILTER (WHERE active) FROM public.thoughts WHERE id::text LIKE '00000000-0000-4000-8000-%'` in db-test, run the full suite, re-measure."
    expected: "total and active counts identical before and after (03-05 recorded 33/33 both times)."
    status: uncertain
    why_human: "The only record of this measurement is narrative — 03-05-SUMMARY.md and findings §16.6. No raw before/after artifact was committed alongside 03-REGRESSION-BASELINE.txt / 03-REGRESSION-FINAL.txt, and `db-test` is not currently running, so the claim cannot be re-derived from anything on disk. Unlike SAFE-01's identity diff (which I reproduced byte-for-byte), SAFE-02 rests entirely on the executor's own report."
human_verification:
  - test: "Run the three e2e tests against the TEST stack only: `docker compose --profile test up -d` then `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno tests/workflow-node-client-hub-e2e.test.ts`"
    expected: "3 passed, 0 failed — including `ST-088 EVENT-01: replaying the same (node_id, client_seq) over real HTTP creates no duplicate hub state`."
    why_human: "The verifier could not execute this file. 03-06-PLAN.md carries a [locked] prohibition — 'Do NOT run workflow-mvp-e2e.test.ts, or any test, against the dev DATABASE_URL after enrolment' — and `db-test` was not running, leaving only the dev DATABASE_URL available. Honouring the prohibition was the correct call (the z2 evidence is unregenerable), but it means SC1's automated proof was accepted from a recorded, freshness-verified JUnit run rather than re-executed live."
  - test: "Product-owner sign-off that findings §16 is an acceptable durable artifact for the z2 real-node leg."
    expected: "PO accepts that the criterion-6 evidence is a redacted transcript plus a scoped SQL readback rather than a repeatable test."
    why_human: "External-service integration on a host (z2, tailnet 100.106.232.78) the verifier cannot reach. §16.10 states the evidence cannot be regenerated without reopening an enrolment window D-11 deliberately closed. The verifier independently reproduced §16.4's SQL readback exactly (17 rows, gap at 12-14, heartbeat and checkpoint present), which corroborates the transcript but does not make it repeatable."
  - test: "Decide findings §16.9 open question 3 — does FEATURE_WORKFLOW stay hardcoded \"true\" on the base `mcp` service after Phase 3?"
    expected: "A recorded maintainer decision, with the security posture explicitly accepted or changed."
    why_human: "Verified live by the verifier and worth stating plainly: docker-compose.yml:67 publishes `3000:3000` on ALL interfaces, and with FEATURE_WORKFLOW hardcoded on, `GET http://127.0.0.1:3000/workflow` answers **200 unauthenticated** (the dashboard shell). `GET /api/workflow/runs` correctly answers 401, so the data API is protected — the shell is not. This is a deliberate, honestly-surfaced consequence of 03-01, prohibited by no success criterion, and 03-06 explicitly notes the criterion-6 run depended on both the flag and the all-interfaces bind. It is a decision, not a defect — but it is now a standing production-shaped exposure that no one has signed off."
  - test: "Decide findings §16.9 open question 4 — is repo-rescan in scope, and if so where?"
    expected: "Either a Phase 4 / follow-on story entry, or a recorded decision that it is out of scope for ST-088."
    why_human: "Both 03-03-PLAN.md and 03-04-PLAN.md carry `[deferred] Do NOT implement repo-rescan`, and 03-CONTEXT.md:251 leaves its membership explicitly open. It is correctly NOT a Phase 3 gap (no success criterion names it, and §16.5 argues persuasively that criterion 6's text does not either). But it is listed under U3 in the canonical plan and currently lands in Phase 4 as an inherited question with no owner."
  - test: "Reconcile the planning bookkeeping before Phase 4 starts."
    expected: "ROADMAP.md Phase 3 shows 6/6 with 03-06 checked, and its Coverage table agrees with REQUIREMENTS.md."
    why_human: "REQUIREMENTS.md already marks EVENT-01..04 and SAFE-01/02 as `[x] Complete`, while ROADMAP.md's Coverage table still lists all six as `Pending`, the Progress table still reads `5/6 In Progress`, and 03-06 is still `- [ ]` unchecked — despite 03-06-SUMMARY.md being on disk and its work committed (b32b6ab, 43d1e7e). Requirements were marked complete ahead of verification; the two documents now contradict each other."
---

# Phase 3: Node Client, Reliable Delivery & Regression Safety — Verification Report

**Phase Goal:** A minimal Node.js client running on the Ubuntu execution node spools, replays, and delivers events reliably across disconnection, duplicate delivery, and authentication failure scenarios — while existing MCP tools remain fully operational.
**Verified:** 2026-08-18T16:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification
**Branch verified:** `docs/st-088-phase-3-wave-6-summary` @ `43d1e7e`

## Verification stance and what the verifier actually executed

This report deliberately distinguishes evidence the verifier **produced** from evidence it **read**.

Executed independently by the verifier:

1. `deno test --allow-read --allow-env --allow-write=/tmp server/tests/awcp-node-client.test.ts` → **29 passed, 0 failed** (211 ms).
2. The D-10 identity diff, re-derived from scratch: baseline and final filtered to the pre-Phase-3 file set, sorted, `diff` → **400 lines vs 400 lines, exit 0, empty**.
3. Freshness check on that diff: `git diff --name-only 0e2fab3 HEAD -- server/` → **empty**, so nothing under `server/` changed between the gate run and HEAD and the recorded run still describes the shipped tree exactly.
4. A scoped, read-only SQL readback of z2's rows against the live dev database → **reproduced findings §16.4 exactly**.
5. `POST /workflow/nodes/register` and `GET /workflow` against the running dev hub.
6. Static classification of every spool-mutation site in `awcp-node-client.mjs`.
7. Prohibition and credential sweeps over the branch diff.

**Not executed, with cause:** `server/tests/workflow-node-client-hub-e2e.test.ts`. 03-06-PLAN.md's `[locked]` prohibition forbids running any test against the dev `DATABASE_URL` after enrolment, and the `--profile test` stack (`db-test`) was not running, so the dev URL was the only one available. Honouring the prohibition preserves unregenerable evidence; the cost is that SC1's automated proof is accepted from a recorded JUnit run rather than re-executed. That cost is carried explicitly as human-verification item 1 rather than absorbed into the score.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1** — Replaying the same `(node_id, client_seq)` produces no duplicate hub state and the client receives the same ack both times | ✓ VERIFIED | Four independent strands. (a) `workflow-node-client-hub-e2e.test.ts:200-284` asserts it substantively — not merely "both acks name seq 1" but `assertEquals(first.acknowledged, second.acknowledged)` including `event_id`, `typeof client_seq === "number"` with no `Number()` coercion at the assertion site, a scoped `count(*) = 1` after replay, and a third submission with *different* payload proving the ORIGINAL payload survives. (b) That named test is recorded `=> ok` at `03-REGRESSION-FINAL.txt:373`, and the verifier confirmed the test file and client are byte-identical between that capture commit and HEAD. (c) Mechanism verified live in the dev DB: `uq_run_events_node_seq UNIQUE, btree (node_id, client_seq)` + `store.ts:827 ON CONFLICT (node_id, client_seq) DO NOTHING`. (d) §16.3 Experiment 5 on z2: identical `{"acked":[6,7,8,9,10]}` both times, 10 rows before and after. **Caveat:** strand (b) is a recorded run, not one the verifier re-executed — see human item 1. |
| 2 | **SC2** — A disconnected node retains bounded local events in `~/.awcp/spool.jsonl` (oldest-first) and replays them when connectivity returns | ✓ VERIFIED | Verifier-executed test `EVENT-02: an unreachable flush leaves the spool byte-identical and ascending; a reconnected flush replays oldest-first over the wire` → ok. Default path confirmed at `resolveConfig` (`awcp-node-client.mjs:206`): `join(home, "spool.jsonl")` with `home` defaulting to `join(homedir(), ".awcp")`. Bounding confirmed at `appendEvent:281-286`. Real-node corroboration: §16.3 Experiment 4, five events survived the outage and landed 6-10 on reconnect. |
| 3 | **SC3** — A spool entry is removed only after the hub acknowledges it — not on send, not on retry attempt | ✓ VERIFIED | Verifier-executed tests `EVENT-03: a partial acknowledgement removes only the acknowledged entry; a post-send throw removes nothing` and `EVENT-03: a 600-event spool flushes as a 500-event batch then a 100-event batch` → both ok. Reinforced by exhaustive static classification: **exactly three** `writeSpool` call sites exist (`:419` eviction, `:685` ack-gated, `:704` D-15 rejection) and all three are plan-sanctioned — see the dedicated table below. `flush:684` filters by `!ackedSeqs.has(...)` where `ackedSeqs` derives from the hub's `acknowledged[].client_seq` with no coercion. Real-node corroboration: §16.3 Experiment 4's failed flush returned exit 75 with `spooled_events=5` intact. |
| 4 | **SC4** — When spool capacity is exceeded the oldest event is dropped and a visible counter increments rather than silently filling disk | ✓ VERIFIED | Five verifier-executed tests → all ok: eviction keeps the newest, `dropped_events` persists to disk and survives a rebuilt config, exactly one structured stderr line per drop with a running total, `status` prints the totals, `state.json` is mode 0600. Three-channel visibility confirmed in code (`recordDrops:388-407`). `evictOldest:413-424` slices the *lowest* seqs. Independently reproduced by the verifier in SQL: z2's `run_events` shows a **gap at client_seq 12-14** — the three evicted events, absent from the hub, exactly as §16.3 claims. |
| 5 | **SC5** — Authenticated MCP memory tools and workflow operations pass their existing tests unmodified after all node changes | ✓ VERIFIED | **Reproduced by the verifier, not accepted from the summary.** Filtering both regression files to the pre-Phase-3 set and diffing gave 400 vs 400 lines, `diff` exit 0, **empty** — name-for-name identity AND outcome, 391 ok / 9 FAILED, the 9 identical (8 in `e2e.test.ts`, 1 in `entity-worker-observability.test.ts`, all pre-existing provider-401s). No pre-existing test disappeared, was renamed, or was skipped. Freshness confirmed: `awcp-node-client.mjs`, `awcp-node-client.test.ts` and `workflow-node-client-hub-e2e.test.ts` are byte-identical between the FINAL capture commit `0e2fab3` and HEAD, and — the stronger check — `git diff --name-only 0e2fab3 HEAD -- server/` is **entirely empty**, so *no file anywhere under `server/`* changed between the gate run and HEAD. Across the whole tree the only non-planning/non-docs changes are `CLAUDE.md`, `CONCEPTS.md` and `FollowUpSessionLog.txt`. The recorded run therefore describes exactly the shipped test surface. |
| 6 | **D-14** — After restart with a drained spool, the next `client_seq` strictly exceeds the highest already acknowledged | ✓ VERIFIED | Four verifier-executed tests → all ok, including 50 allocations across 50 rebuilt configs strictly increasing and all distinct, and allocation surviving spool deletion. `allocateSeq` never reads `spoolPath` (documented at `:242-249`). Real-node form: §16.3 emits `client_seq 20` from a fresh process after a full drain. This is what stops SC1 passing vacuously on a counter that resets. |
| 7 | **D-15** — A permanent rejection drops exactly the named entries, increments the same visible counter, and the flush makes progress | ✓ VERIFIED | Verifier-executed tests → ok, including the negative case: a malformed 400 in zod-issue shape (no numeric `client_seq`) drops **nothing** and returns a distinct outcome. `flushOnce:534-541` discriminates the two 400 shapes by `issues.every(i => typeof i?.client_seq === "number")`, not by mere presence of `issues`. `flush:690-712` guards the "hub named seqs not in our batch" case as terminal-loud rather than a silent spin. |
| 8 | **D-17** — Auth failure reaches a terminal state, spool intact, condition surfaced; retryables use bounded backoff | ✓ VERIFIED | Verifier-executed tests → ok: 401 stops after **exactly one** request leaving the spool byte-identical and writing one terminal line; 404 and 413 likewise; retryable/unreachable backs off with growing, non-decreasing, capped delays then defers after `MAX_FLUSH_ATTEMPTS`; `main(["flush"])` sets exit codes 0/77/75. Real-node corroboration: §16.3 Experiment 6 returned `terminal_auth`, exit 77, `spooled_events=1`. |
| 9 | **D-13** — Neither the raw node bearer nor the enrolment secret appears in captured output, on-disk state, or the committed diff | ✓ VERIFIED | Verifier-executed test `D-13: neither the node bearer nor the enrolment secret appears in captured output or on-disk state across a register-flush-retry cycle` → ok (it patches `console.*` **and** `process.stdout/stderr.write`, so a credential escaping the injectable sink would still be caught). Verifier sweep: `git diff 47cd90b..HEAD \| grep -E '[0-9a-f]{64}'` → **no matches**; the same scan over findings §16 and 03-06-SUMMARY.md → **no matches**. §16.2 quotes both credentials only as `<REDACTED-…>` placeholders and verifies the window by byte-length (`wc -c`), never by value. |
| 10 | **D-09** — Importing the `.mjs` from a Deno test performs zero network requests and creates nothing under the real `HOME` | ✓ VERIFIED | Guard test present at `workflow-node-client-hub-e2e.test.ts:144` and recorded `=> ok` at `03-REGRESSION-FINAL.txt:374`. Structurally corroborated: `isMainModule()` at `:946` gates the entry point, every persisted path resolves from an injectable `config.home`, and the 29 in-process tests the verifier ran all wrote under `Deno.makeTempDir()` with only `--allow-write=/tmp` granted — an unguarded import would have failed the permission check. |
| 11 | **Enrolment window opened, used exactly once, and closed — closure proven by 401** | ✓ VERIFIED | Verified live by the verifier, not read from the summary: `POST http://127.0.0.1:3000/workflow/nodes/register` → **401** (mounted and refusing, not 404), and `docker compose exec db psql` confirms exactly one z2 row, `status=active`, `registered_at=2026-08-18 11:28:14.190239+00`. §16.2 additionally records the near-miss where a `.env` without a trailing newline defeated both `sed -d` and `grep -c` and left the window silently open — caught only by the in-process check. That the failure is *recorded* rather than smoothed over is itself evidence of an honest write-up. |
| 12 | **The durable criterion-6 artifact is the findings write-up** — redacted transcripts, node_id-scoped SQL readback, closure proof, and heartbeat + checkpoint rows | ✓ VERIFIED | `docs/investigations/ST-084-awcp-host-spike-findings.md` `## 16.` (line 1168) exists and is committed on this branch, spanning §16.1-§16.10. The verifier **independently reproduced §16.4's readback**: identical node row, and identical 17 `run_events` rows in the same order — `checkpoint`(1), `heartbeat`(2,3,4), `checkpoint`(5), `exp4_event`(6-10), `exp6_event`(11), gap 12-14, `overflow_event`(15-19), `d14_event`(20). Both heartbeat **and** checkpoint rows are present, discharging criterion 6's full definition rather than its spool-and-replay half. The numbering supersession (`## 16.` not `## 13.`) is documented in the section's own opening and matches ROADMAP's instruction. |
| 13 | **SAFE-02** — The seeded search-quality corpus has identical total and active row counts before and after a full-suite run | ? UNCERTAIN | The claim is specific and plausible (33/33 before, after, and again after the repeatability runs; 03-05-SUMMARY.md:100, findings §16.6). The measurement command is quoted at 03-05-SUMMARY.md:172. But it exists **only as narrative** — no raw before/after artifact was committed beside `03-REGRESSION-BASELINE.txt`/`03-REGRESSION-FINAL.txt`, and `db-test` is not running, so nothing on disk lets the verifier re-derive it. This is the one truth in the phase where the verifier had to take the executor's word. Classified **UNCERTAIN**, not PRESENT_BEHAVIOR_UNVERIFIED: the shortfall is *artifact absence*, not *test absence* — there is no code path here whose runtime behaviour went unexercised, there is simply no committed measurement to check. Routed to human verification; **not** counted toward the score. |

**Score:** 12/13 truths verified (1 UNCERTAIN)

**Score composition**, stated explicitly so it reconciles against the roadmap contract: the 13 truths are **ROADMAP.md's 5 Phase 3 Success Criteria — all 5 VERIFIED** — merged with **8 plan-frontmatter truths** carried from `03-01`..`03-06` (D-09, D-13, D-14, D-15, D-17, the enrolment open/use/close cycle, the §16 durable artifact, and SAFE-02). PLAN must-haves added scope here; they subtracted none. The single non-verified truth is SAFE-02, a plan truth, and it is UNCERTAIN rather than FAILED. **No ROADMAP Success Criterion is unverified.**

### Spool-mutation site classification (SC3's structural half)

Every site in `server/scripts/awcp-node-client.mjs` that rewrites, filters, or truncates the spool. A fourth, unsanctioned path would be the blocker; there is none.

| Site | Trigger | Sanctioned by | Increments `dropped_events`? |
|---|---|---|---|
| `evictOldest:419` | Spool length exceeds `spoolMaxEntries` after append | EVENT-04 / SC4 — named exception | ✓ yes, `reason=spool_overflow` |
| `flush:685` | HTTP 200 whose `acknowledged` array names the entry | EVENT-03 / SC3 — the normal path | n/a (delivered, not dropped) |
| `flush:704` | HTTP 400 naming specific `client_seq` values | D-15 — named exception | ✓ yes, `reason=permanent_rejection` |

Two plan-named traps checked and clear:

- **No high-water-mark skip guard.** `flush` reads the whole spool and sends `entries.slice(0, FLUSH_MAX_EVENTS)` with no filter against the persisted counter. 03-04's `[locked]` prohibition exists precisely because such a guard would make §16.3 Experiment 5 send nothing and pass vacuously. It is absent.
- **Ack comparison is number-typed.** `flushOnce:566` returns `acknowledged.map(e => e.client_seq)` with no `Number()` coercion, and `flush:683` builds a `Set` from it. A string-typed ack therefore fails to match and the spool does **not** clear — fail-safe, not fail-silent — and the e2e asserts `typeof === "number"` explicitly.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server/scripts/awcp-node-client.mjs` | Zero-dependency Node ESM client: register/emit/checkpoint/flush/run/status | ✓ VERIFIED | 958 lines. Exists, substantive, imported by both test files, and exercised end-to-end (data flows to a real Postgres — the verifier read the resulting rows). `.mjs` not `.js`; no `.js` sibling in `server/scripts/`. |
| `server/tests/awcp-node-client.test.ts` | In-process suite: bounding, eviction, D-13/14/15/17, heartbeat/checkpoint | ✓ VERIFIED | 1444 lines, 29 tests, **all executed by the verifier and passing**. Writes only under `Deno.makeTempDir()`. |
| `server/tests/workflow-node-client-hub-e2e.test.ts` | Real-hub-process suite: tracer, D-09 guard, EVENT-01 | ✓ VERIFIED (recorded run) | 284 lines, 3 tests, all `=> ok` at `03-REGRESSION-FINAL.txt:373-375`. Read and confirmed non-vacuous by the verifier; not re-executed (see human item 1). |
| `docs/investigations/ST-084-awcp-host-spike-findings.md` `## 16.` | Criterion-6 evidence section | ✓ VERIFIED | Line 1168, §16.1-§16.10. Readback independently reproduced. |
| `.planning/.../03-REGRESSION-BASELINE.txt` | Pre-Phase-3 test identity + outcome | ✓ VERIFIED | 403 lines, header records timestamp `2026-08-16T06:15:26Z`, commit `9d8b7c0`, and the exact capture command. Verifier confirmed `9d8b7c0` predates `awcp-node-client.mjs` (`git rev-parse` → *"exists on disk, but not in"*), so the baseline genuinely precedes Phase 3 production code. |
| `.planning/.../03-REGRESSION-FINAL.txt` | Post-Phase-3 run, same format | ✓ VERIFIED | 435 lines (+32 = the 29 + 3 new tests, exactly). Diff against baseline reproduced as empty. |
| `docker-compose.yml` (mcp service) | `FEATURE_WORKFLOW` added to the `environment:` allowlist | ✓ VERIFIED | Line 58, hardcoded `"true"`, with a 12-line comment explaining the 404-vs-401 distinction. Live behaviour confirms it reaches the process. |
| `CLAUDE.md` grant inventory | Names both new test files against their grants | ✓ VERIFIED | Lines 92-93 name `awcp-node-client.test.ts` and `workflow-node-client-hub-e2e.test.ts` under `--allow-write=/tmp`, and the `--allow-run=deno` block names the latter with its rationale. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `awcp-node-client.mjs` | Hub `/workflow/nodes/:id/events` | `flushOnce` → `config.fetchImpl` POST | ✓ WIRED | `:515-527`. Real traffic proven: 17 rows in `workflow.run_events` for z2's node_id, read back by the verifier. |
| `awcp-node-client.mjs` | Hub `/workflow/nodes/register` | `registerNode` | ✓ WIRED | Live endpoint returns 401 (mounted, auth-refusing); z2's row exists with `status=active`. |
| `docker-compose.yml` `FEATURE_WORKFLOW` | `server/index.ts` route mounting | `workflowFeatureEnabled()` predicate | ✓ WIRED | `POST /workflow/nodes/register` → **401 not 404**, which is the plan's own stated discriminator for "mounted". |
| Deno test | Node `.mjs` | `node:` specifier import | ✓ WIRED | The phase's single unproven feasibility assumption, deliberately front-loaded into the tracer. Confirmed working: the verifier's own 29-test run imports the `.mjs` directly. |
| Client `dropped_events` | Operator visibility | `state.json` + stderr line + `status` subcommand | ✓ WIRED | Three channels, each with its own passing test. |
| Hub duplicate suppression | `run_events` | `UNIQUE(node_id, client_seq)` + `ON CONFLICT DO NOTHING` | ✓ WIRED | Index `uq_run_events_node_seq` confirmed present in the live DB; `store.ts:827` confirmed in source. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| `flush` result `acked[]` | `result.acked` | Hub's HTTP 200 `acknowledged[]` read-back, no coercion | Yes — drives real spool removal | ✓ FLOWING |
| `status` output | `state.dropped_events` | `readState` ← `state.json` ← `recordDrops` | Yes — reproduced as the 12-14 gap in hub rows | ✓ FLOWING |
| Spool replay | `readSpool(config)` | `spool.jsonl`, append order = ascending seq | Yes — Experiment 4 landed 6-10 in order | ✓ FLOWING |
| §16.4 readback tables | `workflow.run_events` | Live scoped SQL | Yes — verifier reproduced identical output | ✓ FLOWING |
| `client_seq` allocation | `config.seqPath` file | Read-increment-write with fsync, never derived from spool | Yes — survived a real process exit on z2 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| In-process client suite | `deno test --allow-read --allow-env --allow-write=/tmp server/tests/awcp-node-client.test.ts` | `ok \| 29 passed \| 0 failed (211ms)` | ✓ PASS |
| D-10 identity diff (SC5) | filter both regression files, sort, `diff` | 400/400 lines, exit 0, empty | ✓ PASS |
| Regression freshness (3 named files) | `git rev-parse 0e2fab3:<path>` vs `HEAD:<path>` ×3 | all SAME | ✓ PASS |
| Regression freshness (whole server tree) | `git diff --name-only 0e2fab3 HEAD -- server/` | empty | ✓ PASS |
| Baseline precedes phase code | `git rev-parse 9d8b7c0:server/scripts/awcp-node-client.mjs` | *"exists on disk, but not in"* | ✓ PASS |
| Node routes mounted | `curl -X POST :3000/workflow/nodes/register` | `401` (not 404) | ✓ PASS |
| Enrolment window closed | same, no enrolment secret | `401` | ✓ PASS |
| z2 node row | scoped `SELECT ... FROM workflow.execution_nodes WHERE node_id = '1fbae82b-…'` | 1 row, z2/linux/active | ✓ PASS |
| z2 event rows | scoped `SELECT client_seq, event_type ... ORDER BY client_seq` | 17 rows, gap at 12-14, 3 heartbeat + 2 checkpoint | ✓ PASS |
| Duplicate-suppression index | `\d workflow.run_events` | `uq_run_events_node_seq UNIQUE, btree (node_id, client_seq)` | ✓ PASS |
| Workflow dashboard exposure | `curl :3000/workflow` and `:3000/api/workflow/runs` | `200` / `401` | ⚠ PASS with note (human item 3) |
| Real-hub e2e suite | `deno test tests/workflow-node-client-hub-e2e.test.ts` | not run | ? SKIP — [locked] prohibition, `db-test` down |
| SAFE-02 corpus counts | scoped count over seeded ids in `db-test` | not run | ? SKIP — `db-test` not running |

### Probe Execution

No project probes are declared for this phase. `find scripts -path '*/tests/probe-*.sh'` matches nothing in this repository, and no PLAN or SUMMARY references a probe script. Step 7c is **N/A** — this phase's runnable evidence is the Deno test suites, executed above.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|---|---|---|---|---|
| EVENT-01 | 03-02, 03-06 | Replaying the same `(node_id, client_seq)` does not create duplicate hub state | ✓ SATISFIED | Truth 1 — e2e assertion + recorded pass + live index + §16.3 Exp 5 |
| EVENT-02 | 03-03, 03-06 | Disconnected node retains bounded events, replays oldest-first | ✓ SATISFIED | Truth 2 — verifier-executed test + §16.3 Exp 4 |
| EVENT-03 | 03-02..04, 03-06 | Spooled event removed only after hub acknowledgement | ✓ SATISFIED | Truth 3 — verifier-executed tests + exhaustive site classification |
| EVENT-04 | 03-03, 03-04, 03-06 | Overflow drops oldest and records a visible counter | ✓ SATISFIED | Truth 4 — 5 verifier-executed tests + reproduced 12-14 gap in hub rows |
| SAFE-01 | 03-01, 03-05 | Existing MCP/workflow tests remain functional | ✓ SATISFIED | Truth 5 — verifier-reproduced empty identity diff, freshness-checked |
| SAFE-02 | 03-01, 03-05 | Tests repeatable; seeded corpus not mutated or deactivated | ? NEEDS HUMAN | Truth 13 — narrative-only evidence, not reproducible from disk |

No orphaned requirements: `.planning/REQUIREMENTS.md` maps exactly EVENT-01..04 and SAFE-01/02 to Phase 3, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD` / `FIXME` / `XXX` in any phase-modified file | — | **None found.** Scanned `awcp-node-client.mjs`, both test files, `docker-compose.yml`, `CLAUDE.md`, and the findings document. Zero matches. The debt-marker gate does not fire. |
| — | — | 64-hex credential in the branch diff, §16, or 03-06-SUMMARY.md | — | **None found.** |
| — | — | `package.json` / lockfile anywhere outside `node_modules` | — | **None found** — the zero-dependency prohibition holds and the `.mjs` rationale remains valid. |
| — | — | `node:child_process`, `git` invocation, control-channel poller/dispatcher in the client | — | **None found** — the only match is a comment at `:778` explaining the absence, and a passing test asserts it. |
| — | — | Node credentials added to `findMissingRequiredEnv` (`server/src/startupValidation.ts:127`) | — | **None found** — a deployment running no nodes still boots. |

Empty-return and empty-collection greps were run and produced no stub-shaped hits: `readSpool` returns `[]` only for a genuinely missing file, `evictOldest`/`recordDrops` return early only on an empty input set. Each is a correct base case with data flowing through the non-empty path, not a placeholder.

### Prohibition Verification (must-NOT checks)

All prohibitions are test-tier or structurally checkable; all were checked and **none was violated**.

| Prohibition | Plan | Result |
|---|---|---|
| No npm dependency, no `package.json`, no lockfile | 03-02, 03-03 | ✓ HELD |
| File is `.mjs`, never `.js` | 03-02 | ✓ HELD |
| Never derive `client_seq` from spool contents | 03-02, 03-03 | ✓ HELD — `allocateSeq` reads only `seqPath` |
| Never remove a spool entry on send or retry | 03-02, 03-03 | ✓ HELD — 3 sites, all sanctioned |
| Never retry a permanent rejection; 401 stops entirely | 03-04 | ✓ HELD — tests passed under the verifier's own run |
| 401 terminal path must not clear the spool | 03-04 | ✓ HELD — "leaves the spool byte-identical" test passed |
| No control-channel receiver / poller / dispatcher | 03-04 | ✓ HELD |
| No low-seq / high-water-mark skip in `flush` | 03-04 | ✓ HELD — would have made Exp 5 vacuous; absent |
| Neither credential in logs, disk, or the diff | 03-04, 03-06 | ✓ HELD — test + verifier sweep |
| Do not modify a pre-Phase-3 test to make the gate pass | 03-05 | ✓ HELD — empty identity diff proves no rename/skip/removal; `git diff --name-only server/tests/` names only the two new files |
| Do not compare by pass/fail count | 03-05 | ✓ HELD — the artifact is name-for-name |
| Do not enable workflow via `docker-compose.workflow.yml` | 03-01 | ✓ HELD — single hardcoded line on the base `mcp` service |
| Do not add node credentials to required-env startup validation | 03-01 | ✓ HELD |
| Do not stop/restart/recreate the dev hub during Exp 4 | 03-06 | ✓ HELD (as recorded) — §16.3 states the container was created at 11:33:25Z, before the first event at 11:34:55Z; disconnection was simulated by repointing the client at `http://127.0.0.1:1`. Container-age corroboration is consistent: the dev stack has been up 3 hours at verification time. |

### Deferred / informational — explicitly NOT gaps

| # | Item | Disposition |
|---|---|---|
| 1 | **repo-rescan not implemented** | Deferred by `[locked]` plan decision in both 03-03 and 03-04, with 03-CONTEXT.md:251 leaving membership explicitly open. Named by no Phase 3 success criterion, and §16.5 argues defensibly that ADR-016 criterion 6's text does not name it either. Recorded as an open question for Phase 4 (human item 4) rather than a gap. |
| 2 | **`last_seen_at` never advances past `registered_at`** despite 17 delivered events | Phase 2 hub-side behaviour, surfaced honestly by 03-06 itself in §16.4 and confirmed by the verifier's own readback. Touched by no Phase 3 success criterion. INFO — worth a Phase 4 look. |
| 3 | **Plan's readback query named a non-existent column `first_seen_at`** | Self-corrected during execution and disclosed in §16.4. INFO. |
| 4 | **§16.7 co-tenancy probe left one `thoughts` row in the dev DB** | Deliberate, explained, and self-identifying (content names ST-088 and plan 03-06); cleanup was impossible without violating the DROP SCHEMA hazard. Accepted-by-decision, documented. INFO. |
| 5 | **Nine pre-existing test failures (8 `e2e.test.ts`, 1 `entity-worker-observability.test.ts`)** | Present identically in baseline and final; provider-401s unrelated to this phase. INFO. |
| 6 | **`progress.completed_phases` reads 1, not 2, in STATE.md** | Diagnosed in STATE.md as a GSD tooling derivation artifact (Phase 1 has no phase directory), explicitly cosmetic. INFO. |

### Gaps Summary

**No blocking gaps.** This phase is unusually well evidenced, and the verifier deliberately tried to break it rather than confirm it. The two claims most likely to be hollow in a phase like this — the regression gate and the real-node transcript — were both re-derived independently: the D-10 identity diff came out empty at 400/400 lines when the verifier recomputed it from the raw artifacts, and the §16.4 SQL readback reproduced row-for-row against the live database, gap at 12-14 included. The 29-test in-process suite was executed by the verifier and passed clean. Every `[locked]` prohibition across all six plans was checked and held, including the two subtle traps (no high-water-mark skip in `flush`; no string-coerced ack comparison) that would have let a headline criterion pass vacuously.

What keeps this out of `passed` is not a defect but five items that require a human, in descending order of substance:

1. **SAFE-02 is the one truth resting solely on the executor's word.** The corpus-integrity measurement (33/33) is recorded only in prose. Every other claim in this phase has a committed artifact or a reproducible command behind it; this one does not, and `db-test` is down so it cannot be re-derived. It is very likely true — but "very likely" is what a verification exists to replace.
2. **SC1's automated proof was accepted from a recorded run, not re-executed.** The verifier could not run `workflow-node-client-hub-e2e.test.ts` without violating 03-06's `[locked]` prohibition against touching the dev `DATABASE_URL` after enrolment. Declining was correct; the loop should still be closed against `db-test`.
3. **A standing unauthenticated surface now ships by default.** With `FEATURE_WORKFLOW` hardcoded `"true"` on the base `mcp` service and port 3000 published on all interfaces, `GET /workflow` answers **200 unauthenticated** — verified live. The data API behind it is correctly 401. The phase surfaced this itself as open question 3; it is a decision no one has yet made, and it is now the default posture of every `docker compose up -d`.
4. **repo-rescan and its scope question** arrive in Phase 4 without an owner.
5. **The bookkeeping contradicts itself.** REQUIREMENTS.md marks all six Phase 3 requirements `[x] Complete` while ROADMAP.md's Coverage table still calls the same six `Pending`, its Progress table still reads `5/6 In Progress`, and 03-06 is still unchecked — even though 03-06's work is committed. Requirements were marked complete ahead of verification. Harmless today; corrosive if it becomes habit, because ROADMAP is the contract this verifier reads.

One further caution for Phase 4, drawn from §16.10 and confirmed by the verifier's own constraint here: **z2 is enrolled and the enrolment window is closed.** Any suite run against the dev `DATABASE_URL` — including the native `./dev.sh` loop — issues `DROP SCHEMA IF EXISTS workflow CASCADE` and de-enrols the node behind an opaque 401. The rows the verifier read back today are not regenerable. Use `mcp-test`/`db-test` for every suite run.

---

_Verified: 2026-08-18T16:05:00Z_
_Verifier: Claude (gsd-verifier)_
