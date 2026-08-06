---
phase: 02-remote-node-identity-hub
plan: 02
subsystem: auth
tags: [deno, hono, postgres, timing-safe, idor, startup-validation, workflow]

requires:
  - phase: 02-remote-node-identity-hub
    provides: Plan 01's validateNodeBearer seam, store.nodeOwnsBearer, and the hub suite
provides:
  - Cross-node injection guard on every event write
  - MEMORY_API_KEY / node-bearer credential isolation, timing-safe
  - Per-event payload byte ceiling
  - Non-vacuous proof that no node credential gates server startup
affects: [03-node-client-reliable-delivery, 04-blocking-evidence-adr-016]

tech-stack:
  added: []
  patterns:
    - Paired negative+positive control for any "X never happens" assertion
    - Recording EnvReader — assert on what was consulted, not on a guessed name

key-files:
  created: []
  modified:
    - server/src/workflow/remoteNodeHub.ts
    - server/index.ts
    - server/tests/workflow-remote-node-hub.test.ts
    - server/tests/startup-validation.test.ts

key-decisions:
  - "Red-control status is claimed only where a guard is genuinely new. Missing/malformed header and batch-count ceiling were already implemented in Plan 01 and are labelled REGRESSION, not red."
  - "The isolation test drives a 64-lowercase-hex MEMORY_API_KEY so the request clears the format gate and only the isolation check can refuse it."
  - "Boot isolation is proven by recording every env name startup consults, not by probing for a node-bearer name that this design never introduces."
  - "404-on-unknown-node is kept per plan; the resulting existence oracle is acceptable only because node ids are unguessable v4 uuids, and the code comment now says so instead of overclaiming."

patterns-established:
  - "Any assertion of the form 'X never appears' needs a positive control proving the mechanism can report X at all, or it passes vacuously."
  - "timingSafeEqual needs an explicit length guard: it THROWS on mismatch, and a throw in an auth path becomes a 500 that discloses more than a 401."

requirements-completed: [NODE-03]

coverage:
  - id: D1
    description: "Missing, malformed, and platform-key credentials are refused with 401 on both node endpoints before any write"
    requirement: "NODE-03"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-03: a missing or malformed Authorization header is refused on both endpoints"
        status: pass
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-03: the platform operator key cannot authenticate the node surface"
        status: pass
    human_judgment: false
  - id: D2
    description: "A valid bearer for node A cannot write events attributed to node B (cross-node injection guard)"
    requirement: "NODE-03"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-03: node A's bearer cannot write events attributed to node B"
        status: pass
    human_judgment: false
  - id: D3
    description: "Over-limit batches and oversized payloads are refused 400 with no partial write"
    requirement: "NODE-03"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-03: over-limit batches and oversized payloads are refused with no partial write"
        status: pass
    human_judgment: false
  - id: D4
    description: "No node credential is consulted at startup; the workflow module cannot prevent boot"
    requirement: "NODE-03"
    verification:
      - kind: unit
        ref: "tests/startup-validation.test.ts#startup validation: no node credential is consulted at startup (ST-088 NODE-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing MCP and workflow suites pass unmodified (SAFE-01 regression)"
    verification:
      - kind: e2e
        ref: "deno test tests/ — 351 passed / 9 failed (documented provider-401 baseline)"
        status: pass
    human_judgment: true
    rationale: "The 9 failures need a human to confirm they remain the accepted provider-401 baseline rather than new breakage; the evidence is recorded below but the accept/reject call is the PO's."

duration: ~25min
completed: 2026-08-06
status: complete
---

# Phase 2 Plan 02: Security & Regression Expansion — Summary

## Accomplishments

- **Cross-node injection guard** — `store.nodeOwnsBearer` gates every event write; mismatch is 401 before any insert.
- **Credential isolation** — a bearer equal to `MEMORY_API_KEY` is refused, compared over fixed-length SHA-256 digests with `node:crypto` `timingSafeEqual`.
- **Payload byte ceiling** — 16 KiB per event, checked before the store call so a rejection leaves no partial write.
- **Boot isolation proven non-vacuously** — a recording `EnvReader` plus a positive control.

