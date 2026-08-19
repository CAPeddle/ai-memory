---
phase: 3
reviewers: [codex]
reviewed_at: 2026-08-19T10:10:00Z
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
  - 03-06-PLAN.md
reviewer_coverage: single-reviewer
consensus_available: false
---

# Cross-AI Plan Review — Phase 3

## Reviewer Coverage — read this before the findings

**One reviewer ran. There is no consensus in this document.**

`--all` was requested. Of the eleven reviewer lanes the workflow knows about, exactly two
were detected on this host: `claude` and `codex`. `CLAUDE_CODE_ENTRYPOINT=cli` means this
session *is* Claude Code, so the `claude` lane is skipped for independence — leaving `codex`
as the only external reviewer. `gemini`, `coderabbit`, `opencode`, `qwen`, `cursor-agent`
and `agy` are not installed; the `ollama`, `lm_studio` and `llama_cpp` local servers are not
reachable on their default ports. None of those lanes was named explicitly, so under
ADR-2782 D4 their absence is lenient, not an error.

The consequence is structural: `### Agreed Strengths`, `### Agreed Concerns` and
`### Divergent Views` are defined as *"raised by 2+ reviewers"* and *"where reviewers
disagreed"*. With a single lane they cannot be filled without manufacturing
cross-validation that never happened. They are therefore left explicitly empty below, and
every finding here is an **unreplicated single-reviewer finding**. The skill's success
criterion *"consensus summary synthesized from multiple reviewers"* is **not met** for this
run.

To get real cross-AI coverage, install a second lane (`gemini`, `codex` is already present,
or run a local `ollama` server) and re-run `/gsd-review --phase 3 --all`.

**Codex had repo access.** Its output is source-grounded — it cites `path:line` throughout
and no `REVIEWED-WITHOUT-REPO-ACCESS` marker is present — so its findings are weighted as a
grounded plan review, not an impressionistic one.

### One correction applied to the input

