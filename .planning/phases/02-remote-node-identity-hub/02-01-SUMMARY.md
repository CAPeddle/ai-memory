---
phase: 02-remote-node-identity-hub
plan: 01
subsystem: api
tags: [deno, hono, postgres, zod, sha-256, migrations, workflow]

requires:
  - phase: 01-policy-scope-pricing
    provides: ADR-016 enforcement pricing; the gate that let U2 proceed
provides:
  - workflow.execution_nodes and workflow.run_events (migrations 003/004)
  - node persistence functions in server/src/workflow/store.ts
  - POST /workflow/nodes/register — idempotent, concurrency-safe node identity
  - POST /workflow/nodes/:node_id/events — idempotent batch ingest with complete acks
affects: [03-node-client-reliable-delivery, 04-blocking-evidence-adr-016]

tech-stack:
  added: []
  patterns:
    - UPDATE-then-INSERT-ON-CONFLICT-DO-NOTHING upsert (avoids the boundary regex trap)
    - Acknowledgement re-derived by SELECT, never from INSERT output
    - Credential-scoped test isolation in place of scratch schemas

key-files:
  created:
    - server/db/workflow/003_execution_nodes.sql
    - server/db/workflow/004_run_events.sql
    - server/src/workflow/remoteNodeHub.ts
    - server/tests/workflow-remote-node-hub.test.ts
    - server/tests/workflow-node-hub-e2e.test.ts
  modified:
    - server/src/workflow/store.ts
    - server/index.ts
    - server/tests/workflow-migrations.test.ts
    - server/tests/workflow-mvp-e2e.test.ts
    - server/tests/workflow-boundary.test.ts

key-decisions:
  - "Task 1 checkpoint: OPTION A — deterministic single-column SHA-256 credential design. Option B (bcrypt) is not executable: deno.json pins a frozen lock without it, and salted bcrypt cannot answer the UNIQUE(bearer_token_hash) equality lookup the U2 identity contract rests on."
  - "Migration/shape assertions live in workflow-migrations.test.ts, not the hub suite — a missing-module RED failure takes the whole file down and would prove nothing about the schema."
  - "003/004 are verified by discovery + shape against the real workflow schema, NOT by applying them into a test_hub_* scratch schema, which cannot work."
  - "Node routes mount at /workflow/nodes, outside /api/workflow/*, so the operator/agent middleware can never authenticate a node surface."

patterns-established:
  - "Boundary-safe upsert: never write ON CONFLICT ... DO UPDATE SET in store.ts — the schema-qualification regex captures the token after UPDATE and reads SET as an unqualified identifier."
  - "Idempotent delivery: ON CONFLICT DO NOTHING on write, acknowledgement re-derived by SELECT so replays are acked rather than dropped."
  - "Optional-module credentials answer 401; they never throw or exit. auth.ts's throw-on-missing-env is correct for a required credential and wrong for an optional one."

requirements-completed: [NODE-01, NODE-02]

