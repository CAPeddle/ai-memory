---
title: "spike: Validate ai-memory as the AWCP host (ST-084)"
type: spike
status: stage-1-complete
date: 2026-07-29
story: ST-084
---

# ST-084: Validate ai-memory as the AWCP Host

## Status

Proposed architecture spike.

This spike tests Candidate A from ADR-016. It does not assume that ai-memory is already the accepted AWCP host.

## Decision to be made

Determine whether AWCP can be implemented inside the ai-memory codebase and central deployment while remaining a separately modelled Workflow Operations product.

The spike must end with exactly one recommendation:

1. Accept ai-memory as the host.
2. Accept ai-memory with specified architectural changes.
3. Reject ai-memory as the host and recommend a clean umbrella application.

## Hypothesis

AWCP can reuse ai-memory’s runtime, database infrastructure, authentication, MCP plumbing, provenance, and optional retrieval capabilities without representing operational state as thoughts, shards, graph entities, or promoted memories.

A single central deployment can also supervise agent activity on a remote Ubuntu execution node through a lightweight authenticated client, without creating a second authoritative AWCP deployment.

## Fixed constraints

* Christopher is permanently the only human user.
* The system may contain both personal and professional information.
* A person may legitimately have both personal and professional observations.
* One central deployment owns authoritative agent-operational state.
* The remote Ubuntu server is an execution node, not another authoritative deployment.
* Operational records must remain usable when semantic memory capabilities are disabled.
* Corporate external writes are out of scope.
* No Jira, Confluence, or Azure DevOps mutation may be performed.
* Prism wiki content migration is out of scope.
* Prism lineage and drift mechanisms may be inspected for later extraction or reuse.
* The spike is disposable and must not silently become the production AWCP implementation.

## Architecture under test

```text
Central ai-memory deployment
│
├── Shared platform infrastructure
│   ├── database connection and migrations
│   ├── authentication
│   ├── provenance
│   ├── MCP/API infrastructure
│   └── optional retrieval and graph services
│
├── Workflow Operations product
│   ├── WorkPackets
│   ├── AgentRuns
│   ├── Checkpoints
│   ├── OperationalDecisions
│   ├── AttentionItems
│   ├── VerificationCriteria
│   └── Evidence
│
├── Memory adapter boundary
│   ├── KnowledgeSearchPort
│   └── KnowledgePromotionPort
│
└── Execution-node interface
    └── authenticated remote event protocol
            ↑
Remote Ubuntu client
├── session registration
├── heartbeat
├── checkpoint submission
├── repository-state summary
└── offline event spool
```

## Dependency rule

Workflow Operations may depend on generic runtime infrastructure and explicitly defined memory ports.

It must not depend directly on:

* the `thoughts` or shard representation;
* vector indexes;
* RRF or MMR implementation;
* Apache AGE queries;
* consolidation workers;
* wiki promotion logic;
* Contact Memory entities or services.

Memory and Contact products must not own or reconstruct authoritative Workflow Operations state.

## Provisional persistence model

Use the existing Postgres instance but create a logically separate `workflow` schema or equivalent migration boundary.

Minimum tables:

```text
workflow.work_packets
workflow.repository_bindings
workflow.agent_runs
workflow.checkpoints
workflow.operational_decisions
workflow.attention_items
workflow.verification_criteria
workflow.evidence_items
workflow.run_events
workflow.execution_nodes
```

Required invariants:

* No workflow table requires a memory shard to exist.
* No memory row is authoritative for an operational record.
* Knowledge projections reference operational records, not the reverse.
* Workflow migrations can be reasoned about and tested independently.
* Deleting an optional promoted memory item cannot damage operational history.

## Minimal vertical slice

### 1. Work packet

Create a WorkPacket containing:

* identifier;
* title;
* objective;
* scope;
* repository bindings;
* constraints;
* policy scope;
* status;
* one manual verification criterion.

### 2. Local run

Register a synthetic or real local Claude Code run against the packet.

Record:

* agent type;
* host;
* working directory;
* repository and branch;
* start time;
* run status.

### 3. Remote Ubuntu run

Install and start a lightweight execution-node client on the Ubuntu server.