The roadmap section fed to the reviewer says `**Plans**: 5/6 plans executed` and lists
`- [ ] 03-06-PLAN.md` unchecked. **That roadmap text is stale.** Wave 6 shipped in
`b32b6ab` (PR #50), `03-06-SUMMARY.md` exists, and `## 16.` of
`docs/investigations/ST-084-awcp-host-spike-findings.md` carries the criterion-6 evidence.
The review prompt stated the correction explicitly, and no finding below rests on
"03-06 was not executed."

---

## Codex Review

# Cross-AI Plan Review

## Overall assessment

The six-plan sequence is unusually rigorous and largely achieves the phase goal. Dependency ordering is sound, automated tests cover the important delivery invariants, and the real-node evidence substantiates authentication, replay, bounded spooling, heartbeat, and checkpoint behavior.

The main residual risks are in the client’s local persistence layer: `client_seq` allocation is not safe across concurrent processes, rename-based durability is overstated because directory metadata is not synced, and spool eviction can become inconsistent with its drop counter after a crash. There are also smaller robustness and governance gaps in response parsing, signal shutdown, and stale phase state.

Overall risk: **MEDIUM**. The implemented single-client experiment is credible, but the client should not yet be treated as generally robust under concurrent invocation or all crash boundaries.

---

# Plan 03-01 — Regression Baseline and Workflow Enablement

## Summary

Plan 03-01 establishes the right prerequisites: a test-identity baseline and a mounted workflow surface on the development hub. Both were implemented as intended. The baseline includes passing and failing tests, and `FEATURE_WORKFLOW` is explicitly supplied to the base `mcp` service.

## Strengths

- The baseline captures individual identities and outcomes rather than totals. The artifact contains the command, source commit, and sorted `file::test => outcome` entries in [.planning/.../03-REGRESSION-BASELINE.txt](/home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt:1).

- It recorded the expected 400 pre-phase cases, including 391 passes and nine failures. This supports detection of removed or renamed tests, not just newly failing ones.

- Workflow enablement is correctly placed under the base `mcp` service and hardcoded to `"true"` in [docker-compose.yml](/home/cpeddle/projects/ai-memory/docker-compose.yml:49). This resolves the actual mount condition instead of relying on `/health`.

- The compose comments preserve the useful diagnostic distinction between a route-level 404 and an authenticated 401.

## Concerns

- **MEDIUM — The change expands the development attack surface indefinitely.** `FEATURE_WORKFLOW` remains permanently enabled in [docker-compose.yml](/home/cpeddle/projects/ai-memory/docker-compose.yml:58), while the findings still describe its post-phase status as an unresolved maintainer decision in [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1516). The plan recognized this risk but did not create a deadline or owner for resolving it.

- **LOW — The baseline format depends on JUnit classnames remaining stable.** This is adequate for the present phase, but changes in Deno’s JUnit formatter could create an apparent regression unrelated to test behavior.

## Suggestions

- Resolve the `FEATURE_WORKFLOW` persistence decision in Phase 4 and record either:

  - why the dashboard and workflow routes are acceptable on the published development port, or
  - how remote-node work should enable the flag temporarily and verify it afterward.

- Consider committing a small reusable baseline comparator if identity comparisons will be used again. For a one-time phase gate, the throwaway parser was reasonable.

## Risk Assessment

**LOW–MEDIUM.** The prerequisite work is correct; the principal risk is leaving the newly exposed development surface unresolved.

---

# Plan 03-02 — End-to-End Tracer and Duplicate Replay

## Summary

Plan 03-02 successfully proves the architecture over a real process boundary. The client is imported by Deno, registers with a spawned hub, spools and flushes an event, and verifies server-side deduplication with identical acknowledgements.

## Strengths

- The tracer drives the production client against a real spawned server rather than replacing the client with raw HTTP. The complete path is asserted in [workflow-node-client-hub-e2e.test.ts](/home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts:86).

- The test verifies an empty spool after acknowledgement and a node-scoped database row count at [workflow-node-client-hub-e2e.test.ts](/home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts:116).

- EVENT-01 is tested correctly: the same `client_seq` is submitted twice, acknowledgements including `event_id` are compared, and the scoped row count remains one at [workflow-node-client-hub-e2e.test.ts](/home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts:220).

- The same-sequence/different-payload behavior is explicitly tested. The stored payload remains the first payload at [workflow-node-client-hub-e2e.test.ts](/home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts:260).

- Credential persistence is narrow: registration writes only `node_id` at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:442).

## Concerns

- **MEDIUM — Importing the module is not actually side-effect-free.** Module evaluation globally replaces `process.emitWarning` at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:134). The guard test checks only network calls and filesystem creation, so it misses this global mutation. Cache-busted reimports can wrap the warning handler repeatedly.

- **LOW — Registration assumes a successful 201 body contains a valid `node_id`.** It writes `body.node_id` without validating its type or UUID shape at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:474). The current hub supplies the correct shape, but a malformed proxy or incompatible hub could corrupt local state.

- **LOW — Failed registration includes the complete response text in an exception.** The code at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:466) relies on the hub never reflecting credential material. That is true of the current hub, but the client’s leak guarantee would be stronger if remote response bodies were not included verbatim.

## Suggestions

- Move warning suppression into `main()` or make it explicitly installable and idempotent. Avoid changing process-global behavior merely by importing the library portion.

- Validate successful registration bodies before writing `node_id`.

- Sanitize or bound remote error text before including it in thrown errors.

## Risk Assessment

**LOW–MEDIUM.** The protocol proof is strong. The remaining issues concern library hygiene and defensive response handling.

---

# Plan 03-03 — Spool Reliability and Sequence Durability

## Summary

Plan 03-03 covers the intended functional behavior well: bounded spooling, oldest-first eviction, visible drop accounting, outage retention, partial acknowledgement handling, batching, and sequence persistence. However, it overstates crash and concurrency safety.

## Strengths

