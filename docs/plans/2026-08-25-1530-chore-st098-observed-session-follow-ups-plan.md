---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
story: ST-098
title: "ST-098 — ST-097 Follow-Ups: Session-Lane Fix, Store Split, Test Triage, Check Refresh - Plan"
date: "2026-08-25"
type: chore
---

# ST-098 — ST-097 Follow-Ups: Session-Lane Fix, Store Split, Test Triage, Check Refresh - Plan

## Goal Capsule

**Objective:** Close the four non-blocking findings ST-097's 12-reviewer code review left open. After this story: a node-client restart can no longer make an abandoned session read as permanently closed; `server/src/workflow/store.ts` no longer holds an unrelated 1,411-line mix of WorkItem and session persistence; the ~9 pre-existing `server/tests/e2e.test.ts` / `server/tests/entity-worker-observability.test.ts` failures have a known cause and a disposition; and the 28 manual dashboard checks invalidated by the WorkItem lane have a current, SHA-anchored result.

**Means:** Four independent units, each closing one ST-097 review finding — session restart-pinning removal (KTD1), a WorkItem persistence module split (KTD3), test-failure root-causing (KTD5), and browser-check re-verification (KTD6).

**Authority hierarchy:** This plan's Requirements and KTDs are the authority for ST-098. `server/src/workflow/types.ts:159-163`'s "no aggregate status" invariant and `server/src/workflow/observedSession.ts`'s "abandonment is evaluation policy, not stored here" design remain governing constraints from ST-097 — nothing in this plan revisits them.

**Stop conditions:** Stop and ask before: adding an aggregate status field to `observed_sessions`, writing a data migration for non-local (prod) rows (none are known to exist — see KTD7), or changing `server/src/workflow/attention.ts`.

**Execution profile:** Standard. Four independently landable units; U1 and U2 have no dependency on each other, U3 is fully independent, U4 depends on U1 and U2.

**Tail ownership:** `ce-work` or the executing agent owns commit boundaries per unit and the story-board update at close. No PR/ship step is prescribed here.

---

## Product Contract

### Summary

Fix an observed-session bug where a node-client restart under a pinned session id makes an abandoned session look permanently closed. Split WorkItem persistence out of `store.ts` into its own module. Root-cause and disposition the workflow module's ~9 pre-existing test failures. Re-verify the 28 manual dashboard checks a prior commit invalidated. No product-surface, API, or ADR change.

### Problem Frame

ST-097 merged to `main` at `af84b03` with its review clean but four findings deliberately left open as non-blocking. Two are correctness gaps in code this story's own session shipped: an absorbing-state bug in the observed-session lane, and a review-flagged 1,411-line file that mixes two unrelated persistence concerns behind one boundary-test gate. The other two are inherited debt this session's own verification could not close in-scope: pre-existing test failures unrelated to the workflow module, and a set of manual checks a later commit silently invalidated. Left alone, the absorbing-state bug hides real session abandonment behind a false "ended" label, and the oversized `store.ts` accumulates more debt with every future WorkItem change.

### Requirements

**Observed-session lane**

- R1. A node-client process (`server/scripts/awcp-node-client.mjs`) always mints a fresh `session_id` at `run` start. `AWCP_SESSION_ID` is no longer read anywhere in the client, and its restart-pinning affordance is removed from both code and docblocks.
- R2. The workflow dashboard (`server/src/workflow/dashboard.ts`) shows a claimed session's `last_heartbeat_at` alongside `ended_at`, not one or the other, so a session whose heartbeat is newer than its recorded close is visibly suspicious rather than indistinguishable from a genuine clean close.

**WorkItem persistence boundary**

- R3. WorkItem persistence (`createWorkItem`, `bindPacketToWorkItem`, `claimSessionForWorkItem`, `getWorkItem`, `listWorkItems`, `findWorkItemByProvenance`, `listPacketsForWorkItems`, `listClaimedSessionsForWorkItems`) moves out of `server/src/workflow/store.ts` into a new `server/src/workflow/workItemStore.ts`, with no behavior change to any of these functions.
- R4. `server/tests/workflow-boundary.test.ts`'s import-boundary invariant ("only `store.ts` and `schema.ts` may hold the database handle") is updated deliberately to include `workItemStore.ts`, not silently bypassed by threading the handle through a back door.