The implementing agent may use SSH over Tailscale to install, configure, start, stop, and inspect this client.

The client shall:

* authenticate to the central deployment;
* register the execution node;
* report one AgentRun;
* submit a heartbeat;
* submit one checkpoint;
* report repository branch and commit;
* spool events locally while disconnected;
* replay spooled events idempotently after reconnection.

The product spike shall not implement a general-purpose remote shell.

Permitted control messages are narrowly typed, such as:

* request status;
* request checkpoint;
* request repository rescan;
* pause reporting;
* resume reporting.

### 4. Checkpoint

Record a structured checkpoint with:

* completed work;
* current state;
* blockers;
* next action;
* repository commit;
* timestamp.

### 5. Operational decision

Record a decision that blocks execution.

The decision shall be first-class operational state and shall cause a deterministic `decision-required` attention item.

### 6. Completion gate

Attempt to complete the WorkPacket before its verification criterion has evidence.

Completion must fail.

Attach manual evidence and repeat completion.

Completion must then succeed.

### 7. Optional memory projection

Promote one completed decision through `KnowledgePromotionPort`.

The promoted memory shall reference the WorkPacket and OperationalDecision identifiers.

Failure of promotion must not roll back or corrupt packet completion.

## Attention logic

Use deterministic rules only:

* `decision-required`: an unresolved blocking OperationalDecision exists;
* `blocked`: an explicit blocker exists;
* `stale`: no meaningful event within a configured threshold;
* `ended-without-checkpoint`: a run ended after its last checkpoint;
* `ready-for-review`: required evidence is present and the packet awaits review.

No LLM-based attention inference is permitted in this spike.

## Policy-scope model

Descriptive tags are not the policy boundary.

Add a controlled policy-scope value to source observations and operational records, initially supporting:

* `personal`;
* `corporate`;
* `mixed`;
* `public`.

A person or Contact may span scopes. Individual observations retain their own scope and provenance.

The spike must demonstrate:

* personal retrieval excludes corporate-only observations;
* corporate retrieval excludes personal-only observations when requested;
* mixed Contact identity remains shared;
* missing scope fails closed;
* provider routing can reject corporate content before an external model call;
* lexical search, vector search, graph traversal, context assembly, and exports cannot bypass the scope rule.

Where a capability cannot yet enforce scope, it must be disabled for that scoped request and documented in the findings.

## Memory-disabled mode

Run the complete vertical slice with the following unavailable:

* OpenRouter;
* embeddings;
* entity extraction;
* Apache AGE;
* hybrid semantic ranking;
* consolidation workers;
* knowledge promotion.

WorkPacket, AgentRun, Checkpoint, OperationalDecision, AttentionItem, Evidence and completion behaviour must remain operational.

## Failure-isolation experiments

Deliberately cause:

1. Knowledge search failure.
2. Knowledge promotion failure.
3. Graph service unavailability.
4. Remote-node disconnection.
5. Duplicate remote event delivery.
6. Invalid remote authentication.
7. Central service restart after event acknowledgement.

Expected outcomes:

* authoritative operational state remains consistent;
* failed optional operations are visible and retryable;
* remote events replay without duplication;
* invalid clients cannot submit events;
* no memory failure rolls back a workflow transaction.

## Tests proving the module boundary

Automated tests shall prove:

* WorkPackets are not stored as thoughts or shards.
* AgentRuns do not depend on memory tables.
* OperationalDecision is authoritative after memory projection.
* Deleting the projection leaves the operational decision intact.
* Workflow code accesses memory only through declared ports.
* A no-op memory adapter passes all core workflow tests.
* Workflow migrations do not modify memory-domain tables.
* Policy-scope enforcement applies to every enabled retrieval path.
* Remote replay is idempotent.
* A remote execution node cannot become an authoritative state store.

## Reuse assessment

The findings shall list every reused ai-memory capability and classify it as:

* directly reusable;
* reusable behind an adapter;
* reusable only after modification;
* unnecessary for AWCP;
* actively harmful coupling.

At minimum assess:

* Postgres connection and migration system;
* authentication;
* MCP transport;
* event or worker infrastructure;
* provenance fields;
* hybrid retrieval;
* graph storage;
* consolidation;
* existing context scoping;
* logging and diagnostics.