- `client_seq` is persisted separately and never derived from the spool at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:250).

- The restart tests rebuild configuration over the same directory and prove allocation continues at six after a full drain or spool deletion at [awcp-node-client.test.ts](/home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts:633).

- The spool cap is enforced after append so the newest event survives at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:268).

- Overflow is visible through persisted state and structured stderr. `recordDrops` records the sequence, reason, and running total at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:388).

- Tests cover byte-identical retention after network failure, outbound oldest-first ordering, partial acknowledgement, and 500/100 batching.

## Concerns

- **HIGH — `client_seq` allocation is not safe across concurrent client processes.** `allocateSeq` performs an unlocked read-increment-truncate-write sequence at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:250). Two simultaneous `emit`, `run`, or checkpoint processes can both read the same value and allocate the same next sequence. The purported repeated-allocation test is sequential, not concurrent: it calls `allocateSeq` in a normal loop at [awcp-node-client.test.ts](/home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts:700).

- **MEDIUM — Crash durability is overstated.** `writeSpool` fsyncs the temporary file and renames it, but never fsyncs the containing directory at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:318). Atomic rename protects readers from partial content, but without a directory fsync the rename itself is not guaranteed durable across sudden power loss.

- **MEDIUM — Overflow eviction and drop accounting are not atomic.** `evictOldest` first replaces the spool and only then calls `recordDrops` at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:413). A crash between those operations loses events without incrementing the required visible counter.

- **MEDIUM — Corrupt state is silently treated as zero.** `readState` converts malformed JSON into a fresh zero counter at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:347). That can make previous drops disappear from operator-visible state.

- **LOW — Full spool parsing on every append is O(n).** `appendEvent` rereads and parses the entire spool to determine its length at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:282). With the default cap of 1,000 this is acceptable for the spike, but it should be recorded as a scaling limit.

## Suggestions

- Enforce a single-process model explicitly with a lock file, or make allocation atomic across processes. Add a true concurrency test using multiple spawned Node processes.

- After rename, open and fsync the parent directory on Linux.

- Make overflow accounting recoverable. Options include:

  - persisting an eviction journal before rewriting the spool;
  - combining spool metadata and drop totals in one state transition;
  - detecting sequence gaps after restart and reconciling the counter.

- Treat corrupt spool or state files as a loud terminal condition, or quarantine them, instead of silently resetting state.

## Risk Assessment

**MEDIUM–HIGH.** Functional outage behavior is well tested, but concurrent execution and crash-boundary guarantees are weaker than the plan claims.

---

# Plan 03-04 — Failure Semantics, Heartbeats, and Credential Gate

## Summary

Plan 03-04 closes the major livelock paths and provides strong tests for permanent rejection, bounded retry, terminal authentication failure, heartbeat/checkpoint reporting, and credential leakage. A few malformed-response and shutdown cases remain.

## Strengths

- Response status is checked before body parsing, which correctly handles the hub’s plain-text 401 at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:530).

- Permanent 400 rejection removes only named sequences and increments the common drop counter at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:690).

- Authentication, unknown-node, oversize, and malformed outcomes stop without altering the spool at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:713).

- The retry loop detects a zero-progress 200 and applies bounded backoff instead of looping forever at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:666).

- Heartbeat and checkpoint events use the same durable event path instead of inventing unsupported endpoints at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:753).

- The D-13 test captures multiple output surfaces and checks both output and persisted files.

## Concerns

- **MEDIUM — Malformed response bodies can still throw outside the stated outcome model.** A 400 always executes `await res.json()` at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:533), and a 200 assumes `body.acknowledged.map` exists at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:556). Invalid JSON or a malformed success body rejects `flush()` rather than returning `malformed` or `retryable`.

- **MEDIUM — SIGINT/SIGTERM shutdown can wait a full heartbeat interval.** `runAgent.stop()` only flips a flag; the loop remains blocked in `sleepImpl(interval)` until the timer finishes at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:830). With the default interval, shutdown can be delayed by nearly 60 seconds.

