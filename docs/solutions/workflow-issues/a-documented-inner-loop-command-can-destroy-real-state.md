---
title: A documented inner-loop command can destroy real operational state
date: 2026-08-20
category: workflow-issues
module: testing
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Writing or reviewing a test that runs DROP SCHEMA, DROP TABLE, TRUNCATE, or any DDL against a shared database"
  - "Adding a guard that is supposed to stop a test running somewhere dangerous"
  - "Running a single test file natively against the shared dev Postgres, as the WSL2 inner loop recommends"
  - "Deciding what property a safety check should key on — the environment, or the thing being protected"
related_components: [tooling, documentation]
tags: [destructive-tests, test-isolation, fail-closed, postgres, guard, dev-database]
---

# A documented inner-loop command can destroy real operational state

## Context

`server/tests/workflow-mvp-e2e.test.ts` reads `DATABASE_URL` from the environment and
runs `DROP SCHEMA IF EXISTS workflow CASCADE`. The `workflow` schema holds
`execution_nodes`, so dropping it de-enrols every registered remote execution node and
locks each one out behind a 401 until an operator reopens enrolment by hand.

The file already carried a careful header warning — but it was about *when* the file
may run relative to other suites (`deno test` runs files sequentially; do not add
`--parallel`). It said nothing about *which database* the file may run against.

CLAUDE.md documents a WSL2-native inner loop whose `.env.dev` points at the **shared
dev Postgres**, and recommends `deno test --frozen ... server/tests/<file>.ts` as the
fast path. Nothing in between the recommended command and the destroyed schema
produced an error, a prompt, or a warning. `server/tests/migrations.test.ts` has the
same shape: it drops `schema_migrations` and `recall_queries` against whatever
`DATABASE_URL` names.

A cross-AI review found the first file. The second was found by grepping for the
class rather than trusting the finding — which is the first lesson here.

## Guidance

**A destructive test must establish a property of the DATABASE it is connected to,
before it destroys anything — never a property of the environment it thinks it is in.**

A guard keyed on `CI`, `NODE_ENV`, a hostname, or a `DATABASE_URL` substring passes in
exactly the situation that matters, because the dangerous case *is* ordinary local
development. It looks like development because it is.

**Check what the name cannot tell you.** In this repo the obvious check is
non-discriminating and would have shipped as a guard that could never fire:

```bash
# both the shared dev database and the throwaway test database
docker compose exec db      psql -U ai_memory -d ai_memory -tAc "SELECT current_database();"  # ai_memory
docker compose exec db-test psql -U ai_memory -d ai_memory -tAc "SELECT current_database();"  # ai_memory
```

`docker-compose.yml` gives both services `POSTGRES_DB: ai_memory`. A name check would
have been green on both, and the guard would have read as enforcement while enforcing
nothing.

**Store the evidence outside what the test destroys.** The obvious design — a marker
table — is wrong here for a structural reason: the suites this guards drop *schemas*,
so evidence kept in one has a window in it. A database-level setting is stored in
`pg_db_role_setting`, keyed by database OID, and no `DROP SCHEMA` can reach it:

```sql
-- applied to the throwaway database only, by the compose `seed` service
ALTER DATABASE ai_memory SET ai_memory.test_database = 'true';
```

```sql
-- read by the guard; the `true` second argument returns NULL for an unset custom
-- parameter instead of raising, so an unmarked database answers rather than erroring
SELECT current_setting('ai_memory.test_database', true);
```

**Fail closed, and throw rather than skip.** Marker absent, marker not `true`, and the
probe itself throwing must all refuse. And the refusal must be a failure, not a skip: a
skip makes a run look green while the suite silently stops executing, and a skip that
quietly becomes universal is the fails-open mode that leaves nobody watching. Throwing
means a native full-suite run shows a real failure on the guarded files — which is the
correct report, because those files genuinely cannot run there.

**Prove the guard fires, and prove what it prevents.** Both halves are needed:

- Point the guarded suite at a real unmarked database — created on the **test**
  container, never the dev one — with something recognisable in it, and confirm the
  refusal leaves it intact.
- Remove the guard and run the same command against the same database, to see the
  damage actually happen. Without this the refusal test passes just as happily against
  a suite that was never destructive in the first place.

Worked example, from the run that introduced the guard:

```
before:                                    workflow.execution_nodes = 1 row
guarded run against the unmarked database: REFUSING TO RUN ... carries no marker
after:                                     workflow.execution_nodes = 1 row
same run, guard removed:                   workflow.execution_nodes = 0 rows
```

The final `0` rather than a missing-relation error is the shape of the real harm: the
suite's own `finally` re-creates the schema, so the tables come back **empty**. The
damage is silent by construction — nothing is missing afterwards except the rows, and
a node that was enrolled is now not.

## Why This Matters

The blast radius is not the test run. `execution_nodes` is enrolment state for real
machines: a dropped row means that node's bearer is no longer recognised, every event
it sends gets a 401, and its spool grows until an operator notices and re-enrols it by
hand with the one-time secret. The node keeps running and keeps failing quietly, which
is the failure mode the whole spool design exists to survive — inflicted by a test.

And the command that does it is one the project's own documentation recommends.

## When to Apply

- Any time a test issues DDL against a database it did not create
- When reviewing a "safe because we only run it in CI" claim — ask what makes that true
  at the moment the statement executes, not at the moment someone typed the command
- When adding a marker, flag, or sentinel that a check keys on: ask whether the
  operation being guarded can destroy the marker

## Related

- [Verification mechanisms need adversarial review](../conventions/verification-mechanisms-need-adversarial-review.md) — a guard that has never been observed refusing is indistinguishable from one that always passes.
- [Verify a worktree change against the Docker test stack](verify-worktree-change-against-docker-test-stack.md) — the other way a test command reaches something other than what you meant.
- [Verification expires when the verified surface changes](verification-expires-when-the-verified-surface-changes.md) — same family: a recorded result that no longer means what it appears to mean.

## One more, found while fixing this

`docker compose --profile test down -v` removes **every** volume in the project,
including `db_data` — the persistent dev database, which is not part of the test
profile at all. `.github/workflows/ci.yml` uses it as its teardown step, where it is
correct and harmless; on a developer machine it silently wipes dev data. Use
`docker compose --profile test stop` and `docker compose rm -f db-test seed mcp-test`
when the intent is to recycle only the test stack. `db-test` is on `tmpfs`, so it is
wiped by stopping the container regardless — the `-v` buys nothing for it and costs the
dev database.