## Remote-server implementation evidence

The findings shall record:

* central host used for the spike;
* remote Ubuntu host role;
* Tailscale communication path;
* installation and startup commands;
* authentication mechanism;
* spool location and format;
* disconnection and replay result;
* any manual operator effort;
* any assumptions that would prevent deployment on a replacement machine.

Do not commit secrets, Tailscale credentials, machine-specific private information, or corporate content.

## Non-goals

The spike shall not implement:

* Jira, Confluence, or Azure DevOps writes;
* automatic one-pager decomposition;
* Prism content migration;
* full Prism lineage migration;
* production backup or disaster recovery;
* a complete web dashboard;
* a VS Code extension;
* full Claude Code hook coverage;
* Copilot lifecycle automation;
* arbitrary remote command execution;
* event sourcing;
* Developer Memory redesign;
* Contact Memory redesign;
* production deployment hardening.

## Deliverables

1. Board story `ST-084`.
2. This approved plan.
3. Provisional Workflow Operations module.
4. Provisional workflow persistence migration.
5. Minimal CLI or test harness.
6. Remote Ubuntu execution-node client.
7. Automated boundary and failure-isolation tests.
8. `docs/investigations/ST-084-awcp-host-spike-findings.md`.
9. Dependency diagram.
10. Recommended ADR-016 disposition.

## Acceptance gate

### Accept ai-memory as host only when

* Core operational behaviour works with memory disabled.
* Workflow data is independently persisted.
* Memory and graph failures do not corrupt workflow state.
* The remote Ubuntu node is managed through one central authority.
* Offline replay is reliable and idempotent.
* Policy scope prevents unintended cross-scope retrieval and provider use.
* Existing ai-memory infrastructure materially reduces work or risk.
* Module boundaries can be enforced by tests and dependency rules.
* A later extraction of the Workflow Operations module remains possible.

### Reject or redesign when

* WorkPackets must become generic thoughts or shards.
* Ordinary workflow queries require semantic retrieval or graph traversal.
* Memory workers are required for operational correctness.
* Workflow and memory transactions cannot fail independently.
* The remote node requires its own authoritative database.
* Policy scope depends only on user-generated descriptive tags.
* Most platform infrastructure remains mandatory but unused.
* A clean standalone operational application would be materially simpler.

## Decision report

The findings document shall end with:

```text
Recommendation:
- Accept ai-memory
- Accept with conditions
- Reject and use an umbrella application

Evidence:
- boundary tests passed/failed
- reused components
- unwanted coupling
- remote-node result
- policy-scope result
- estimated production migration
- unresolved risks
```

ADR-016 shall remain Proposed or Conditional until this report is reviewed by Christopher.

---

# Implementation Addendum (agent, 2026-07-30)

Everything above this line is the PO-supplied controlling specification, preserved
verbatim. Everything below is the engineering detail required before implementation,
derived from direct inspection of the codebase at `66ff8e4`.

## A. Execution staging (PO decision, 2026-07-30)

The supplied plan is ~3 sessions of work. The PO directed a **two-stage** execution
rather than spreading effort thinly across all seven acceptance criteria:

> "Do not spread implementation effort thinly across all seven criteria. The spike
> exists to produce reliable architectural evidence, not to maximise the number of
> partially demonstrated features."

**Stage 1 (this PR) — fully prove four criteria:**

1. **Operational independence** — WorkPacket, AgentRun, Checkpoint, OperationalDecision,
   AttentionItem, Evidence and completion gating all work with semantic memory disabled.
2. **Separate persistence and API boundary** — independent transactional persistence;
   operational entities are not thoughts/shards/graph records; memory reached only
   through explicit ports; a no-op adapter supports the complete operational flow.
3. **Failure isolation** — knowledge-search failure, knowledge-promotion failure, graph
   unavailability, and central-service restart cannot corrupt or roll back operational
   state; promotion is an optional projection.
4. **Reuse and coupling assessment** — the ten named components classified; actual
   dependencies introduced by the slice recorded.