- **MEDIUM — A graceful stop can report exit code 0 even if the final checkpoint was deferred or otherwise undelivered.** The final result distinguishes only terminal authentication from everything else at [awcp-node-client.mjs](/home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs:840). A retry-exhausted final flush therefore looks successful to the shell while the stop checkpoint remains spooled.

- **LOW — Retry jitter is capped after applying jitter.** At the cap, negative jitter can produce a delay below 30 seconds while positive jitter is clamped. That is acceptable, but not a symmetric ±20% cap policy.

## Suggestions

- Wrap all response parsing and validate response schemas. Convert invalid bodies into an explicit `malformed_response` outcome with spool preservation.

- Use an abortable timer or race sleep against a stop promise so signals wake the loop immediately.

- Propagate exit code 75 when the final shutdown flush is deferred, and document whether a stop checkpoint left in the spool is considered a clean shutdown.

- Add tests for invalid JSON 400, invalid JSON 200, missing `acknowledged`, and `acknowledged` containing unknown or duplicate sequences.

## Risk Assessment

**MEDIUM.** The principal failure semantics are sound; malformed remote responses and shutdown reporting are the remaining reliability gaps.

---

# Plan 03-05 — Regression Safety and Corpus Integrity

## Summary

Plan 03-05 provides a strong mechanical regression gate. It compares the same pre-phase test identities, verifies the new tests independently, measures both total and active seeded rows, and updates the test-permission inventory.

## Strengths

- The final artifact uses the same identity/outcome form as the baseline in [.planning/.../03-REGRESSION-FINAL.txt](/home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt:1).

- The findings record an empty comparison over 400 pre-existing tests and the unchanged 391/9 split at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1439).

- SAFE-02 measures both total and active corpus rows, correctly guarding the known consolidation-worker failure mode. The recorded values remain 33/33 at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1448).

- The permission inventory now names both new files and explains why each grant exists in [CLAUDE.md](/home/cpeddle/projects/ai-memory/CLAUDE.md:110).

- The full suite was correctly sequenced before real-node enrolment.

## Concerns

- **LOW — The planned filter initially omitted the `./` prefix used by actual JUnit classnames.** This was caught and recorded in [.planning/STATE.md](/home/cpeddle/projects/ai-memory/.planning/STATE.md:92). The executed comparison was corrected, but it demonstrates that the scripted acceptance command itself was not initially trustworthy.

- **LOW — The final regression artifacts attest to one historical run, not the current branch tip.** This is expected for evidence artifacts, but later changes to the client or tests would invalidate the conclusion unless the comparison is rerun.

## Suggestions

- Add a documented freshness rule: any later modification to the client, compose configuration, or either new test file invalidates the 03-05 verification.

- If the identity comparison becomes recurring practice, commit a comparator that derives the new-file exclusion set from the baseline rather than hardcoding path prefixes.

## Risk Assessment

**LOW.** This plan is one of the strongest parts of the phase and materially supports SAFE-01 and SAFE-02.

---

# Plan 03-06 — Real-Node Evidence and Findings

## Summary

Plan 03-06 produces credible real-node evidence and a detailed durable record. The SQL readback demonstrates heartbeat, checkpoint, replay, overflow gaps, and monotonic sequencing. The main shortcomings are that some claims are stronger than the captured transcript alone proves, a permanent dev-memory row was unnecessarily retained, and execution state was left stale.

## Strengths

- The findings include a node-scoped SQL readback with heartbeat, checkpoint, outage events, overflow gaps, and the final D-14 event at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1350).

- Duplicate replay is supported by stable row count and repeated acknowledgements at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1289).

- Invalid authentication visibly terminates with exit 77 and leaves one event spooled at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1303).

- Real-node overflow is supported by structured drop lines and a readback gap at sequences 12–14 at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1322).

- The report honestly records that `last_seen_at` did not advance and that repo-rescan was not implemented at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1398).

