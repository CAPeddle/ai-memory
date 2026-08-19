---
phase: 3
reviewers: [codex, antigravity]
reviewed_at: 2026-08-19T13:40:00Z
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
  - 03-06-PLAN.md
reviewer_coverage: two-lane
consensus_available: true
both_lanes_source_grounded: true
---

# Cross-AI Plan Review — Phase 3

## Reviewer Coverage

**Two lanes ran, both with repo access.** Neither emitted the
`REVIEWED-WITHOUT-REPO-ACCESS` marker, and both cite `path:line` evidence throughout, so
both are weighted as grounded plan reviews and the consensus sections below are real.

| Lane | Status | Grounding |
|---|---|---|
| `codex` | ran | source-grounded — verified against the working tree |
| `antigravity` (`agy`) | ran | source-grounded — read files `codex` never opened (`store.ts`, `remoteNodeHub.ts`, `index.ts`) |
| `claude` | skipped | this session — skipped for independence |
| `gemini`, `coderabbit`, `opencode`, `qwen`, `cursor` | not installed | — |
| `ollama`, `lm_studio`, `llama_cpp` | not reachable | — |

The two lanes read **overlapping but not identical** parts of the tree, which is what makes
the divergences below informative rather than noise.

### One correction applied to the input

The roadmap section fed to both reviewers says `**Plans**: 5/6 plans executed` and shows
`- [ ] 03-06-PLAN.md` unchecked. **That roadmap text is stale.** Wave 6 shipped in `b32b6ab`
(PR #50), `03-06-SUMMARY.md` exists, and `## 16.` of
`docs/investigations/ST-084-awcp-host-spike-findings.md` carries the criterion-6 evidence.
Both prompts stated the correction explicitly, and no finding below rests on "03-06 was not
executed."

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

## Antigravity Review

# Phase 3 Implementation Plan Review: Node Client, Reliable Delivery & Regression Safety

This review evaluates the six implementation plans for **Phase 3 (ST-088 Stage 2 Unit 3)** of the `ai-memory` project, verifying all architectural designs, implementation decisions, and verification claims directly against the repository source files at `/home/cpeddle/projects/ai-memory`.

---

## Overall Phase Assessment

Phase 3 achieves all its stated goals: building a zero-dependency Node.js ESM execution node client ([`server/scripts/awcp-node-client.mjs`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs)), establishing idempotent event delivery, enforcing bounded crash-safe local spooling, handling non-retryable and terminal failure modes, and proving the remote node leg against the real execution node (`z2`) without regressing existing MCP tools or mutating the seeded search corpus. The sequential wave ordering (Waves 1–6) mitigated cross-plan dependencies and prevented shared-database test pollution.

---

## Plan 03-01: Regression Baseline & `FEATURE_WORKFLOW` Enablement (Wave 1)

### 1. Summary
Plan 03-01 establishes the foundational testing and operational prerequisites for Phase 3 by capturing a machine-diffable, test-identity-keyed regression baseline ([`03-REGRESSION-BASELINE.txt`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt)) against the isolated test container (`mcp-test` / `db-test`), and enabling `FEATURE_WORKFLOW: "true"` directly within the base `mcp` service in [`docker-compose.yml:58`](file:///home/cpeddle/projects/ai-memory/docker-compose.yml#L58). This ensures that the `/workflow/nodes/*` routes mount and return `401 Unauthorized` (auth required) rather than `404 Not Found`, unblocking real-node communication without disabling background worker services.

### 2. Strengths
- **Identity-based regression baseline**: Recording test identity and outcome mappings (`<classname>::<name> => ok|FAILED`) across 400 tests ([`03-REGRESSION-BASELINE.txt:4-404`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-BASELINE.txt#L4-L404)) prevents masking regressions when a broken test coincides with a flaky test recovery.
- **Worker flag preservation**: Enabling `FEATURE_WORKFLOW: "true"` on the base service ([`docker-compose.yml:58`](file:///home/cpeddle/projects/ai-memory/docker-compose.yml#L58)) rather than applying `docker-compose.workflow.yml` preserves the default-true flags for `FEATURE_ENTITY_WORKER`, `FEATURE_CONSOLIDATION_WORKER`, `FEATURE_EMBEDDING_BACKFILL`, and `MODEL_PROVIDER_ENABLED` ([`server/index.ts:1313-1314`](file:///home/cpeddle/projects/ai-memory/server/index.ts#L1313-L1314)), avoiding degradation of co-tenancy conditions.
- **Diagnostic clarity**: The 12-line comment in [`docker-compose.yml:46-57`](file:///home/cpeddle/projects/ai-memory/docker-compose.yml#L46-L57) documents the critical distinction between 404 (unmounted route) and 401 (mounted route rejecting missing auth), preventing future misdiagnosis.

### 3. Concerns
- **Exposure of unauthenticated UI shell** (`Severity: LOW`): Setting `FEATURE_WORKFLOW: "true"` mounts the static unauthenticated `/workflow` dashboard shell on `0.0.0.0:3000` ([`docker-compose.yml:67`](file:///home/cpeddle/projects/ai-memory/docker-compose.yml#L67)). While backend data endpoints under `/api/workflow` remain protected by `MEMORY_API_KEY` or `AWCP_AGENT_API_KEY`, the static UI is publicly reachable over any open network interface.
- **Test database accumulation** (`Severity: LOW`): Baseline tests ran against `db-test`, which persists across test runs during a container's lifetime ([`CLAUDE.md:114-116`](file:///home/cpeddle/projects/ai-memory/CLAUDE.md#L114-L116)), creating minor potential for ordering/state drift if tests leave uncleaned rows.

### 4. Suggestions
- Document in deployment runbooks whether `FEATURE_WORKFLOW` should remain enabled in production compose files or if it should be bound strictly to private network interfaces.
- Consider parameterizing the UI dashboard binding behind an authentication middleware if exposed beyond local/tailnet environments.

### 5. Risk Assessment
**Risk Level: LOW**. The changes are additive, strictly isolated to configuration and baseline measurement, and easily reversible with zero mutation to core business logic.

---

## Plan 03-02: Node Client Tracer & EVENT-01 Replay Proof (Wave 2)

### 1. Summary
Plan 03-02 implements the initial production tracer of the node client in [`server/scripts/awcp-node-client.mjs`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs) and validates the end-to-end event lifecycle (sequence allocation, durable append, registration, real-process HTTP transmission, read-back acknowledgement, and spool truncation) via [`server/tests/workflow-node-client-hub-e2e.test.ts`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts). It also establishes the repeatable gate for **EVENT-01** (duplicate event replay idempotency) against a real spawned server process.

### 2. Strengths
- **Strict zero-dependency ESM**: Built as a standalone `.mjs` module ([`server/scripts/awcp-node-client.mjs:49-64`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L49-L64)) using only Node 18 built-ins (`node:fs`, `node:path`, `node:os`, `node:url`, `node:crypto`), avoiding `package.json` pollution in a Deno-primary repository.
- **Real-process test boundary**: Validates HTTP mounting, registration, and duplicate suppression using `startServerProcess` ([`server/tests/workflow-node-client-hub-e2e.test.ts:88-142`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts#L88-L142)) on port 3146, exercising the real network and PostgreSQL constraints rather than in-memory mocks.
- **Wire-type validation**: The test verifies that `acknowledged[].client_seq` is received as a native JS `number` without client-side `Number()` coercion ([`server/tests/workflow-node-client-hub-e2e.test.ts:238-248`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts#L238-L248)), directly preventing regressions of the `bigint` string-coercion defect noted in [`server/src/workflow/store.ts:840-857`](file:///home/cpeddle/projects/ai-memory/server/src/workflow/store.ts#L840-L857).
- **Entry-point guard inertness**: Implements and tests `isMainModule()` ([`server/scripts/awcp-node-client.mjs:946-958`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L946-L958), [`server/tests/workflow-node-client-hub-e2e.test.ts:144-180`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts#L144-L180)), guaranteeing that importing the client into Deno test runners executes zero network calls and touches no real user directories.

### 3. Concerns
- **Fixed test port allocation** (`Severity: MEDIUM`): Hardcoding `PORT = 3146` ([`server/tests/workflow-node-client-hub-e2e.test.ts:53`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts#L53)) introduces potential port collision if parallel test runners or lingering orphaned processes bind to port 3146.
- **Cross-runtime OS permission edge** (`Severity: LOW`): Under Deno's `node:` compatibility layer, `node:os` `hostname()` requires `--allow-sys=hostname`. Handled gracefully via `try/catch` in `detectHostname()` ([`server/scripts/awcp-node-client.mjs:146-152`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L146-L152)), but represents inherited friction when running Node scripts under Deno.

### 4. Suggestions
- Use dynamic port assignment (`port: 0` or ephemeral port discovery) in `serverProcess.ts` helpers to ensure full concurrency safety across test runners.
- Add an explicit timeout on the spawned server process shutdown hook to prevent test runner hanging on abnormal exit.

### 5. Risk Assessment
**Risk Level: LOW**. Proves the fundamental cross-process tracer and idempotency mechanics with high fidelity and strict scoping.

---

## Plan 03-03: Spool Reliability, Bounding & Monotonicity (Wave 3)

### 1. Summary
Plan 03-03 expands the client with bounded spool storage (`AWCP_SPOOL_MAX_ENTRIES`, default 1000), oldest-first eviction on overflow, a crash-consistent state counter ([`~/.awcp/state.json`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L347-L377)), structured stderr logging of dropped events, a CLI `status` subcommand, multi-batch flushing, and validation of **EVENT-02, EVENT-03, EVENT-04**, and decision **D-14** (persisted `client_seq` monotonicity across spool drains).

### 2. Strengths
- **Crash-safe atomic file replacement**: Uses temporary file creation, synchronous write, OS flush, and POSIX `renameSync` ([`server/scripts/awcp-node-client.mjs:309-334`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L309-L334), [`363-377`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L363-L377)) for all spool and state truncation operations, verified with an injected crash hook ([`server/tests/awcp-node-client.test.ts:353-398`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L353-L398)).
- **D-14 counter persistence isolation**: `allocateSeq()` increments a dedicated `<home>/client_seq` file ([`server/scripts/awcp-node-client.mjs:250-261`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L250-L261)) and never derives sequence numbers from spool contents. Tests verify that allocating after a complete drain or file deletion continues monotonically ([`server/tests/awcp-node-client.test.ts:634-723`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L634-L723)), closing a critical failure mode where sequence numbers reset to 0 and get silently dropped by hub deduplication.
- **Three-way drop visibility**: Ensures dropped events are visible via disk state, structured stderr output (`reason=spool_overflow`), and the `status` subcommand ([`server/scripts/awcp-node-client.mjs:388-406, 889-897`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L388-L406)), meeting Success Criterion 4.
- **Zero test pollution**: All 14 tests in [`server/tests/awcp-node-client.test.ts`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts) execute in-process using injected temp directories and custom `fetchImpl` doubles, requiring no database and remaining within `--allow-write=/tmp`.

### 3. Concerns
- **Full-file rewrite overhead** (`Severity: LOW`): Rewriting the entire `spool.jsonl` on every eviction or partial acknowledgement has $O(N)$ I/O cost. At the bounded limit of 1000 events ($\le 16\text{ MB}$), this is negligible for an execution node, but would require segment rotation if scaled to high-frequency logging.
- **File mode persistence across modifications** (`Severity: LOW`): File creation uses `0o600` and `ensureStateDir` enforces `0o700` ([`server/scripts/awcp-node-client.mjs:234-240`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L234-L240)), though on non-POSIX filesystems (e.g. standard Windows mounts) mode bits are non-functional. Not an issue on Linux/Ubuntu targets.

### 4. Suggestions
- Include a lightweight compaction or batching mechanism if event volume ever exceeds several hundred events per second.
- Consider adding a file lock (`flock`) if multiple client processes might ever be invoked concurrently against the same `AWCP_HOME`.

### 5. Risk Assessment
**Risk Level: LOW**. Complete, robust test coverage verifying disk durability, sequence monotonicity, and outage replay order.

---

## Plan 03-04: Failure Semantics, Terminal States & Telemetry (Wave 4)

### 1. Summary
Plan 03-04 implements failure handling, bounded backoff retry policies, telemetry emission, and credential security. Specifically, it delivers **D-15** permanent rejection handling (400 responses with specific invalid sequence numbers drop only those entries), **D-17** terminal authentication handling (401 stops immediately with exit code 77 and leaves spool intact), exponential backoff with jitter up to 30s (`MAX_FLUSH_ATTEMPTS = 6`), heartbeat and checkpoint event emission, the `runAgent` loop, and the **D-13** automated credential leak test.

### 2. Strengths
- **Status-before-body parsing**: `flushOnce()` evaluates `res.status` before attempting `res.json()` ([`server/scripts/awcp-node-client.mjs:530-558`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L530-L558)). Because the hub returns plain text for 401 Unauthorized ([`server/src/workflow/remoteNodeHub.ts:110`](file:///home/cpeddle/projects/ai-memory/server/src/workflow/remoteNodeHub.ts#L110)), this avoids a `SyntaxError` that would otherwise misclassify authentication rejection as an unreachable transport error.
- **Livelock prevention (D-15)**: Dropping only the offending sequence numbers identified in a 400 `issues` array ([`server/scripts/awcp-node-client.mjs:690-711`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L690-L711)) ensures that a single oversized payload does not block the delivery of valid queued events behind it.
- **Zero-progress acknowledgement guard**: `flush()` detects if a 200 response returns an acknowledgement list that does not intersect the sent batch ([`server/scripts/awcp-node-client.mjs:679-684`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L679-L684)), triggering backoff and deferral rather than spinning in an infinite loop.
- **Automated D-13 credential leak gate**: Intercepts all six runtime logging channels (`console.log/error/warn/info`, `process.stdout.write`, `process.stderr.write`) and scans disk state ([`server/tests/awcp-node-client.test.ts:1282-1444`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L1282-L1444)), verifying that neither `AWCP_NODE_BEARER` nor `AWCP_NODE_ENROLMENT_SECRET` leaks into output even when a transport error explicitly includes the raw Authorization header.

### 3. Concerns
- **Telemetry payload null node_id handling** (`Severity: LOW`): If `emitCheckpoint` is invoked before registration has occurred, `readNodeIdOrNull(config)` returns `null` ([`server/scripts/awcp-node-client.mjs:738-745, 789`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L738-L745)). While serialized cleanly, the event will have `node_id: null` in its JSON payload until the node completes registration.
- **Single backoff timer in `runAgent`** (`Severity: LOW`): In `runAgent`, if an intermediate flush experiences transient network failure and defers (exit 75), the agent waits for the next heartbeat interval before attempting to flush again ([`server/scripts/awcp-node-client.mjs:831-837`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L831-L837)), which is acceptable given the default 60s heartbeat cadence.

### 4. Suggestions
- Add a fast-fail pre-check in `runAgent` or `main(["emit"|"checkpoint"])` to warn the operator if the node is not registered before emitting domain checkpoints.
- Ensure backoff parameters (`BACKOFF_BASE_MS`, `BACKOFF_CAP_MS`) are exposed via environment variables for testing in low-latency simulation environments.

### 5. Risk Assessment
**Risk Level: LOW**. Exceptional error-handling architecture, complete coverage of edge cases, and verifiable absence of credential leakage.

---

## Plan 03-05: SAFE-01 / SAFE-02 Regression Gate & Grant Inventory (Wave 5)

### 1. Summary
Plan 03-05 executes the full regression safety verification prior to real-node testing. It validates **SAFE-01** by comparing the post-Phase-3 test suite output ([`03-REGRESSION-FINAL.txt`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt)) against the pre-Phase-3 baseline, confirming an empty name-for-name diff across all 400 pre-existing tests (391 ok / 9 known provider failures). It verifies **SAFE-02** by measuring the row counts (`total=33`, `active=33`) of the seeded search corpus (`00000000-0000-4000-8000-%`) before and after the full suite. Additionally, it updates [`CLAUDE.md:73-98`](file:///home/cpeddle/projects/ai-memory/CLAUDE.md#L73-L98) to reflect the new test files in the permission grant inventory.

### 2. Strengths
- **Deterministic identity comparison**: Proves that all 400 pre-existing tests retain identical statuses before and after the phase ([`03-REGRESSION-FINAL.txt:1-436`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt#L1-L436)), with zero modifications made to existing test files (`git diff --name-only` confirms only the 2 new test files were added).
- **Direct measurement of corpus integrity**: Verifies that neither total row count nor active row count (`count(*) FILTER (WHERE active)`) of the seeded golden search corpus changed during test execution, ensuring background consolidation workers did not deactivate shards.
- **Accurate grant inventory**: Updates CLAUDE.md with precise technical justifications for why `workflow-node-client-hub-e2e.test.ts` earns `--allow-run=deno` (process spawning) and why both new test files earn `--allow-write=/tmp` ([`CLAUDE.md:76-98`](file:///home/cpeddle/projects/ai-memory/CLAUDE.md#L76-L98)).

### 3. Concerns
- **Accumulating test database dependency** (`Severity: LOW`): Two of the nine known baseline failures (`in-project rows outrank cross-project rows` and `MMR diversifies near-duplicate zoom hits out of top-3`) depend on ranking scores in `db-test`. If `db-test` were recreated midway through, score variations could cause false diffs. This was avoided by running baseline and final comparisons against the same container lifecycle.

### 4. Suggestions
- Package the normalization and diffing logic used for `03-REGRESSION-FINAL.txt` into a reusable CI workflow or developer verification script (`verify-regression.sh`).

### 5. Risk Assessment
**Risk Level: LOW**. Methodical, quantitative verification providing conclusive proof of backward compatibility and corpus safety.

---

## Plan 03-06: Real-Node Leg on z2 & Findings §16 (Wave 6)

### 1. Summary
Plan 03-06 performs the real-node deployment and empirical verification on Ubuntu node `z2` (100.106.232.78) over Tailscale. It executes node registration through the one-time enrolment path, closes the enrolment window, proves closure via HTTP 401, runs Experiments 4–6 (disconnection/replay, duplicate submission, invalid auth), validates overflow eviction and counter monotonicity, records scoped SQL readbacks, and performs smoke-level co-tenancy checks against the live dev stack. The results are permanently committed to [`docs/investigations/ST-084-awcp-host-spike-findings.md:1180-1539`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1180-L1539) under section `## 16.`.

### 2. Strengths
- **In-process environment verification**: Caught a critical, silent failure mode where `.env` lacked a trailing newline, causing `AWCP_NODE_ENROLMENT_SECRET` to concatenate onto the preceding line, which bypassed `sed '/^AWCP_.../d'` deletion ([`ST-084-awcp-host-spike-findings.md:1229-1240`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1229-L1240)). Verifying inside the running container via `printenv | wc -c` caught the unclosed window.
- **Committed findings as the durable artifact**: Recognizing that database rows in Docker volumes will be wiped by test runs (specifically `workflow-mvp-e2e.test.ts`'s `DROP SCHEMA workflow CASCADE`), the plan captures transcripts and scoped SQL queries into committed documentation ([`ST-084-awcp-host-spike-findings.md:1350-1397`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1350-L1397)).
- **Transparent gap disclosure**: Honestly documents that `last_seen_at` in `workflow.execution_nodes` does not update upon event ingestion ([`ST-084-awcp-host-spike-findings.md:1401-1404`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1401-L1404)), and clarifies that repo-rescan is an adjacent U3 scope gap rather than an ADR-016 criterion-6 failure ([`ST-084-awcp-host-spike-findings.md:1418-1425`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1418-L1425)).
- **Pre-commit credential validation**: Mechanically scans the staged git diff with `grep -F -f /tmp/awcp-credentials.list` before committing, ensuring no bearer or secret strings were published to version control.

### 3. Concerns
- **Standing de-enrolment hazard** (`Severity: MEDIUM`): Running tests against the dev database URL (e.g. via native `./dev.sh` or local `deno test`) triggers `DROP SCHEMA IF EXISTS workflow CASCADE` in [`server/tests/workflow-mvp-e2e.test.ts:104, 601`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-mvp-e2e.test.ts#L104), destroying `execution_nodes` and locking out `z2` behind a 401 until the enrolment window is manually reopened.
- **`last_seen_at` timestamp stagnation** (`Severity: LOW`): `store.ingestRunEvents` ([`server/src/workflow/store.ts:807-829`](file:///home/cpeddle/projects/ai-memory/server/src/workflow/store.ts#L807-L829)) inserts into `run_events` without updating `last_seen_at` on the `execution_nodes` record. Only `upsertExecutionNode` ([`server/src/workflow/store.ts:705-710`](file:///home/cpeddle/projects/ai-memory/server/src/workflow/store.ts#L705-L710)) updates `last_seen_at`. As a result, active execution nodes appear stale in the nodes table unless they re-register.
- **Smoke-level co-tenancy proof** (`Severity: LOW`): The co-tenancy observation ([`ST-084-awcp-host-spike-findings.md:1452-1478`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1452-L1478)) consists of two sequential MCP calls (`search_thoughts` and `capture_thought`). While confirming baseline functionality alongside node rows, it does not evaluate performance under concurrent load.

### 4. Suggestions
- Update `store.ingestRunEvents` to asynchronously update `last_seen_at = now()` on `workflow.execution_nodes` during event batch ingestion.
- Refactor `workflow-mvp-e2e.test.ts` to operate in an isolated schema or enforce that tests requiring destructive schema teardown execute only against `db-test`.
- In Phase 4 (ADR-016 recommendation), explicitly factor in the smoke-level nature of the co-tenancy evidence when evaluating Candidate A vs Candidate C.

### 5. Risk Assessment
**Risk Level: LOW to MEDIUM**. The plan executed with high technical discipline, successfully capturing all necessary empirical evidence. The primary ongoing risk is operational: accidental execution of destructive tests against the dev database de-enrolling the node.

---

## Phase Requirements Traceability Matrix

| Requirement | Description | Discharging Plans & Verification Evidence | Status |
| :--- | :--- | :--- | :--- |
| **EVENT-01** | Duplicate `(node_id, client_seq)` produces no duplicate hub state and returns identical ack | [`workflow-node-client-hub-e2e.test.ts:200-284`](file:///home/cpeddle/projects/ai-memory/server/tests/workflow-node-client-hub-e2e.test.ts#L200-L284); Experiment 5 in [`ST-084-awcp-host-spike-findings.md:1289-1302`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1289-L1302) | ✅ **Discharged** |
| **EVENT-02** | Disconnected node retains bounded local events, replays oldest-first on reconnection | [`awcp-node-client.test.ts:404-457`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L404-L457); Experiment 4 in [`ST-084-awcp-host-spike-findings.md:1261-1288`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1261-L1288) | ✅ **Discharged** |
| **EVENT-03** | Spool entry removed only after hub acknowledgement | [`awcp-node-client.test.ts:488-577`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L488-L577); [`server/scripts/awcp-node-client.mjs:666-688`](file:///home/cpeddle/projects/ai-memory/server/scripts/awcp-node-client.mjs#L666-L688); Experiment 4 | ✅ **Discharged** |
| **EVENT-04** | Spool overflow drops oldest event and records visible counter | [`awcp-node-client.test.ts:224-336`](file:///home/cpeddle/projects/ai-memory/server/tests/awcp-node-client.test.ts#L224-L336); Overflow transcript in [`ST-084-awcp-host-spike-findings.md:1322-1339`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1322-L1339) | ✅ **Discharged** |
| **SAFE-01** | Existing authenticated MCP tools pass unmodified | [`03-REGRESSION-FINAL.txt:1-436`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-REGRESSION-FINAL.txt#L1-L436) (empty diff over 400 pre-Phase-3 tests); [`ST-084-awcp-host-spike-findings.md:1443-1447`](file:///home/cpeddle/projects/ai-memory/docs/investigations/ST-084-awcp-host-spike-findings.md#L1443-L1447) | ✅ **Discharged** |
| **SAFE-02** | Tests repeatable on test stack without mutating seeded search corpus | 33/33 total and active corpus rows verified before/after; 2 consecutive clean runs of new test suites ([`03-05-SUMMARY.md:56-74`](file:///home/cpeddle/projects/ai-memory/.planning/phases/03-node-client-reliable-delivery-regression-safety/03-05-SUMMARY.md#L56-L74)) | ✅ **Discharged** |

---

## Conclusion

The six implementation plans for Phase 3 constitute a cohesive, technically rigorous delivery. All design commitments (zero npm dependencies, atomic crash safety, sequence counter monotonicity, terminal auth states, and identity-based regression safety) are implemented correctly and verified by code and empirical test data. The findings documented in section `## 16.` provide a solid, evidenced foundation for Phase 4's ADR-016 host topology decision.

---

## Consensus Summary

Both lanes conclude the phase **achieves its goals** and that all six requirements
(EVENT-01..04, SAFE-01, SAFE-02) are discharged. They disagree sharply on **how much residual
risk that leaves**: `codex` rates the phase **MEDIUM** overall with one HIGH finding;
`antigravity` rates most plans **LOW** and the phase **LOW–MEDIUM**. That gap is itself the
most useful output of this review, and it is concentrated in the client's local persistence
layer.

### Agreed Strengths

Raised independently by both reviewers:

- **Identity-keyed regression baseline.** Recording `<file>::<test> => ok|FAILED` for all 400
  pre-phase tests, rather than totals, is what makes a removed or renamed test detectable.
- **Real-process test boundary.** The e2e suite drives the production client against a
  spawned hub over real HTTP and a real Postgres, not in-memory doubles.
- **EVENT-01 duplicate proof.** Same `client_seq` submitted twice, acknowledgements compared
  including `event_id`, scoped row count stays at one.
- **D-14 sequence durability.** `client_seq` lives in its own counter file and is never
  derived from the spool — closing the reset-to-zero mode where the hub's `ON CONFLICT DO
  NOTHING` would silently swallow later events.
- **Status-before-body parsing.** Checking `res.status` before `res.json()` is what keeps the
  hub's plain-text 401 from being misclassified as a transport error, which is what makes
  D-17 work at all.
- **D-15 partial rejection.** Dropping only the sequences named in a 400 prevents one
  oversized payload from blocking everything queued behind it.
- **Zero-progress acknowledgement guard.** A 200 whose ack list does not intersect the batch
  sent triggers bounded backoff instead of an infinite loop.
- **D-13 credential-leak gate.** Intercepts all output channels *and* scans disk state, with
  a transport error that deliberately carries the Authorization header.
- **Three-way drop visibility.** Overflow is observable in persisted state, structured
  stderr, and the `status` subcommand.
- **Honest gap disclosure.** Both reviewers specifically credit the findings document for
  recording what did *not* work (`last_seen_at` not advancing, repo-rescan not implemented)
  rather than omitting it.

### Agreed Concerns

Raised independently by both, though at different severities:

| Concern | codex | antigravity | Note |
|---|---|---|---|
| Multi-process safety of the spool / sequence counter | **HIGH** | LOW (suggestion: "consider `flock`") | Same mechanism, four severity steps apart — see Divergent Views |
| `FEATURE_WORKFLOW` left permanently on, expanding the dev surface | MEDIUM | LOW | codex faults the missing owner/deadline; agy faults the unauthenticated `/workflow` shell on `0.0.0.0` |
| Co-tenancy evidence is smoke-level only | MEDIUM | LOW | Both say it must not be read as a scaling result |
| Full-spool rewrite/parse is O(n) | LOW | LOW | Both call it fine at the 1,000-entry cap, and both say record it as a scaling limit |
| `last_seen_at` never advances on ingestion | noted as honest disclosure | LOW, with root cause | agy located it: `store.ingestRunEvents` doesn't touch it; only `upsertExecutionNode` does |

### Divergent Views

**These are the findings worth investigating, because one reviewer looked at the same code
and reached the opposite conclusion.**

1. **Crash durability — direct contradiction.** `antigravity` lists `writeSpool` as a
   *strength*: "crash-safe atomic file replacement… temporary file creation, synchronous
   write, OS flush, and POSIX `renameSync`", verified by an injected crash hook. `codex`
   calls the same code a MEDIUM defect: the temp file is fsynced but the **containing
   directory never is**, so the rename itself is not durable across power loss.
   **Adjudicated in codex's favour:** `grep -n "fsyncSync\|renameSync\|opendirSync"` over
   `server/scripts/awcp-node-client.mjs` returns no `opendirSync` at all, and every
   `fsyncSync` precedes its `renameSync` (321→333, 372→376). agy verified the atomic-rename
   property and stopped there; the missing directory sync is real. Note it applies to
   `writeState` as well, which neither reviewer mentioned.

2. **Concurrency severity — HIGH vs. a passing suggestion.** Both saw that nothing serialises
   access to `AWCP_HOME`. `codex` traces it to an unlocked read-increment-write in
   `allocateSeq` and rates it HIGH, additionally noting the "repeated allocation" test loops
   *sequentially in one process* and so does not test the property it appears to. agy raises
   it only as a conditional suggestion. codex's version is the falsifiable one and matches
   the code.

3. **Malformed responses.** `codex` MEDIUM: a 400 unconditionally calls `res.json()`, and a
   200 assumes `body.acknowledged.map` exists, so invalid JSON rejects `flush()` instead of
   returning a typed outcome. agy examined the same function and recorded only the
   status-before-body strength. Unreconciled — agy did not argue the case, it did not raise
   it.

4. **Shutdown semantics.** Both saw `runAgent` blocking in `sleepImpl`. `codex` MEDIUM:
   SIGINT/SIGTERM can wait a full ~60s heartbeat, and a graceful stop can exit 0 with the
   final checkpoint still spooled. agy LOW: "acceptable given the default 60s heartbeat
   cadence." A judgement difference, not a factual one — but note agy addressed only the
   latency, not the misleading exit code.

5. **Eviction/counter atomicity and stale planning state** were raised by `codex` only
   (`evictOldest` writes the spool before `recordDrops`; `.planning/STATE.md` still says
   `executing`). agy did not examine `.planning/` state.

6. **Findings `codex` missed entirely** — all three verified in this session:
   - **Standing de-enrolment hazard (agy, MEDIUM).** `workflow-mvp-e2e.test.ts` runs
     `DROP SCHEMA IF EXISTS workflow CASCADE` (lines **104** and **601**). Run against the
     dev database it destroys `execution_nodes` and locks `z2` out behind a 401 until the
     enrolment window is manually reopened. This is the most operationally consequential
     finding in the document and only one reviewer saw it.
   - **Fixed test port (agy, MEDIUM).** `const PORT = 3146` at
     `workflow-node-client-hub-e2e.test.ts:53` collides under parallel runners or an orphaned
     process.
   - **`last_seen_at` root cause (agy, LOW).** Only `upsertExecutionNode`
     (`store.ts:706`) sets it; `ingestRunEvents` does not — so a healthily-reporting node
     reads as stale.

---

## Findings verified against source in this session

The orchestrating session opened the cited lines for the eight findings below. Each was
confirmed present as described. This verifies the **mechanism**, not the severity.

| # | Sev | Reviewer | Finding | Verified at |
|---|---|---|---|---|
| 1 | HIGH | codex | `allocateSeq` is an unlocked read-increment-write; concurrent processes can allocate the same `client_seq` | `awcp-node-client.mjs:250` |
| 2 | MED | agy | `DROP SCHEMA IF EXISTS workflow CASCADE` de-enrols `z2` if run against the dev DB | `workflow-mvp-e2e.test.ts:104`, `:601` |
| 3 | MED | codex | No directory fsync after rename — crash-durability claim overstated | `awcp-node-client.mjs:318`, `:333`; no `opendirSync` in file |
| 4 | MED | codex | `evictOldest` writes the spool *before* `recordDrops`; a crash between loses events without the visible counter | `awcp-node-client.mjs:413` |
| 5 | MED | agy | Hardcoded test port | `workflow-node-client-hub-e2e.test.ts:53` |
| 6 | MED | codex | Stale phase state — `status: executing`, `Completed 03-05-PLAN.md` | `.planning/STATE.md:7`, `:31` |
| 7 | MED | codex | `FEATURE_WORKFLOW: "true"` hardcoded, no owner or deadline | `docker-compose.yml:58` |
| 8 | LOW | agy | `last_seen_at` set only by `upsertExecutionNode`, not by ingestion | `store.ts:706`; absent from `ingestRunEvents` |

Not re-verified here, recorded as stated: module-import side effects
(`process.emitWarning` replaced at evaluation, `:134`); malformed-response handling;
shutdown latency and exit-code semantics; the real-node "exactly one request" claim being
inferred rather than measured; the retained co-tenancy `capture_thought` row; and
`node_id: null` on a checkpoint emitted before registration.

### The limitation to carry into ADR-016

`codex` states it directly and `antigravity`'s `flock` suggestion implies the same boundary:

> reliable delivery was demonstrated under a single active client process, not concurrent
> local producers or every hard-crash boundary.

Findings 1, 3 and 4 are all instances of that one scope statement. If ADR-016 cites Phase 3
evidence, it should carry this qualifier rather than an unbounded "reliable delivery proven."
Both reviewers also independently say the co-tenancy observation must not be read as a
scaling result.

---

## Suggested disposition

Phase 3 is executed, verified (`03-VERIFICATION.md`), code-reviewed (`03-REVIEW.md`) and
merged. **Do not route this into `/gsd-plan-phase 3 --reviews`** — that replans shipped work.
The findings belong in three places:

- **Phase 4 input** — the ADR-016 scope qualifier; the smoke-level co-tenancy caveat; and the
  `FEATURE_WORKFLOW` persistence decision Phase 4 already owns.
- **Housekeeping, now** — finding 6 (`.planning/STATE.md`) and the stale `**Plans**: 5/6` /
  unchecked `03-06` line in `.planning/ROADMAP.md`.
- **A new ST-NNN — node-client hardening** — findings 1, 3, 4 (single-writer or cross-process
  safety, directory fsync, recoverable drop accounting), plus malformed-response handling and
  shutdown exit semantics.
- **A second new ST-NNN, or a `docs/solutions/` entry — test-suite operational safety** —
  findings 2 and 5. Finding 2 in particular is a foot-gun that will bite again: an ordinary
  local `deno test` against the dev database silently de-enrols the real node.
