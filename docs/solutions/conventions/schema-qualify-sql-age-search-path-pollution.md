---
module: server
date: 2026-07-30
problem_type: convention
component: database
severity: high
title: "Always schema-qualify SQL: AGE leaves a sticky search_path on pooled connections"
tags:
  - postgres
  - apache-age
  - search-path
  - connection-pool
  - sql
  - schema
applies_when:
  - "Adding any new Postgres schema, table, view, or function to this repo"
  - "Writing SQL that runs through the shared postgres.js pool in server/src/db.ts"
  - "Writing a test that asserts on search_path or reuses a pooled connection after a graph query"
related_components:
  - server/src/db.ts
  - server/index.ts
  - server/src/entityWorker.ts
---

# Always schema-qualify SQL — AGE leaves a sticky `search_path` on pooled connections

## Context

Four sites in the memory domain issue a bare `SET search_path` inside a
multi-statement `sql.unsafe()` call, on a connection borrowed from the shared
`postgres.js` pool:

- `server/index.ts:941` and `server/index.ts:997` — the `graph_traverse` and
  `graph_search` MCP tools
- `server/src/entityWorker.ts:115` and `server/src/entityWorker.ts:125` — the
  entity worker's graph reads and writes

Each one looks like this:

```sql
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
SELECT * FROM cypher('memory_graph', $$ ... $$) AS t(result agtype);
```

A bare `SET` (as opposed to `SET LOCAL`) is **session-scoped**, and a pooled
connection's session outlives the query that ran on it. So any connection that has
served a graph query keeps `ag_catalog, "$user", public` as its `search_path` for
the rest of its life, and hands that state to whatever borrows it next.

The pool is created in `server/src/db.ts` with `max: 10` and no `search_path`
option, so there is no per-checkout reset to undo this.

This surfaced twice during the ST-084 workflow spike: once when placing a new
`workflow` schema (every statement had to be qualified for correctness, not
tidiness), and again when a test asserted pollution had occurred and was wrong
about why.

## Guidance

**Fully schema-qualify every object reference in SQL that runs through the shared
pool.** Write `workflow.work_packets`, not `work_packets`; `public.thoughts`, not
`thoughts`.

```ts
// Wrong — resolves against whatever search_path this pooled connection carries
await sql`SELECT count(*) FROM work_packets`;

// Right — deterministic regardless of connection state
await sql`SELECT count(*) FROM workflow.work_packets`;
```

This is why migrations `002`–`006` already qualify everything (`public.thoughts`,
`public.recall_queries`, `public.worker_runs`, `public.feedback_events`). It reads
like house style; it is actually a defence.

**Do not try to fix this globally with `ALTER DATABASE ... SET search_path` or a
`SET search_path` of your own.** A later bare `SET` on the same pooled connection
overrides it non-deterministically, so you would be adding a second source of
truth rather than removing one.

**If you need to assert on `search_path` in a test, reserve the connection.** On
the shared pool there is no guarantee the polluted connection is the one your next
query lands on:

```ts
const reserved = await sql.reserve();
try {
  await reserved.unsafe(`LOAD 'age'; SET search_path = ag_catalog, "$user", public; SELECT 1;`);
  const [{ search_path }] = await reserved<{ search_path: string }[]>`SHOW search_path`;
  // ... assert against `reserved`, not `sql`
} finally {
  await reserved.release();
}
```

## Why This Matters

The failure mode is **silent and non-deterministic**, which is the worst
combination. An unqualified `CREATE TABLE` or `SELECT` does not error — it
resolves against whichever schema happens to be first on that connection's path.
Whether you get the right object depends on whether the connection you were handed
previously served a graph query. The same code passes locally, passes in CI, and
then resolves differently in production once the entity worker has run.

It is also a **growing** trap. Every new schema added to this repo inherits it, and
nothing in the codebase warns you: there is no lint rule, no `search_path` reset on
checkout, and no test that would catch an unqualified reference. `docs/solutions/`
had no learning on it before this one despite four live sites.

## When to Apply

Any time you add a schema, table, view, or function, or write SQL that goes through
`server/src/db.ts`. It applies to migrations and to runtime queries equally.

The exception is code that deliberately runs Cypher against AGE — those four sites
*need* `ag_catalog` on the path. If you add a fifth, keep it in the same shape and
be aware you are extending the blast radius.

## Examples

A subtlety worth knowing, because a test in this repo got it wrong and asserted the
opposite. **A failed statement rolls its `SET` back; only a successful one
pollutes.** Verified directly against the PG15 + AGE container:

```
SET search_path = ag_catalog,...; SELECT 1/0;  ->  search_path = "$user", public   (rolled back)
SET search_path = ag_catalog,...; SELECT 1;    ->  search_path = ag_catalog, ...    (persists)
```

Postgres wraps a multi-statement simple-query in an implicit transaction, so an
error aborts the whole thing — `SET` included. The practical consequence for tests:
a test that triggers a *failing* graph query and then claims the connection is
polluted is exercising the one branch where the hazard cannot occur. To reproduce
real pollution you need the statement to **succeed**.

The paired assertion that makes a qualification test meaningful — prove the
qualified form resolves *and* the unqualified form fails, or the test proves
nothing:

```ts
// qualified: resolves even though `workflow` is not on the polluted path
await reserved`SELECT count(*) FROM workflow.work_packets`;

// unqualified: must fail, or the qualification was not what saved you
let failed = false;
try { await reserved.unsafe(`SELECT count(*) FROM work_packets`); } catch { failed = true; }
assert(failed, "unqualified resolved unexpectedly — the test proves nothing");
```

Live examples of both are in `server/tests/workflow-failure-isolation.test.ts`
(`experiment 3a` and `experiment 3b`).