**Test-suite health**

- R5. Each of the ~9 pre-existing failures in `server/tests/e2e.test.ts` and `server/tests/entity-worker-observability.test.ts` is root-caused. A failure whose fix is small and isolated to its own test/module is fixed in this story; any other failure is recorded as a dated, commit-anchored baseline with its own follow-up story filed.

**Verification currency**

- R6. The 28 manual dashboard checks are re-run and their disposition recorded, anchored to the commit SHA and file pathspec they were verified against — never a date alone.

### Key Decisions

- **Drop session restart-pinning rather than add timestamp-based reopen.** (session-settled: user-directed — chosen over letting a later-timestamped observation reopen an `ended_at` row: simpler, and it leaves `store.ts`'s existing `GREATEST`-based monotone merge untouched.) Governs R1.
- **Show `last_heartbeat_at` next to `ended_at` in the dashboard.** (session-settled: user-directed — chosen over leaving the render as-is: R1 alone stops *new* poisoning, but any row poisoned before this fix lands stays indistinguishable from a real close unless the render itself carries enough data to judge.) Governs R2.

### Scope Boundaries

- Out of scope: `server/src/workflow/attention.ts`, `docs/design/adr/ADR-016-*.md`, `docs/design/adr/ADR-017-*.md`, any `/api/workflow` route or response-shape change, ST-094's route-derived authorization work (separate story).
- Out of scope: a data migration for already-poisoned `observed_sessions` rows. Workflow Operations is documented as a local-only MVP (`docs/workflow-mvp.md:1`) with no production deployment path, so the only affected rows are in a developer's own local `db`/`db-test` volume — see KTD7.
- Deferred to follow-up work: capturing "splitting a large TypeScript module along a domain boundary" as its own `docs/solutions/` convention entry once this story lands — no such learning exists yet in this repo, and this is the second time it will have come up (`observedSession.ts`, now `workItemStore.ts`).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Remove `AWCP_SESSION_ID` entirely from `server/scripts/awcp-node-client.mjs`**, rather than keeping it as a same-process override. (session-settled: user-directed — chosen over keeping the env var for single-process use: no code path uses it for anything except restart-pinning, and no test references it by name, so partial retention would keep dead surface area for no benefit.) Governs R1. Three sites change: the module docblock's "Env vars read" list (~line 47-48), the `resolveConfig` fallback `sessionId: overrides.sessionId ?? process.env.AWCP_SESSION_ID ?? null` (~line 418), and the `run` command's comment on pinning across restarts (~line 1841-1848).
- KTD2. **`server/src/workflow/dashboard.ts`'s session render shows both `ended_at` and `last_heartbeat_at`** wherever it currently shows one or the other (~`renderWorkItemSessions`, lines 474-491). Governs R2. No change to `claimSessionForWorkItem` — it still accepts a claim regardless of `ended_at`, per `observedSession.ts`'s "evaluation policy stays out of the store" design; only the render gains data.
- KTD3. **`workItemStore.ts` joins the boundary test's allowed-handle-holder set, mirroring `schema.ts`'s existing precedent, rather than importing the `sql` executor from `store.ts`.** Governs R3, R4. The alternative (having `workItemStore.ts` import `sql`/`SqlExecutor` from `./store.ts` instead of `../db.ts`) passes `server/tests/workflow-boundary.test.ts` unmodified, but only in letter: the test's own stated purpose — "only `store.ts` holds the database handle... route SQL through `store.ts`" — would be false in spirit while the test stays green. Editing the test's allowlist deliberately (as `schema.ts` already does, for its own documented reason) keeps the boundary test meaning what it says.
- KTD4. **All 9 call sites of the moved functions (`server/src/workflow/api.ts`, `server/src/workflow/readModel.ts`, and 7 test files) are renamed to `workItemStore.xxx(...)` in the same unit, with no `store.ts` re-export bridge.** No precedent for a barrel/re-export exists anywhere in `server/src/workflow/*.ts` today — every current consumer does a direct namespace import (`import * as store from "./store.ts"`). Introducing a bridge would be a first for this module and would leave `store.ts` calling into code it no longer contains, for no benefit once the rename lands in the same commit.
- KTD5. **Unit 3 starts with a fresh, isolated `docker compose --profile test up` run before any other diagnosis of the ~9 failures.** `db-test` is documented (CLAUDE.md, `.github/instructions/dev-environment.instructions.md`) as shared and accumulating across `exec` runs, wiped only on container stop — and `docs/solutions/test-failures/corpus-seed-consolidation-interference.md` records a structurally identical prior failure (a background worker racing test seed/assertion timing, live embeddings contaminating a deterministic baseline) in this same container. A fresh-container run is the cheapest possible discriminator between "environmental" and "regression" and must run first.
- KTD6. **Unit 4 is sequenced after U1 and U2**, and its re-verification record names the commit SHA it was run against plus an explicit pathspec covering `server/src/workflow/dashboard.ts`, `server/src/workflow/readModel.ts`, `server/src/workflow/store.ts`, and `server/src/workflow/workItemStore.ts`. `docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md` documents that this repo's prior 28-check record went stale exactly this way — verified against a date instead of a SHA, and phrased second-person ("re-run if *you* change X"), which structurally misses a change landing from someone else. This record is phrased third-person and file-anchored so it doesn't repeat that failure.
- KTD7. **No data migration is written for pre-fix poisoned `observed_sessions` rows.** Governs the "already-poisoned rows" concern under R1. Workflow Operations has no documented production deployment (`docs/workflow-mvp.md:1`); the only rows affected are in a developer's local Postgres volume. U1's verification notes a one-line local remedy (recreate the local `workflow` schema data, or `docker compose down -v` the dev stack) instead.

### Assumptions

- The `docker compose --profile test` stack (or the WSL2-native `./dev.sh` path against a scratch database) is available in the executing environment to run the fresh-container discriminator in U3 and the full suite in the Verification Contract below.
- No other repo, script, or CI job outside `server/` reads `AWCP_SESSION_ID` — confirmed by research (no match in `server/tests/`), but not exhaustively checked outside `server/`.

---

## Implementation Units

### U1. Fix the observed-session `ended_at` absorbing-state bug

**Goal:** A node-client restart can no longer make an abandoned session read as a permanent clean close; a claimed session's dashboard row carries enough data to tell a stale close from a real one.

**Requirements:** R1, R2 (KTD1, KTD2, KTD7)

**Dependencies:** None.

**Files:**
- `server/scripts/awcp-node-client.mjs` (remove `AWCP_SESSION_ID` read and its two docblocks)
- `server/src/workflow/dashboard.ts` (`renderWorkItemSessions`, ~lines 474-491)
- `server/tests/awcp-node-client.test.ts` (regression coverage for R1)
- `server/tests/workflow-observed-session-lane.test.ts` or `server/tests/workflow-work-item-dashboard.test.ts` (regression coverage for R2 — pick whichever already exercises `renderWorkItemSessions`)

**Approach:**
1. In `awcp-node-client.mjs`, delete the `process.env.AWCP_SESSION_ID` read in the config resolver and rewrite the module docblock and the `run` command's comment to state that a session id is always minted fresh — no mention of surviving a restart.
2. In `dashboard.ts`, change the session row render so `last_heartbeat_at` always renders, and `ended_at` renders alongside it (not instead of it) when set.
3. Confirm no other file in `server/` reads `AWCP_SESSION_ID` (already checked by research; re-confirm with a repo-wide grep before removing).

**Patterns to follow:** `foldSessionEvents`/the `LEAST`/`GREATEST` merge in `server/src/workflow/store.ts` (~lines 1142-1210, 1286-1318) is unchanged by this unit — R1 fixes the input (one session_id per process), not the merge.

**Test scenarios:**
- Happy path: a node-client process with no `AWCP_SESSION_ID` set mints a session id at `run` start; two separate invocations produce two distinct ids.
- Regression (the bug this unit fixes): simulate a clean close followed by a second process attempting to reuse the same session id — assert the client no longer offers a mechanism to do so (no env var read), so the two processes cannot collide under one row.
- Dashboard render: a session row with both `ended_at` and a `last_heartbeat_at` newer than it renders both values, not just `"ended"`.
- Dashboard render: a session row with only `last_heartbeat_at` set (never closed) renders as before.

**Verification:** `AWCP_SESSION_ID` no longer appears anywhere in `server/scripts/awcp-node-client.mjs`; the new/updated tests above pass; a manual local check confirms the dashboard shows both timestamps for a claimed, closed session.

---

### U2. Split WorkItem persistence into `workItemStore.ts`

**Goal:** `server/src/workflow/store.ts` no longer holds WorkItem persistence; the new module is a first-class, boundary-test-honored sibling with no behavior change.

**Requirements:** R3, R4 (KTD3, KTD4)

**Dependencies:** None.

**Files:**
- `server/src/workflow/store.ts` (remove lines ~47-323; export `sql`/`SqlExecutor` if `workItemStore.ts` needs to receive it, per KTD3's chosen shape)
- `server/src/workflow/workItemStore.ts` (new)
- `server/src/workflow/api.ts`, `server/src/workflow/readModel.ts` (update `store.xxx(...)` call sites to `workItemStore.xxx(...)`)
- `server/tests/workflow-boundary.test.ts` (add `workItemStore.ts` to the allowed-handle-holder assertion and the relevant allowlist)
- `server/tests/workflow-work-item-claim.test.ts`, `server/tests/workflow-work-item-dashboard.test.ts`, `server/tests/awcp-cli.test.ts`, `server/tests/workflow-work-item-routes.test.ts`, `server/tests/workflow-agent-key-e2e.test.ts`, `server/tests/workflow-work-item-read-model.test.ts`, `server/tests/workflow-work-item-dogfooding.test.ts` (update call sites)

**Approach:**
1. Move `createWorkItem`, `bindPacketToWorkItem`, `claimSessionForWorkItem`, `getWorkItem`, `listWorkItems`, `findWorkItemByProvenance`, `listPacketsForWorkItems`, `listClaimedSessionsForWorkItems` from `store.ts` into `workItemStore.ts`, unchanged.
2. Update `server/tests/workflow-boundary.test.ts` per KTD3: add `workItemStore.ts` to the set of files allowed to import `../db.ts` (mirroring the existing `schema.ts` entry), and to the `ALLOWED_IMPORTS` allowlist if it names `store.ts` specifically.
3. Rename every call site across `api.ts`, `readModel.ts`, and the 7 test files listed above from `store.xxx(...)` to `workItemStore.xxx(...)`, in the same commit as the move (KTD4 — no bridge).
4. Re-run `workflow-work-item-claim.test.ts` specifically and confirm it still exercises the same lock-contention path its docblock claims — the concurrency behavior was "measured, not reasoned" against this Postgres per `store.ts`'s own comment (~lines 150-161), so don't treat an unchanged statement as sufficient evidence on its own.

**Patterns to follow:** Naming (`workItemStore.ts` fits the existing camelCase convention alongside `readModel.ts`, `remoteNodeHub.ts`, `observedSession.ts`, `attention.ts`); `type SqlExecutor = typeof sql` (`store.ts` ~line 45) is the existing pattern for threading the executor as a parameter, already used by `ingestRunEventsTx`.

**Test scenarios:**
- No behavior change: every existing WorkItem persistence test (the 7 files listed above) passes unmodified except for the `store.` → `workItemStore.` rename.
- Boundary honored: `workflow-boundary.test.ts`'s handle-holder assertion passes with `workItemStore.ts` explicitly listed, not merely tolerated.
- Concurrency: `workflow-work-item-claim.test.ts`'s lock-contention scenario still passes post-extraction.

**Verification:** `deno test` (see Verification Contract) is green across the 7 updated test files plus `workflow-boundary.test.ts`; `store.ts`'s line count drops by roughly the size of the moved block; no remaining `store.createWorkItem`-style call sites exist outside `workItemStore.ts` itself (grep to confirm).

---

### U3. Root-cause the ~9 pre-existing test failures

**Goal:** Every one of the ~9 failures in `server/tests/e2e.test.ts` and `server/tests/entity-worker-observability.test.ts` has a known cause and a recorded disposition — fixed here, or filed as its own story with a dated baseline.

**Requirements:** R5 (KTD5)

**Dependencies:** None (fully independent of U1, U2, U4).

**Files:**
- `server/tests/e2e.test.ts`, `server/tests/entity-worker-observability.test.ts` (diagnosis; fixes only if small and isolated)
- Production file(s) the root cause points to — not knowable until diagnosis runs; record under deferred/implementation-time notes per Phase 3.6, do not guess here.
- `.github/planning/story-board.md` (record the disposition on ST-098's entry, or file a new story for any failure not fixed inline)

**Approach:**
1. Run the fresh-container discriminator first (KTD5): a clean `docker compose --profile test up` followed by one full test run, before any other diagnosis step.
2. For each of the ~9 failures, classify as environmental (background worker/consolidation timing, `db-test` pollution — see `docs/solutions/test-failures/corpus-seed-consolidation-interference.md`) or a real regression.
3. Fix inline only when the root cause is small and isolated to its own test/module; otherwise record the dated, SHA-anchored baseline and file a follow-up story.

**Execution note:** Start with the fresh-container run before any other diagnostic step — it is the cheapest discriminator between environmental pollution and a real regression, and skipping it risks spending this unit's effort chasing pollution a clean run would have ruled out immediately.

**Test scenarios:**
- Each of the ~9 failures reproduces (or does not) identically in a freshly-created `db-test` container versus the currently running one — this comparison is the unit's primary evidence, not a conventional pass/fail test.
- For any failure fixed inline: a test proves the fix (red before, green after), scoped to that failure only.

**Verification:** Every one of the ~9 failures has an explicit disposition recorded (fixed-in-this-unit, or filed-as-story-ST-NNN-with-baseline); the fresh-container comparison result is part of that record.

---

### U4. Re-verify the 28 manual dashboard checks

**Goal:** The 28 manual checks against the workflow dashboard have a current, commit-anchored result.

**Requirements:** R6 (KTD6)

**Dependencies:** U1, U2 (the checks must be run against the tree after both land, since both touch the surfaces the checks cover).

**Files:**
- `server/src/workflow/dashboard.ts` (surface under test; no expected code change from this unit)
- Wherever the 28 checks are currently documented (research did not pin this down exactly — likely `docs/workflow-mvp.md` or a prior plan's verification section; locate at execution time)
- `.github/planning/story-board.md` (record the new disposition)

**Approach:**
1. Locate the existing 28-check list.
2. Re-run each check against the post-U1/U2 tree, using the Docker dev stack (`mcp` on `:3000`) per the confirmed scope.
3. Record the result third-person and file-anchored: the commit SHA the checks were run against, and the pathspec (`server/src/workflow/dashboard.ts`, `readModel.ts`, `store.ts`, `workItemStore.ts`) whose future changes would expire this result — per KTD6, not a date-only or second-person record.

**Test expectation:** none — this unit is manual verification, not automated test coverage. Its output is the recorded disposition itself.

**Verification:** All 28 checks have a pass/fail/changed disposition; the record names a commit SHA and an explicit pathspec, matching the shape `docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md` prescribes.

---

## Verification Contract

- Full workflow-module suite: `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` — run after U1 and U2 land, and again after U3, to confirm no regression from either.
- Targeted single-file runs during development: `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read <path>` (add `--allow-write=/tmp --allow-run=deno,git` only for the files CLAUDE.md's test-command comment names as needing them).
- U3's discriminator: a fresh `docker compose --profile test up` (or equivalent container recreation) before its first diagnostic run.
- No CI signal is available for this branch until it reaches `main` (CI triggers only on `main` and PRs targeting `main`) — the local run above is the only gate.

---

## Definition of Done

- R1-R6 all satisfied per their unit's Verification field.
- Full workflow-module suite green (or red only for the same, now-explicitly-disposed, pre-existing failures from U3).
- ST-098's board entry (`.github/planning/story-board.md`) has each acceptance criterion checked and is moved out of In Progress.
- Any code path tried and abandoned during U2's split (e.g., an experimental re-export bridge, if one was tried before settling on KTD4) is removed, not left in the diff.
- U3 and U4's dispositions are recorded in the board entry, not left only in agent output.
