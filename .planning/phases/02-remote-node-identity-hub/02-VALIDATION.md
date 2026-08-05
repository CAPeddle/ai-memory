---
phase: 2
slug: remote-node-identity-hub
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for Remote Node Identity & Hub.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno built-in test runner + `@std/assert@0.224.0` |
| **Config file** | `server/deno.json` |
| **Quick run command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/workflow-remote-node-hub.test.ts` |
| **Wave run command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-run=deno tests/workflow-remote-node-hub.test.ts tests/workflow-migrations.test.ts tests/workflow-store.test.ts tests/workflow-mvp-e2e.test.ts` |
| **Full suite command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` |
| **Estimated runtime** | Quick: <30 seconds; wave: <2 minutes; full: several minutes |

## Sampling Rate

- **After every task commit:** Run the quick command.
- **After every plan wave:** Run the wave command.
- **Before `/gsd-verify-work`:** Run the full suite from the checkout mounted into `mcp-test`.
- **Max feedback latency:** 30 seconds for task-level checks.
- **Isolation rule:** Never pass `--parallel`; each new database test owns and drops a unique scratch schema.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | NODE-01, NODE-02 | T-02-04 | Schema-qualified tables and unique `(node_id, client_seq)` constraint migrate idempotently | integration | Quick command | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | NODE-01 | T-02-01, T-02-03 | Valid node credential registers/upserts one node; only a hash is persisted | integration | Quick command | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | NODE-02 | T-02-02, T-02-05 | Authorized node posts bounded events and receives complete acknowledgements, including duplicates | integration | Quick command | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | NODE-03 | T-02-02, T-02-06 | Missing, invalid, or cross-node credentials return 401 before writes | integration | Quick command | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | NODE-03 | T-02-07 | Workflow and platform MCP boot/auth remain independent of node credentials | regression | Wave command | Existing + W0 | ⬜ pending |

## Threat Register

| Ref | Threat | Severity | Required mitigation |
|-----|--------|----------|---------------------|
| T-02-01 | Raw bearer is persisted or logged | High | Persist only a digest; never log `Authorization` or returned registration secret |
| T-02-02 | One authenticated node injects events for another node | High | Bind credential verification to the path `node_id` before inserting any event |
| T-02-03 | Bearer comparison leaks timing information | Medium | Compare fixed-length digests with a timing-safe primitive |
| T-02-04 | AGE-modified `search_path` redirects unqualified SQL | High | Schema-qualify every workflow table and index |
| T-02-05 | Unbounded event batch or payload causes resource exhaustion | Medium | Zod limits on batch count, event type, sequence, and payload size |
| T-02-06 | Duplicate replay returns an error or incomplete acknowledgement | Medium | `ON CONFLICT DO NOTHING`; acknowledge every accepted or already-present sequence |
| T-02-07 | Optional node credentials become startup requirements | High | Keep them out of `startupValidation.ts` required variables and validate at request time |

## Red Controls

1. Registration with a wrong bearer must fail before registration auth is implemented.
2. A valid bearer paired with another node's `node_id` must fail before ownership binding is implemented.
3. Replaying an identical `(node_id, client_seq)` batch must fail before conflict handling is implemented.
4. Booting Workflow Operations without node credentials must remain green, proving optional-module isolation.
5. Removing the unique constraint must make the duplicate-row assertion fail.

## Wave 0 Requirements

- [ ] `server/tests/workflow-remote-node-hub.test.ts` — scratch-schema integration tests for NODE-01 through NODE-03.
- [ ] Test helpers apply `003_execution_nodes.sql` and `004_run_events.sql` into a unique `test_hub_*` schema and drop it in `finally`.
- [ ] Tests establish both positive controls and red controls for auth isolation, ownership binding, and duplicate acknowledgements.
- [ ] Existing infrastructure covers Deno, Zod, PostgreSQL, Hono request driving, and process-level workflow boot checks; no new test framework is needed.

## Manual-Only Verifications

None. All Phase 2 behaviors have automated verification. Real Ubuntu-node execution begins in Phase 3.

## Validation Sign-Off

- [ ] All tasks have automated verification or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing test reference.
- [ ] No watch-mode or `--parallel` flags.
- [ ] Feedback latency is below 30 seconds for task checks.
- [ ] `nyquist_compliant: true` set after `/gsd-validate-phase`.

**Approval:** pending