**Stage 1 explicitly does NOT prove** (must be marked UNPROVEN in the findings):
policy-scope enforcement (criterion 5) and remote-node operation (criterion 6).
Stage 1 *defines* their contracts (§F, §G below) so Stage 2 does not start from
assumptions. Stage 1's recommendation vocabulary is deliberately weaker than the
final one: **promising / promising with concerns / unlikely to fit** — not
accept/reject. ADR-016 stays Proposed/Conditional either way.

## B. Schema — reduced from ten tables to six

Per the PO: *"Use the smallest schema and module structure necessary… Do not create
unused tables merely because they appeared in the provisional model."*

| Provisional table | Stage 1 disposition |
|---|---|
| `workflow.work_packets` | **Built** |
| `workflow.agent_runs` | **Built** |
| `workflow.checkpoints` | **Built** |
| `workflow.operational_decisions` | **Built** |
| `workflow.verification_criteria` | **Built** |
| `workflow.evidence_items` | **Built** |
| `workflow.repository_bindings` | **Dropped** — inlined as columns on `work_packets`/`agent_runs`. A join table for a 1:1 field is unused structure. |
| `workflow.attention_items` | **Dropped as a table** — attention is *derived*, not stored. Computed by a pure function (`attention.ts`) over current state. A stored table can drift from the state it describes; a pure function cannot, and it makes "deterministic rules only, no LLM" checkable by reading ~40 lines. |
| `workflow.run_events` | **Deferred to Stage 2** — exists only to serve remote spool/replay. |
| `workflow.execution_nodes` | **Deferred to Stage 2** — same. |

`policy_scope` ships as a **column** in Stage 1 (`NOT NULL`, `CHECK (policy_scope IN
('personal','corporate','mixed','public'))`, **no DEFAULT**) — the model is defined,
enforcement is Stage 2. No DEFAULT is deliberate: see §F.

## C. Migration approach — exact

- **File:** `server/db/007_workflow_schema.sql`. `007` is the next free number
  (`006_tags_replace_profile.sql` is highest).
- **No change needed to `migrate.ts`** — its discovery regex `/^(\d+)_.*\.sql$/`
  (`migrate.ts:92`) is generic, and `detectBootstrapVersions` (`migrate.ts:108-197`)
  probes only versions 1–6, so it will never mis-mark 007 as pre-applied.
- **Do NOT touch `schema.sql`** and do NOT add the file to
  `docker/postgres-age/Dockerfile`. Post-ST-042 convention is runner-only; only
  `002` is still copied into initdb, for stated historical reasons.
- **Every object must be schema-qualified `workflow.*`.** This is a correctness
  requirement, not style: four sites issue `SET search_path = ag_catalog, "$user",
  public` inside a bare multi-statement `sql.unsafe` on a *pooled* connection
  (`index.ts:940-942`, `index.ts:996-998`, `entityWorker.ts:113-119`, `:123-130`).
  That `SET` is session-scoped and sticky, so any pooled connection that has served
  a graph query keeps a polluted path for its lifetime. `workflow` is never implicitly
  on the path. Do not attempt to fix this with `ALTER DATABASE … SET search_path`.
- **Migration failure is fatal to the whole server** — `migrate.ts:56` calls
  `Deno.exit(1)`, and `runMigrations()` is awaited at `index.ts:46` *before*
  `Deno.serve`. A malformed `007` bricks the memory MCP, not just the spike. Roll
  back is clean (DDL is transactional, `migrate.ts:51-53`) but the process dies.
- **Honesty about what a schema buys:** namespacing and clean teardown
  (`DROP SCHEMA workflow CASCADE`), **not** access control. The single `ai_memory`
  role reads and writes both schemas freely. Real enforcement needs a second role
  plus `REVOKE` — out of scope, and must be stated as such in the findings.

## D. Module layout — exact

First subdirectory under `server/src/` (currently 17 flat files). Justified by the
separability requirement, not by existing convention — flagged as a departure.