- Co-tenancy evidence is correctly scoped as a two-call smoke observation, not a scaling result, at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1452).

## Concerns

- **MEDIUM — “Exactly one request was made” is not independently visible in the real-node transcript.** The evidence shows one terminal response and exit 77 at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1306), but no request counter, hub access log, or timestamp series establishes that only one HTTP attempt occurred. The automated unit test does establish it, but the real-node claim should say it is inferred from the terminal client path unless independently measured.

- **MEDIUM — The co-tenancy probe intentionally polluted persistent development memory.** The report retained a `capture_thought` row and argues that a targeted delete would use “the same connection that must not touch workflow” at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1469). A scoped deletion from `public.thoughts` would not imply touching the workflow schema. Retention may be acceptable, but the stated technical rationale is weak.

- **MEDIUM — Phase execution state is stale after completion.** `.planning/STATE.md` still says `status: executing`, `stopped_at: Completed 03-05-PLAN.md`, and “Ready to execute” at [.planning/STATE.md](/home/cpeddle/projects/ai-memory/.planning/STATE.md:7) and [.planning/STATE.md](/home/cpeddle/projects/ai-memory/.planning/STATE.md:31), even though 03-06 evidence and summaries are committed.

- **LOW — D-14’s transcript shows only `emit`, not its succeeding flush.** The SQL row proves sequence 20 eventually arrived at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1389), but the local transcript at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1340) omits the delivery command. The evidence remains sufficient when read with the SQL readback, but the narrative is incomplete.

- **LOW — Enrolment remains difficult to reproduce safely.** The operational write-up discovered stale Compose environment and missing-newline hazards, now recorded at [ST-084 findings](/home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md:1496), but no repeatable operator script was produced.

## Suggestions

- Qualify the real-node “one request” statement as an inference, or capture request count from a scoped hub log in a future rerun.

- Either remove the co-tenancy shard with a precise, reviewed `DELETE WHERE id = ...`, or explicitly treat it as a permanent audit artifact without the claim that safe cleanup is technically impossible.

- Update `.planning/STATE.md` to show Plan 6 completed and point to the actual next phase.

- Add a non-secret enrolment runbook that validates newline handling, forces recreation, verifies environment length inside the container, and performs closure proof without exposing credentials.

## Risk Assessment

**MEDIUM.** The real-node evidence is persuasive, but the governance state and a few evidence claims need tightening.

---

# Phase-level conclusions

The phase goals are substantially met:

- EVENT-01 is proven through both a real-process integration test and a real-node replay.
- EVENT-02 and EVENT-03 are covered by deterministic outage tests and real-node evidence.
- EVENT-04 is visible in state, stderr, status output, and the SQL sequence gap.
- SAFE-01 is supported by an identity-level empty diff.
- SAFE-02 is supported by corpus measurements and consecutive test runs.
- Heartbeat and checkpoint behavior is present and persisted.

Before treating the node client as more than a one-node spike, I recommend four follow-ups:

1. Make `client_seq` allocation and spool mutation single-writer or cross-process safe.
2. Correct crash-durability claims and add directory syncing/recovery.
3. Harden malformed response handling and shutdown exit semantics.
4. Resolve the permanent `FEATURE_WORKFLOW` exposure and update the stale phase state.

Overall phase risk: **MEDIUM**. The evidence is good enough for ADR-016 host-decision input, but it should carry an explicit limitation: reliable delivery was demonstrated under a single active client process, not concurrent local producers or every hard-crash boundary.

---

## Consensus Summary

**Not available — one reviewer ran.** See *Reviewer Coverage* above. What follows is the
single reviewer's position, spot-checked against source by the orchestrating session, not a
consensus.

### Agreed Strengths

*(empty — requires 2+ reviewers)*

### Agreed Concerns

*(empty — requires 2+ reviewers)*

### Divergent Views

*(empty — requires 2+ reviewers to disagree)*

---

## Unreplicated Single-Reviewer Findings, ranked