coverage:
  - id: D1
    description: "Migrations 003/004 create workflow.execution_nodes and workflow.run_events with UNIQUE(bearer_token_hash), UNIQUE(node_id, client_seq), the status CHECK, and a cascading FK"
    requirement: "NODE-01"
    verification:
      - kind: integration
        ref: "tests/workflow-migrations.test.ts#migrations: 003/004 create the remote-node tables with their documented constraints"
        status: pass
      - kind: integration
        ref: "tests/workflow-migrations.test.ts#migrations: the REAL workflow directory discovers 001 through 004 in order"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /workflow/nodes/register resolves a per-node bearer to one node_id — idempotent across restarts and safe under concurrent registration"
    requirement: "NODE-01"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-01a/NODE-01b/NODE-01c"
        status: pass
    human_judgment: false
  - id: D3
    description: "Only a SHA-256 digest is persisted; the raw bearer never reaches a column, a log line, or a response body, and a bearer outside ^[0-9a-f]{64}$ is refused with 401 before hashing"
    requirement: "NODE-01"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-01 security (both cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /workflow/nodes/:node_id/events persists node-attributed events, absorbs replays without duplicating, and acknowledges every submitted client_seq"
    requirement: "NODE-02"
    verification:
      - kind: integration
        ref: "tests/workflow-remote-node-hub.test.ts#NODE-02a/NODE-02b/NODE-02c"
        status: pass
    human_judgment: false
  - id: D5
    description: "Routes are actually mounted at /workflow/nodes by the composition root and reachable over HTTP, without disturbing platform auth or boot"
    requirement: "NODE-02"
    verification:
      - kind: e2e
        ref: "tests/workflow-node-hub-e2e.test.ts#ST-088: /workflow/nodes is mounted and bearer-guarded by the composition root"
        status: pass
      - kind: e2e
        ref: "tests/workflow-mvp-e2e.test.ts + tests/workflow-agent-key-e2e.test.ts (boot and platform auth unaffected)"
        status: pass
    human_judgment: false

duration: not measured
completed: 2026-08-06
status: complete
---

# Phase 2 Plan 01: Remote-Node Hub Tracer — Summary

## Accomplishments

- **Migrations 003/004** create `workflow.execution_nodes` and `workflow.run_events`, schema-qualified throughout and deliberately without `IF NOT EXISTS` (the ledger owns idempotency).
- **Node persistence in `store.ts`** — `upsertExecutionNode`, `findExecutionNode`, `nodeOwnsBearer`, `ingestRunEvents`, `acknowledgeSeqs`. All SQL stays in the one file allowed to hold the database handle.
- **`remoteNodeHub.ts`** exposes `createRemoteNodeHubRoutes()` and `validateNodeBearer`, importing only `./store.ts`, `./api.ts` and pinned npm specifiers.
- **Mounted in `index.ts`** at `/workflow/nodes`, inside `if (workflowFeatureEnabled())`.
- **11-test hub suite**, RED-first, verified red for exactly the intended cause before implementation.

## Task Commits

| Task | Commit | What |
|---|---|---|
| 1 | — | Checkpoint decision: **Option A** recorded, no code |
| 2 | `587b0cd` | RED hub suite + migrations 003/004 + migration-set fan-out |
| 3 | `08fe889` | GREEN tracer: store functions, route factory, index.ts mount |

## Decisions Made

**Task 1 — Option A (deterministic SHA-256), the only executable branch.** The canonical U2 text names bcrypt, but `server/deno.json` sets `"lock": {"frozen": true}` over only hono, `@hono/mcp`, `@modelcontextprotocol/sdk` and zod, and — more decisively — salted bcrypt is non-deterministic, so it cannot answer the `UNIQUE(bearer_token_hash)` equality lookup that the U2 idempotent-identity contract is built on. Option B would need a second deterministic fingerprint column: a schema change, not a hash swap. Recorded rather than silently assumed.

A fast digest is sound **here** because the bearer is a pre-provisioned 32-byte machine secret, not a human password. The route enforces the shape that keeps that true (`^[0-9a-f]{64}$`, rejected with 401 before hashing). That is a floor on encoded entropy, not proof of randomness — the randomness comes from the documented `openssl rand -hex 32`.

## Deviations from Plan

Three, all because the plan's named approach could not work as written:

1. **Migration assertions moved to `workflow-migrations.test.ts`.** The plan put them in the hub suite, but that suite's RED cause is a missing module, which takes the whole file down — schema assertions there would have proven nothing.

2. **No scratch-schema migration apply.** The plan (and `02-VALIDATION.md`) called for applying 003/004 into a unique `test_hub_*` schema. `applyMigrations`' `schemaName` governs only the `CREATE SCHEMA` and the ledger table while the migration DDL is hardcoded `workflow.`-qualified, so that form writes to the shared schema and — with no `IF NOT EXISTS` — dies on the second run against an accumulating `db-test`. Replaced with discovery + shape + ledger-skip. Hub-suite isolation comes from the credential instead: each test mints its own random bearer and deletes its node in `finally`.

3. **`workflow-boundary.test.ts` had to be edited.** `:341` and `:499` enumerate the workflow schema's tables exactly, so `execution_nodes` and `run_events` had to be added. This is the same fan-out class as the migration-set breakage, in a file the plan text protected. The pre-execution review missed it: it grepped for the `[1, 2]` version literal and migration filenames, not table-name lists. Both assertions remain exact and ordered.

## Issues Encountered

- **Import style.** First draft used bare `"hono"` / `"zod"`; the module convention (and the boundary allowlist's `isIntraModuleOrPackage`) requires fully pinned `npm:hono@4.9.2` specifiers. Caught by the boundary suite.
- **Table ordering.** `evidence_items` sorts before `execution_nodes`, and `run_events` before `schema_migrations`. First edit of the two table lists got both wrong; caught immediately by the same suite.

## Verification

```
tests/workflow-boundary.test.ts + workflow-remote-node-hub.test.ts
  + workflow-migrations.test.ts + workflow-store.test.ts   →  57 passed / 0 failed
tests/workflow-mvp-e2e.test.ts + workflow-agent-key-e2e.test.ts →  3 passed (12 steps) / 0 failed
tests/workflow-node-hub-e2e.test.ts                        →  1 passed (4 steps) / 0 failed
```

**Gap found and closed after the fact.** Every NODE-01/02/03 assertion drives
`createRemoteNodeHubRoutes()` in-process via `app.fetch`, which proves the route factory
and proves nothing about `index.ts` — delete the mount and all fifteen stay green. The
two e2e suites cited here boot real servers but never touch `/workflow/nodes/*`, so they
would pass identically with no mount at all; `deno check` proves it compiles, not that it
routes. Since B2 (the wrong mount anchor) was one of the three pre-execution blockers,
leaving the mount itself untested would have been the weakest point in the phase.
`tests/workflow-node-hub-e2e.test.ts` now drives the real HTTP boundary, and was verified
to go red with `app.route("/workflow/nodes", ...)` removed.

Its docblock records one thing it does **not** prove: both handlers call
`validateNodeBearer` themselves, so deleting the composition-root middleware changes no
observable behaviour and the 401 steps keep passing. The middleware is defence in depth
for future routes, not the load-bearing check.

Run inside `mcp-test`, bind mount confirmed as `/home/cpeddle/projects/ai-memory/server -> /app`. No `--parallel`.

## Next Phase Readiness

Plan 02 (Wave 2) can proceed. `nodeOwnsBearer` is in place for the cross-node guard; `validateNodeBearer` is the seam the MEMORY_API_KEY isolation check extends. Note for Plan 02: the format gate runs first, so a platform key that is not 64-lowercase-hex is rejected as malformed before the isolation comparison is ever reached.