```
server/src/workflow/types.ts       domain types; zod raw shapes
server/src/workflow/store.ts       ALL SQL; the only file importing { sql } from "../db.ts"
server/src/workflow/attention.ts   deterministic attention rules (pure)
server/src/workflow/ports.ts       KnowledgeSearchPort / KnowledgePromotionPort + no-op adapter
server/src/workflow/service.ts     orchestration: completion gate, optional promotion
server/db/007_workflow_schema.sql  DDL
server/tests/workflow-*.test.ts    flat, per repo convention
```

## E. Dependency rules — mechanically checkable

Workflow may import: `../db.ts` (store.ts only), `../logging.ts`, npm packages
already in the frozen lock. Workflow must **not** import `entityWorker.ts`,
`consolidationWorker.ts`, `consolidationLLM.ts`, `embeddings.ts`,
`embeddingBackfill.ts`, `searchQuality.ts`, or `parseContext.ts`, and must not
reference `thoughts`, `entity_mentions`, `memory_graph`, `cypher(`, or `vector(`
in SQL. **A test asserts this by scanning the module's own source** — the rule is
enforced, not documented.

**Zero new dependencies.** `deno.json:2-5` sets `"lock": { "frozen": true }` and every
test command passes `--frozen`; a new npm import reds the entire suite.

## F. Policy-scope model — DEFINED for Stage 2, not enforced in Stage 1

Direct inspection produced the single most consequential finding of the inspection
phase, and it reshapes what Stage 2 can promise:

**`scope.tags` is enforced in exactly zero retrieval paths.** It is read at one
place (`index.ts:443`) and used only to INSERT. It appears in no WHERE clause
anywhere in the codebase. The honest count of what Stage 2 faces:

- **15 read paths** would each need an independent predicate — there is no query
  builder, no repository layer, no row-level security. Each is a hand-written tagged
  template that can be forgotten individually.
- **`fetch` (`index.ts:211-215`) is a one-call bypass** of every search-lane filter:
  `WHERE id = ${id} AND active = true`, and the tool accepts no `context` parameter
  at all. Search returns ids under one scope; fetch retrieves them under any. Fixing
  the lanes without fixing `fetch` is theatre.
- **`graph_traverse` / `graph_search` cannot be filtered.** AGE nodes carry only
  `(label, name)` with no scope column and no in-graph join to `thoughts`. The fix is
  extraction-time filtering (`entityWorker.ts:185`) or gating the tool — not a WHERE
  clause.
- **Global content-fingerprint dedup** (`schema.sql:45-48`) means the same text
  cannot exist at two scopes, and `capture_thought`'s `ON CONFLICT` *merges* tags
  (`index.ts:482-487`). A merge rule applied to a security column is a widening rule.
- `project` is a **×1.2 ranking boost**, not a filter, unless `strict` is set
  (`index.ts:344-353`) — and bare `strict` with no `project:` token is a complete
  no-op (`index.ts:271`). Neither idiom may be copied for a security column.

**Consequence for the plan's criterion-5 wording.** The supplied plan asks the spike
to demonstrate that "lexical search, vector search, graph traversal, context assembly,
and exports cannot bypass the scope rule." On the *memory* side that is currently false
in 15 places and structurally unfixable in two. Closing it is ST-082's job and is larger
than this spike. Stage 2 will therefore prove the narrower, decisive claim — which is
the plan's own escape clause, invoked deliberately rather than discovered late:

> the workflow module's own records and retrieval paths enforce policy scope with
> default-deny, and every memory path that cannot enforce scope is **disabled for a
> scoped request** and documented.

**Stage 1 does not change any memory-side retrieval semantics.** A disposable spike
must not quietly alter production read paths.

## G. Remote execution-node protocol — DEFINED for Stage 2, not implemented

Recorded now so Stage 2 does not begin from assumptions.

- **Transport:** HTTPS to the central hub over Tailscale. Node → hub only; the hub
  never dials the node. No inbound port on the node, and no general-purpose remote
  shell — a hard constraint from the supplied plan.
- **Runtime:** the node has `node` v-installed and **no deno** (verified on z2,
  Ubuntu 24.04.4). The client is therefore plain Node with zero npm dependencies, or
  a POSIX shell + `curl`. It must not require installing a new runtime.