## Task Commits

| Task | Commit | What |
|---|---|---|
| 1 | `ebc7732` | Auth rejection, credential isolation, cross-node guard, payload ceiling |
| 2 | `4f5abdf` | Boot-isolation control + full regression gate |

## Red controls — proven, not asserted

Each new guard was neutered in turn and the suite re-run. **Exactly the three tests below failed and no others**; all 15 passed once the guards were restored.

| Control | Status | Why |
|---|---|---|
| Cross-node injection | **RED → GREEN** | New in this plan |
| MEMORY_API_KEY isolation | **RED → GREEN** | New in this plan |
| Payload byte ceiling | **RED → GREEN** | New in this plan |
| Missing/malformed header → 401 | regression | Plan 01 already implemented it |
| Batch count > 500 → 400 | regression | Plan 01 already set `.min(1).max(500)` |

Labelling the last two as red controls would have been false — they were green before this plan's production change, so no amount of running them proves this plan added anything.

## Deviations from Plan

1. **The boot-isolation control was rewritten.** As specified it asserted that "the node bearer env var name" never appears in `findMissingRequiredEnv`. No such env var exists in this design — the bearer arrives in the `Authorization` header; the env var belongs to the Phase-3 node. The assertion would have passed because its subject does not exist. Replaced with a recording `EnvReader` that asserts *nothing node-shaped was consulted at all*, plus a positive control proving the function still reports a genuinely missing `MEMORY_API_KEY`.

2. **`REQUIRED_ENV` does not exist.** The plan referred to it in four places. `startupValidation.ts:127-141` uses inline `if (!readEnv(...))` checks over exactly two names. The intent — keep node credentials out of startup — is discharged; the identifier was never real.

3. **Platform-auth independence reused rather than re-asserted.** `workflow-agent-key-e2e.test.ts` already boots a real server and drives `MEMORY_API_KEY` against `/api/workflow`. It passes unmodified, which is the stronger evidence; adding a weaker in-process echo of it would not have added information.

## Issues Encountered

**A background security review flagged the IDOR in `remoteNodeHub.ts` against commit `08fe889`.** The finding was correct and describes exactly the gap Plan 01 deliberately deferred; `ebc7732` closes it. Re-reading the handler in response surfaced a genuine problem with my own comment, now fixed: it claimed the 401-not-403 choice prevented node-existence disclosure, but the `findExecutionNode` branch above already answers 404 for an unknown id. The oracle is acceptable because node ids are unguessable v4 uuids — the comment now states that condition instead of overclaiming the guarantee.

## Verification

```
tests/workflow-remote-node-hub.test.ts                        15 passed / 0 failed
tests/startup-validation.test.ts                              15 passed / 0 failed
tests/workflow-boundary.test.ts                               green, unmodified logic
FULL SUITE  deno test tests/                                 351 passed / 9 failed
```

The 9 failures are the **documented provider-401 baseline** — `OpenRouter 401: Missing Authentication header` — in `e2e.test.ts` (8) and `entity-worker-observability.test.ts` (1). Both are memory-domain files, disjoint from every file this phase touched, and the same nine recorded against ST-086 and ST-087. Pass count rose from 336 to 351 with this phase's additions.

Run inside `mcp-test`, bind mount confirmed `/home/cpeddle/projects/ai-memory/server -> /app`. No `--parallel`.

## Next Phase Readiness

NODE-01, NODE-02, NODE-03 are discharged; Phase 2's four ROADMAP success criteria are met. Phase 3 (node client, spool/replay, experiments 4–6) can start.

**Carry forward to Phase 3:** the hub acknowledges replays rather than dropping them, so the client may treat "acked" as terminal for a spool entry regardless of whether the hub had seen it before. The `client_seq` uniqueness is per node, so the client owns its own counter with no coordination. Verify z2 reachability first, per the STATE.md blocker.