Codex's verdict: **phase goals substantially met, overall risk MEDIUM.** All six requirements
(EVENT-01..04, SAFE-01, SAFE-02) are judged discharged. The concerns are about what the
evidence *does not* cover, not about whether the phase delivered.

The orchestrating session independently opened the cited lines for the five findings below.
Each was confirmed present in the source as described — this is verification of the
*mechanism*, not endorsement of the severity.

| # | Severity | Finding | Verified at |
|---|---|---|---|
| 1 | HIGH | `allocateSeq` is an unlocked read-increment-write; two concurrent client processes can allocate the same `client_seq`. The "repeated allocation" test loops sequentially in one process, so it does not exercise this. | `server/scripts/awcp-node-client.mjs:250` — confirmed: `existsSync` → `readFileSync` → `+1` → `writeFileFsync`, no lock file |
| 2 | MEDIUM | Crash durability is overstated — `writeSpool` fsyncs the temp fd and renames, but never fsyncs the containing directory, so the rename itself is not power-loss durable. | `server/scripts/awcp-node-client.mjs:318` — confirmed: `openSync`/`writeSync`/`fsyncSync`/`closeSync` on the temp file only, then rename |
| 3 | MEDIUM | Eviction and drop accounting are not atomic — `evictOldest` calls `writeSpool` first and `recordDrops` second. A crash between them loses events *without* incrementing the counter EVENT-04 requires to be visible. | `server/scripts/awcp-node-client.mjs:413` — confirmed ordering |
| 4 | MEDIUM | Phase execution state is stale. `.planning/STATE.md` still reads `status: executing`, `stopped_at: Completed 03-05-PLAN.md`, `Status: Ready to execute` — the same staleness as the roadmap checkbox above. | `.planning/STATE.md:7`, `:31` — confirmed |
| 5 | MEDIUM | `FEATURE_WORKFLOW: "true"` is hardcoded on the base `mcp` service with no deadline or owner for reverting it, expanding the published dev-port surface indefinitely. | `docker-compose.yml:58` — confirmed hardcoded, with the reasoning preserved in the comment block above it |

Further MEDIUM findings not independently re-verified in this session, recorded as the
reviewer stated them: module-import side effects (`process.emitWarning` replaced at
evaluation time, `awcp-node-client.mjs:134`); malformed-response handling (`res.json()` on a
400, `body.acknowledged.map` assumed on a 200); SIGINT/SIGTERM shutdown blocked in
`sleepImpl` for up to a full heartbeat interval; graceful stop reporting exit 0 with an
undelivered final checkpoint still spooled; the real-node "exactly one request" claim being
inferred from the client path rather than measured from a hub log; and the retained
co-tenancy `capture_thought` row in dev memory.

### The limitation worth carrying into ADR-016

Codex's closing sentence is the one that matters for Phase 4's host decision, and it is not
a defect claim:

> reliable delivery was demonstrated under a single active client process, not concurrent
> local producers or every hard-crash boundary.

Findings 1–3 are all instances of that single scope statement. If ADR-016 cites Phase 3
evidence, it should carry this qualifier rather than an unbounded "reliable delivery proven."

---

## Suggested disposition

Phase 3 is executed, verified (`03-VERIFICATION.md`) and code-reviewed (`03-REVIEW.md`), and
its work is merged. **Do not route this into `/gsd-plan-phase 3 --reviews`** — that would
replan shipped work. The findings belong in one of three places:

- **Phase 4 input** — the ADR-016 scope qualifier, and the `FEATURE_WORKFLOW` persistence
  decision (finding 5), which Phase 4 already owns.
- **Housekeeping, now** — finding 4 (`.planning/STATE.md`) and the stale
  `**Plans**: 5/6` / unchecked `03-06` line in `.planning/ROADMAP.md`.
- **A new ST-NNN story** — findings 1–3 plus the malformed-response and shutdown-semantics
  concerns, as node-client hardening. These are real gaps, but they are hardening beyond
  what Phase 3 set out to prove.