- **Auth:** a per-node bearer token, distinct from `MEMORY_API_KEY`, in its own env
  var, validated by its own function alongside (not replacing) `requireApiKey`.
  `requireApiKey` is a plain `(req) => Response | null` invoked manually at
  `index.ts:1073-1077`, not middleware — so a second credential type composes cleanly
  without touching `/mcp`. It must **not** be added to `startupValidation.ts`'s
  `REQUIRED_ENV` (that list hard-exits on absence; an optional module must not).
- **Idempotency:** every event carries `(node_id, client_seq)`, unique-constrained.
  Replay is `ON CONFLICT DO NOTHING`. The hub's acknowledgement is the node's cue to
  drop its spool entry — never the send itself.
- **Spool:** append-only JSONL under the node's state dir, one event per line,
  fsynced. Replayed oldest-first on reconnect. Bounded size with oldest-dropped +
  a recorded counter, so a long outage cannot fill the disk silently.
- **Control messages** (narrowly typed, allow-listed): request-status,
  request-checkpoint, request-repo-rescan, pause-reporting, resume-reporting.

## H. Memory-disabled mode — verified recipe

Env-only; **no code change required**:

```
FEATURE_ENTITY_WORKER=false          # entity extraction AND all AGE writes
FEATURE_CONSOLIDATION_WORKER=false   # consolidation + knowledge promotion
FEATURE_EMBEDDING_BACKFILL=false     # backfill sweep
OPENROUTER_API_KEY=disabled          # placeholder; validated for truthiness only
```

Findings worth recording in their own right:

- `startupValidation.ts:1` hard-requires `OPENROUTER_API_KEY` and `Deno.exit(1)`s
  without it — but validates **truthiness only**, never against the provider. A
  placeholder satisfies it. So memory-disabled boot works *by accident of weak
  validation*, not by design. There is **no first-class degraded/disabled mode** in
  this codebase.
- Prefer the `FEATURE_*` flags over `*_DISABLED`: only `FEATURE_*` makes
  `/ready`'s worker probe report `n/a` rather than continuing to expect runs
  (`healthCheck.ts:146-149`).
- `/health` is a **static literal** (`index.ts:1055`) — the Docker healthcheck cannot
  fail due to disabled capabilities, so the container stays up. `/ready` returns 200
  `degraded`; only a Postgres error yields `unhealthy`.
- AGE and pgvector **cannot be removed** from the image (initdb would abort and the
  DB would never become healthy). Disable *use*, not *presence*.

## I. Test commands

```bash
# Bring up the isolated test stack (ephemeral tmpfs DB on :5433, seeded)
docker compose --profile test up -d

# Workflow slice
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/workflow-store.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/workflow-boundary.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/workflow-failure-isolation.test.ts

# Regression: the migration suite is the one most likely to break (see below)
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/migrations.test.ts

# Full suite
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
```

**Do not run migration tests natively** — native `deno test` targets the shared *dev*
Postgres and `migrations.test.ts` does `DROP TABLE schema_migrations`.

**Known breakage to fix as part of this work:** `migrations.test.ts` hardcodes the
migration version list in four places — lines **17**, **18-25**, **31**, **97** — all
asserting `[1,2,3,4,5,6]`. Adding `007` reds the suite until each is updated. Line 90
(`[1,2,4,5]`) is unaffected: it calls `detectBootstrapVersions`, which never probes v7.

## J. Rollback and cleanup

The spike is disposable by construction. Full teardown:

```sql
DROP SCHEMA workflow CASCADE;
DELETE FROM schema_migrations WHERE version = 7;
```

Code teardown — delete `server/src/workflow/`, `server/db/007_workflow_schema.sql`,
and `server/tests/workflow-*.test.ts`; revert the four `migrations.test.ts` version
assertions. **No other file is modified in Stage 1.** That list *is* the separability
proof for criterion 4, and it is deliberately short enough to state in one sentence.

If MCP tools are registered (optional for Stage 1), two further out-of-module edits
become necessary and must be recorded as coupling evidence: the hand-maintained
`toolNames` array at `index.ts:101-113`, and `mcp-protocol-compat.test.ts:172-179`,
which regex-scans `server/index.ts` alone for `server.registerTool(` and asserts a
two-way match against `tools/list`.
