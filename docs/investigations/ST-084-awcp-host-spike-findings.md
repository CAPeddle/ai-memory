---
name: "ST-084 Spike Findings (Stage 1): Validate ai-memory as the AWCP host"
asset_type: "investigation"
status: "stage-1-complete"
story: "ST-084"
created: "2026-07-30"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/ST-084-awcp-host-spike-findings.md"
---

# ST-084 Spike Findings — Stage 1

**Story:** ST-084 — Architecture spike: validate ai-memory as the AWCP host (ADR-016 acceptance gate)
**Date:** 2026-07-30
**Branch:** `claude/st-084-awcp-host-spike`
**Status:** **Stage 1 complete. Criteria 5, 6 and 7 are UNPROVEN and out of Stage 1 scope.**
**Plan:** [`docs/plans/2026-07-29-001-awcp-ai-memory-host-spike.md`](../plans/2026-07-29-001-awcp-ai-memory-host-spike.md)

---

## Read This When

Deciding whether ADR-016's Candidate A (extend ai-memory as the AWCP host) survives
contact with the actual codebase; or before starting Stage 2, which inherits the
contracts defined in §7.

---

## Preliminary recommendation

> **PROMISING WITH CONCERNS.**

Stage 1's four criteria all pass on evidence, not narrative. Workflow Operations
demonstrably runs as a separate operational domain inside this codebase, with its
own transactional persistence, its own failure boundary, and no dependency on any
semantic-memory capability. The architectural claim ADR-016 rests on is **supported
so far**.

The "with concerns" is not hedging — three specific findings (§6) would each require
an explicit decision before acceptance, and one of them (**§6.1, the policy-scope
enforcement surface**) is large enough that it could still change the host verdict at
Stage 2. This report does **not** accept Candidate A, and ADR-016 stays
Proposed/Conditional.

This uses the deliberately weaker Stage 1 vocabulary — *promising / promising with
concerns / unlikely to fit* — not the final accept/reject. The final recommendation
is a Stage 2 deliverable.

---

## 1. What was built

A disposable vertical slice under `server/src/workflow/` (6 files) plus workflow-owned
DDL in `server/db/workflow/` and four test files. The DDL deliberately sits **outside**
the shared migration chain: that runner `Deno.exit(1)`s the whole server on failure, so
a workflow migration living there would have made a workflow defect a platform outage.

| Slice item (plan §Minimal vertical slice) | Stage 1 status |
|---|---|
| 1. Work packet — identifier, title, objective, scope, repo binding, constraints, policy scope, status, verification criterion | **Built** |
| 2. Local run — agent type, host, working dir, repo, branch, start time, status | **Built** |
| 3. Remote Ubuntu run | **Stage 2** — protocol defined (§7.1), not implemented |
| 4. Checkpoint — completed work, current state, blockers, next action, commit, timestamp | **Built** |
| 5. Operational decision that blocks execution → deterministic `decision-required` | **Built** |
| 6. Completion gate — refuse without evidence, succeed with it | **Built** |
| 7. Optional memory projection through `KnowledgePromotionPort` | **Built** |
| 8. Deterministic attention (5 rules, no LLM) | **Built** |

**Schema reduced from ten tables to six**, per the PO's "smallest schema necessary"
direction. `repository_bindings` was inlined (it is 1:1 with the packet — a join
table for a single field is structure without a consumer). `attention_items` was
dropped **as a table** and attention made a derived pure function: a stored
projection can drift from the state it describes, a computed one cannot, and it
makes the "deterministic, no LLM" claim checkable by reading ~40 lines.
`run_events` and `execution_nodes` exist only to serve remote spool/replay and were
deferred rather than built unused.

---

## 2. Criterion 1 — Operational independence — **PASS**

*Requirement: WorkPacket, AgentRun, Checkpoint, OperationalDecision, AttentionItem,
Evidence and completion gating work with all semantic-memory capabilities disabled.*

The complete slice was executed in a process with every capability off and the
provider endpoint made unreachable:

```
FEATURE_ENTITY_WORKER=false
FEATURE_CONSOLIDATION_WORKER=false
FEATURE_EMBEDDING_BACKFILL=false
OPENROUTER_API_KEY=disabled
OPENROUTER_BASE_URL=http://127.0.0.1:9/blocked
```

**Result: 37 passed / 0 failed** (for the code as it stood at that run — see §13a Evidence limitations). Every operational behaviour — packet creation, run
registration, checkpointing, blocking decisions, deterministic attention, the
completion gate's refusal *and* its acceptance — works with no embeddings, no
entity extraction, no consolidation, no graph traversal and no reachable model
provider.

The server itself also boots and stays serviceable in that mode:

| Probe | Result |
|---|---|
| `/health` | **HTTP 200 `healthy`** — a static literal, so the Docker healthcheck cannot fail from disabled capabilities; the container stays up |
| `/ready` | HTTP 200 `degraded` |
| postgres / pgvector / age | `ok` |
| `embedding_api` | `error` (expected — endpoint unroutable) |
| `embedding_backlog`, `entity_worker`, `consolidation_worker` | `n/a — disabled` |

**Two caveats worth recording rather than burying:**

1. **Memory-disabled mode works by accident, not by design.** `startupValidation.ts:1`
   hard-requires `OPENROUTER_API_KEY` and `Deno.exit(1)`s without it — but validates
   *truthiness only*, never against the provider. The literal string `disabled`
   satisfies it. There is **no first-class degraded/disabled mode** in this codebase.
   It works, but nothing defends the property, and a future tightening of that
   validation would silently break it.
2. **Prefer the `FEATURE_*` flags over the `*_DISABLED` variants.** Only `FEATURE_*`
   makes `/ready`'s worker probe report `n/a`; the `*_DISABLED` form stops the worker
   while leaving the probe still expecting runs (`healthCheck.ts:146-149`), which
   reports `error` against a database carrying older `worker_runs` rows.

---

## 3. Criterion 2 — Separate persistence and API boundary — **PASS**

*Requirement: independent transactional persistence; operational entities are not
thoughts/shards/graph records; memory reached only through explicit ports; a no-op
adapter supports the complete flow.*

| Sub-claim | Evidence |
|---|---|
| Independent persistence | Dedicated Postgres schema `workflow`, DDL at `server/db/workflow/001_workflow_schema.sql`, applied by the workflow module's own `ensureWorkflowSchema()` — **not** by the shared boot chain (see §13a fix 7) |
| Migration touches no memory table | Test re-applies the DDL inside a rolled-back transaction and asserts the `public` table list is byte-identical before and after |
| Operational entities are not thoughts | Test creates a packet, then asserts zero `public.thoughts` rows contain its text |
| No structural dependency on memory | Test enumerates every foreign key in schema `workflow` and asserts all resolve within `workflow` |
| Memory reached only via ports | Test scans the module's own source and fails the build unless every import is on an **allowlist** (`./*` intra-module, `../db.ts`, `../logging.ts`, or a package specifier). A paired red/green control test proves the allowlist actually rejects `../entityWorker.ts`, `../index.ts` etc. — see the §3 correction |
| Only `store.ts`/`schema.ts` hold the DB handle | Source scan asserts no other workflow file imports `../db.ts` |
| No memory-domain SQL | Source scan rejects 14 forbidden identifiers (`thoughts`, `memory_graph`, `cypher(`, `vector(`, `embedding`, …) |
| All SQL schema-qualified | Source scan asserts every `FROM`/`INTO`/`UPDATE`/`JOIN` identifier starts `workflow.` |
| **No-op adapter supports the complete flow** | A full slice — run, checkpoint, decision, resolve+promote, criterion, evidence, completion — passes against `NoopMemoryAdapter` |

**The boundary is enforced, not documented.** That distinction is the point: a
dependency rule stated in a comment is a rule that gets violated in six months by
someone reasonably adding an import. These tests fail CI instead.

> **Correction (post-review) — the enforcement was weaker than this section claimed.**
> The original import check was a **blocklist** of eight memory modules. It omitted
> `../index.ts` — the composition root that registers every MCP tool — plus `auth.ts`,
> `healthCheck.ts`, `logging.ts`, `mcpDiagnostics.ts`, `migrate.ts` and
> `workerLogger.ts`. The workflow module could have imported straight from `index.ts`
> and this test would still have passed green. Structurally worse than the omission: a
> blocklist over a directory that grows permits every *future* memory module by default.
>
> Inverted to an allowlist, so an unlisted import now fails and adding a dependency is a
> deliberate edit to a reviewed list. The schema-qualification scan had the same class of
> hole — it was case-**sensitive**, so lowercase `from thoughts` was skipped silently;
> now case-insensitive with its own control test.
>
> The verdict does not change: manual inspection confirms the module never imported any
> of those files, so criterion 2 was genuinely met. What was defective was the
> **evidence**, and on a spike whose output *is* evidence that distinction is the whole
> point. Recorded rather than quietly fixed, because "our green tests certified a claim
> they could not actually check" is the most transferable finding in this report.

**One finding that strengthens the case unexpectedly:** every workflow statement had
to be schema-qualified anyway, for a reason unrelated to tidiness. Four sites in the
memory domain issue a bare `SET search_path = ag_catalog, "$user", public` inside a
multi-statement `sql.unsafe()` on a *pooled* connection (`index.ts:941`, `:997`;
`entityWorker.ts:115`, `:125`). That `SET` is session-scoped and sticky, so any pooled
connection that has served a graph query keeps a polluted path for its lifetime — a
live sharp edge in the shared runtime that any co-tenant module inherits.

> **Correction (post-review).** The first version of this section claimed the spike had
> proved this survivable because "experiment 3 deliberately runs workflow operations on
> a connection after a failed AGE query." That was **wrong, and the test was wrong with
> it**. A failed statement aborts its implicit transaction and rolls the `SET` back, so
> the failure path cannot pollute anything — the test exercised the one branch where the
> hazard is impossible while asserting the opposite. Verified directly against the
> PG15+AGE container:
>
> ```
> SET search_path = ag_catalog,...; SELECT 1/0;  ->  search_path = "$user", public   (rolled back)
> SET search_path = ag_catalog,...; SELECT 1;    ->  search_path = ag_catalog, ...    (persists)
> ```
>
> The claim is now genuinely proven, by a different test. `experiment 3b` reserves a
> connection, pollutes it via a *succeeding* statement, asserts the pollution persisted,
> then shows a qualified `workflow.work_packets` query resolves while an unqualified
> `work_packets` fails — so the qualification is demonstrably what defeats the hazard.
> `experiment 3a` pins the rollback behaviour that misled the original test, and `3c`
> keeps the honest isolation half. See §12.

---

## 4. Criterion 3 — Failure isolation — **PASS**

*Requirement: knowledge-search failure, knowledge-promotion failure, graph
unavailability and central-service restart cannot corrupt or roll back operational
state; promotion remains an optional projection.*

**Scope of this PASS, narrowed 2026-07-30.** Three of the requirement's four clauses
are proven outright: search failure, promotion failure, and graph unavailability. The
fourth — *central-service restart* — is proven only as far as **database rehydration**
(no operational state lives solely in memory). True restart behaviour, including cold
schema bootstrapping, composition-root wiring and pool reconnection, is **UNPROVEN**
and needs the writer and reader in separate processes. PR #34 review caught this as an
overclaim; the criterion still passes on the evidence gathered, but not on all four
clauses equally.

Four of the plan's seven experiments are in Stage 1 scope; experiments 4–6
(disconnection, duplicate delivery, invalid auth) are remote-node and therefore
Stage 2.

| # | Experiment | Result |
|---|---|---|
| 1 | Knowledge **search** failure | **PASS** — degrades to an empty result with `degraded: true` and a visible error; operational work proceeds to completion |
| 2 | Knowledge **promotion** failure | **PASS** — decision remains `resolved` and authoritative; `promoted_memory_ref` stays `NULL` (no dangling reference); failure returned as data, not thrown |
| 2b | Promotion failure vs. completion | **PASS** — packet still completes |
| 2c | Projection **deleted** after success | **PASS** — decision survives intact; "deleting an optional promoted memory item cannot damage operational history" holds |
| 3 | **Graph** unavailable | **PASS** — a deliberately failed AGE query on the pooled connection leaves the full slice working |
| 7 | Database **rehydration** (not restart) | **PASS, narrowed 2026-07-30** — all state rehydrates from the database alone; attention recomputes identically; the completion gate still refuses. Originally labelled "central-service restart"; PR #34 review correctly identified that as an overclaim. The same process, module instances, pool and pool config stay alive — only local variables are discarded — so schema bootstrapping, composition-root wiring and pool reconnection are untested. **Restart itself is UNPROVEN** and needs the writer and reader in separate processes. |
| — | Cross-domain transaction | **PASS** — a failing adapter cannot roll back a workflow transaction |

**The structural reason this passes**, rather than passing by luck: promotion runs
strictly *after* the operational write has committed, never inside its transaction
(`service.ts:resolveAndPromoteDecision`), and `promoted_memory_ref` is a nullable
pointer rather than a foreign key. Those two choices are what make memory failure
and memory *absence* equivalent from the operational side. Had promotion been
modelled as an FK or an in-transaction call, every one of these experiments would
fail — and that is precisely the coupling a naive implementation would introduce.

> **Correction (post-review) — the ordering was right, the error handling was not.**
> The original `resolveAndPromoteDecision` wrapped three operations in one `try`: the
> optional port call *and* two operational writes (`attachPromotionRef`, `getDecision`).
> So a projection that **succeeded** but whose reference failed to record reported
> `promoted: false` — and a caller retrying on that signal would create a **duplicate
> projection**, since `KnowledgePromotionPort` carries no dedup contract. That directly
> contradicted this section's claim that promotion failure is "visible and retryable."
>
> Fixed by narrowing the `try` to the port call alone and adding a `refLost` flag, so
> "never happened" (retry) and "happened, reference lost" (reconcile) are distinguishable.
> Two further defects in the same path: promotion **hardcoded `policyScope: "personal"`**
> for every packet regardless of its real scope — silently widening the security boundary
> §6.1 warns about, and invisible because every test used personal-scoped packets — and
> `resolveDecision` returned `undefined` typed as `OperationalDecision` for an unknown id,
> surfacing through that same catch as an opaque `TypeError` misattributed to promotion
> failure. `PromotionInput.policyScope` is now the closed `PolicyScope` union rather than
> `string`, making that class of widening a compile error.
>
> Criterion 3 still passes — no memory failure corrupts or rolls back operational state,
> which was and remains true. But three of these were found by independent review, not by
> the 37 passing tests, and one of them was a live security-boundary widening.

---

## 5. Criterion 4 — Reuse and coupling assessment

Classification of the ten components the plan names:

| Component | Classification | Evidence |
|---|---|---|
| **Postgres connection** (`src/db.ts`) | **Directly reusable** | 12-line `postgres.js` singleton; workflow uses the same pool and `sql.begin` transactions with no adaptation |
| **Migration system** (`src/migrate.ts`) | **NOT reused — deliberately bypassed** | *Corrected 2026-07-30 after PR #34 review.* This row previously read "Directly reusable", which described the **superseded** design that put the DDL in the shared chain. The final implementation moved it out: `ensureWorkflowSchema()` applies `db/workflow/001_workflow_schema.sql` itself, never touches `schema_migrations`, and has no version history, checksum, or upgrade path. Moving it out was the right call (§13a fix 7), but it is a **reduction in net reuse**, not an instance of it — the host argument must not count migrations. |
| **Authentication** (`src/auth.ts`) | **Reusable behind an adapter** | `requireApiKey` is a plain `(req) => Response \| null` invoked manually, not middleware, so a second credential type composes cleanly without touching `/mcp`. Not used in Stage 1. |
| **MCP transport** | **Reusable only after modification** | Not exercised in Stage 1. Registering tools outside `index.ts` requires two out-of-module edits — see §6.2 |
| **Worker/event infrastructure** | **Actively harmful coupling if reused** | `WorkerLogEvent.worker` is a closed union `"entity" \| "consolidation"` (`workerLogger.ts:4`) and `index.ts:638` hardcodes the same pair. Reusing it means widening a shared type *and* editing an unrelated tool. Workflow deliberately does not. |
| **Provenance fields** | **Reusable as a pattern, not as code** | The `created_at`/`updated_at`/soft-delete idiom transfers; no shared implementation exists to import |
| **Hybrid retrieval** (RRF/MMR) | **Unnecessary for AWCP** | Operational queries are keyed lookups and status filters. Ranking has no role in "which packets are blocked" |
| **Graph storage** (AGE) | **Unnecessary — and a live sharp edge** | Workflow issues no Cypher. But its `search_path` pollution is inherited by every co-tenant (§3) |
| **Consolidation** | **Unnecessary** | Promotion policy is memory-domain product logic; operational state is transactional, not recall-promoted |
| **Existing context scoping** (`parseContext`) | **Reusable only after modification** | Parses `tags` but enforces them nowhere (§6.1). Its `projects?.[0]` and `IS NULL OR` idioms are fail-open patterns a boundary column must not copy |
| **Logging/diagnostics** | **Reusable behind an adapter** | `withTiming`/structured-JSON house style transfers directly; the worker logger does not (above) |

**Actual dependencies the slice introduced:** exactly one runtime import outside the
module — `sql` from `../db.ts`, in `store.ts` alone. **Zero new npm dependencies**
(required: `deno.json` pins `lock.frozen: true`, so any new dependency reds the whole
suite).

**Net reuse verdict:** the reuse that materialises is *infrastructural* — connection
pooling, migrations, transactions, logging conventions, container/test topology. That
is real and non-trivial, and it is what "extend ai-memory" actually buys. The reuse
that ADR-016's Candidate A row implied might matter — hybrid search, graph, versioned
shards, tag grammar — is **unnecessary for AWCP** and correctly went unused. So the
host argument holds, but for narrower reasons than the ADR's framing suggests: the
value is a working Postgres/Deno/test substrate, not the memory engine.

---

## 6. Concerns — the three findings that qualify the recommendation

### 6.1 The policy-scope enforcement surface is far larger than ADR-016 assumes — **may change the verdict at Stage 2**

Direct inspection produced the single most consequential finding of this spike:

> **`scope.tags` is enforced in exactly zero retrieval paths.** It is read at one
> place (`index.ts:443`) and used only to INSERT. It appears in no `WHERE` clause
> anywhere in the codebase.

What Stage 2 actually faces on the memory side:

- **15 distinct read paths** would each need an independent predicate. There is no
  query builder, no repository layer, no row-level security — each is a hand-written
  tagged template that can be forgotten individually. Getting 14 of 15 right is the
  same as getting it wrong.
- **`fetch` is a one-call bypass** of every search-lane filter:
  `WHERE id = ${id} AND active = true` (`index.ts:211-215`), and the tool accepts no
  `context` parameter at all. Search returns ids under one scope; fetch retrieves them
  under any. Fixing the lanes without fixing `fetch` is theatre.
- **`graph_traverse` / `graph_search` cannot be filtered at all.** AGE nodes carry
  only `(label, name)` with no scope column and no in-graph join to `thoughts`. The
  remedy is extraction-time filtering or gating the tool — not a `WHERE` clause.
- **`entityWorker.ts:185` ships unscoped content to OpenRouter** — the primary egress
  path, and it predates any scope concept.
- **Global content-fingerprint dedup** (`schema.sql:45-48`) means the same text cannot
  exist at two scopes, and `capture_thought`'s `ON CONFLICT` *merges* tags
  (`index.ts:482-487`). A merge rule applied to a security column is a widening rule.
- **`project` is a ×1.2 ranking boost, not a filter**, unless `strict` is set — and
  bare `strict` with no `project:` token is a complete no-op (`index.ts:271`). Neither
  idiom may be copied for a boundary column.

**Why this bears on the host decision, not just on ST-082.** Candidate C (a clean
umbrella application) would carry *none* of this: a greenfield operational store has
no 15 legacy read paths, no unfilterable graph tool, and no fingerprint-dedup
interaction. Choosing ai-memory as host means the workflow product shares a database
with a corpus whose isolation controls do not yet exist, and inherits the obligation
to build them across a surface with no chokepoint. **Stage 1 cannot price that
obligation. Stage 2 must, before Candidate A is accepted.**

Stage 1 deliberately changed **no** memory-side retrieval semantics. A disposable
spike must not quietly alter production read paths.

### 6.2 A shared runtime has a shared blast radius

- **Migration failure is fatal to the whole server.** `migrate.ts:56` calls
  `Deno.exit(1)`, and `runMigrations()` is awaited at `index.ts:46` *before*
  `Deno.serve`. A malformed migration in the shared chain bricks the memory MCP.
  **This spike no longer pays that risk** — the workflow DDL was moved out of the
  shared chain (§13a fix 7), so a bad workflow migration cannot kill the server.
  The hazard remains real for anything that *does* live in the shared chain, which
  is why it stays recorded here as a property of the shared runtime.
- **`migrations.test.ts` hardcoded the migration version list in four places**
  (lines 17, 18-25, 31, 97), so adding *any* migration to the shared chain reds the
  suite until updated. The spike initially paid this tax and then stopped paying it:
  with the DDL relocated, `migrations.test.ts` was reverted to pristine and is now
  untouched by this spike. The co-tenancy tax is real but avoidable — by not joining
  the shared chain, which is itself the finding.
- **Registering MCP tools costs two out-of-module edits**: the hand-maintained
  `toolNames` array at `index.ts:101-113`, and `mcp-protocol-compat.test.ts:172-179`,
  which regex-scans `server/index.ts` *alone* for `server.registerTool(` and asserts a
  two-way match against `tools/list`. Stage 1 avoided this by not registering tools;
  Stage 2 or production would pay it.

### 6.3 A Postgres schema is namespacing, not access control

`CREATE SCHEMA workflow` buys clean teardown and a real migration boundary. It does
**not** buy isolation: the single `ai_memory` role reads and writes both schemas
freely. Genuine enforcement needs a second role plus `REVOKE`. Nothing in Stage 1
depends on the stronger claim, but the findings must not be read as implying it.

---

## 7. Stage 2 contracts — defined here so Stage 2 does not start from assumptions

### 7.1 Remote execution-node protocol

- **Transport:** HTTPS, node → hub only, over Tailscale. The hub never dials the node;
  no inbound port on the node; **no general-purpose remote shell** (hard constraint).
- **Runtime:** z2 verified as Ubuntu 24.04.4 with `node`, `python3`, `curl`,
  `systemctl` — and **no deno**. The client must therefore be plain Node with zero npm
  dependencies (or POSIX shell + `curl`) and must not require a new runtime.
- **Auth:** a per-node bearer token in its own env var, distinct from
  `MEMORY_API_KEY`, validated by its own function alongside — not replacing —
  `requireApiKey`. It must **not** be added to `startupValidation.ts`'s `REQUIRED_ENV`,
  which hard-exits on absence; an optional module must not be able to prevent boot.
- **Idempotency:** every event carries `(node_id, client_seq)` under a unique
  constraint; replay is `ON CONFLICT DO NOTHING`. The hub's **acknowledgement** — never
  the send — is the node's cue to drop a spool entry.
- **Spool:** append-only JSONL in the node's state dir, one event per line, fsynced,
  replayed oldest-first. Bounded with oldest-dropped plus a recorded counter, so a long
  outage cannot silently fill the disk.
- **Control messages** (allow-listed, narrowly typed): request-status,
  request-checkpoint, request-repo-rescan, pause-reporting, resume-reporting.
- **Tables** (deferred from Stage 1): `workflow.execution_nodes`, `workflow.run_events`.

### 7.2 Policy-scope model

- Controlled closed vocabulary — `personal | corporate | mixed | public` — **not**
  descriptive tags. Already shipped as a `CHECK`-constrained column and proven
  DB-enforced in Stage 1.
- `NOT NULL` with **no `DEFAULT`**, deliberately: a permissive default silently mints
  permissive rows wherever an INSERT forgets the column. Forgetting must fail loudly.
- **Default-deny**: absence of scope denies, never allows. Applies to retrieval *and*
  model-provider routing.
- Scope belongs to **observations and sources**, not to identities: a Contact may span
  personal and corporate contexts while each observation retains its own scope.
- **Paths requiring enforcement in Stage 2** (enumerated, from §6.1): 15 memory read
  paths; `fetch` first, as it defeats all others; both graph tools, which need
  extraction-time filtering or gating rather than a predicate; the entity-worker and
  consolidation LLM egress paths; embedding backfill; and the `recall_events` /
  `recall_queries` correlation artefacts, which carry raw query text and have no scope
  column.
- **Honest narrowing** (invoking the plan's own escape clause deliberately, rather
  than discovering it late): Stage 2 will prove that *the workflow module's own records
  and retrieval paths enforce scope with default-deny, and every memory path that
  cannot enforce it is disabled for a scoped request and documented*. Closing all 15
  memory-side paths is ST-082's job and is larger than this spike.

---

## 8. What is UNPROVEN

Stated plainly so this report cannot be over-read:

| Criterion | Status |
|---|---|
| 5 — Policy-scope enforcement | **UNPROVEN.** Model defined and DB-enforced as a column; no retrieval enforcement built or tested. §6.1 may change the host verdict. |
| 6 — Remote Ubuntu execution node | **UNPROVEN.** Protocol defined (§7.1); no client written, no registration/heartbeat/checkpoint/spool/replay exercised; experiments 4–6 not run. z2 reachability confirmed, nothing more. |
| 7 — Final migration and extraction viability | **UNPROVEN.** Stage 2 deliverable. |

Also not established: production deployment, backup/DR, dashboard, VS Code extension,
Copilot lifecycle automation, event sourcing, and any Jira/Confluence/ADO write.
**No corporate external write of any kind was attempted or is authorised by this
report.**

---

## 9. Disposability — verified

The spike is disposable by construction, as the plan requires. Complete teardown:

```sql
DROP SCHEMA workflow CASCADE;
```

```
rm -rf server/src/workflow/ server/db/workflow/ server/tests/workflow-*.test.ts
```

*Corrected 2026-07-30 after PR #34 review.* The previous version of this section was
written against the superseded design and left the real DDL behind: it deleted
`server/db/007_workflow_schema.sql` (the file now lives at
`server/db/workflow/001_workflow_schema.sql`), removed a `schema_migrations` row that
is never written (the module deliberately does not register a version), and reverted
`migrations.test.ts`, which this spike no longer touches.

**No other file is modified — the teardown is now strictly `rm` plus one `DROP
SCHEMA`.** That is *stronger* separability evidence for criterion 4 than the original
claim, not weaker: there is no shared-chain bookkeeping to unwind, so a later
extraction of Workflow Operations into its own application remains possible because
nothing outside the module knows it exists.

---

## 10. Verification summary

| Suite | Result |
|---|---|
| `workflow-attention.test.ts` (pure, no DB) | 18 passed / 0 failed (+zero-criteria reconciliation) |
| `workflow-store.test.ts` | 6 passed / 0 failed |
| `workflow-boundary.test.ts` | 14 passed / 0 failed (+allowlist control, scan control, no-process-termination, schema idempotency) |
| `workflow-failure-isolation.test.ts` | 17 passed / 0 failed (+3a/3b split, scope fidelity, refLost, typed not-found, 3 timeout bounds, 2 concurrency) |
| **All four, post-review** | **58 passed / 0 failed** (37 pre-review -> 44 after review fixes -> 58 after the PO's four must-fixes) |
| **All four, memory fully disabled + provider unroutable** | **37 passed / 0 failed** (pre-review run; the 7 added tests are memory-independent by construction) |
| `migrations.test.ts` | 6 passed / 0 failed — **now untouched by this spike**; the workflow DDL left the shared chain, so the 4 hardcoded version assertions were reverted to pristine |
| **Full server suite** | **274 passed / 9 failed** — 216 documented baseline + 58 workflow tests reconciles exactly |

The 9 failures are the **documented pre-existing local baseline** — the board records
"216 passed / 9 expected-local-401 (CI is arbiter for LLM tests)" — and all 9 are
OpenRouter-dependent tests in `e2e.test.ts` and `entity-worker-observability.test.ts`,
files this change never touches. The arithmetic reconciles exactly: 216 + 37 = 253.

---

## 11. Decision report

```text
Recommendation:
- PROMISING WITH CONCERNS (Stage 1 preliminary; NOT an acceptance)

Evidence:
- boundary tests:      37/37 passed, incl. full run with memory disabled
                       and the model provider unroutable
- criteria proven:     1 operational independence   PASS
                       2 separate persistence/API   PASS
                       3 failure isolation          PASS
                       4 reuse and coupling         ASSESSED
- criteria unproven:   5 policy scope, 6 remote node, 7 final viability
- reused components:   Postgres connection, transactions, logging
                       conventions, container/test topology
                       (infrastructural reuse is real; memory-engine reuse
                       is unnecessary for AWCP and went unused)
                       NOT migrations — the module applies its own DDL and
                       stays out of the shared chain (corrected 2026-07-30)
- unwanted coupling:   worker logger's closed union; AGE search_path
                       pollution on pooled connections; MCP tools cost 2
                       out-of-module edits. The shared migration chain's
                       fatal-exit and hardcoded-version-list taxes were
                       AVOIDED by leaving the chain, not paid.
- remote-node result:  NOT ATTEMPTED (Stage 2). z2 reachable; protocol defined.
- policy-scope result: NOT ENFORCED (Stage 2). Model defined and DB-constrained.
                       scope.tags enforced in ZERO retrieval paths today;
                       15 read paths, fetch bypass, 2 unfilterable graph tools.
- estimated migration: low for the module itself (one import, one schema,
                       clean teardown); UNKNOWN and potentially large for the
                       policy-scope obligation the shared corpus imposes
- unresolved risks:    §6.1 could still change the host verdict at Stage 2;
                       memory-disabled mode works only via weak env validation
                       and nothing defends it
```

**ADR-016 remains Proposed / Conditional.** This report does not accept Candidate A,
does not take the final host decision, and does not authorise schema or migration work
that assumes the host. Those are Stage 2 outcomes, for the PO to take on the evidence.

---

## 12. Dependency diagram

Solid arrows are real imports. The dashed arrow is the **only** sanctioned route to
the memory domain, and it is an optional adapter that never runs inside an
operational transaction. The memory modules in grey are *not imported by anything in
the workflow module* — a test enforces that by scanning the module's own source.

```mermaid
flowchart TB
  subgraph WF["Workflow Operations — server/src/workflow/"]
    V["service.ts<br/>orchestration"]
    S["store.ts<br/>ALL SQL, sole db handle"]
    A["attention.ts<br/>pure deterministic rules"]
    P["ports.ts<br/>KnowledgeSearchPort<br/>KnowledgePromotionPort"]
    T["types.ts"]
    SCH["schema.ts<br/>applies the module's OWN DDL<br/>reports a typed error, never exits"]
  end

  subgraph SHARED["Shared platform infrastructure — reused"]
    DB["db.ts — postgres pool"]
    LOG["logging conventions"]
  end

  subgraph NOTREUSED["Shared infrastructure — deliberately NOT reused"]
    MIG["migrate.ts — shared boot-blocking<br/>chain; workflow stays out"]
  end

  subgraph MEM["Memory domain — NOT imported by workflow"]
    EW["entityWorker.ts"]
    CW["consolidationWorker.ts"]
    EMB["embeddings.ts"]
    SQ["searchQuality.ts"]
    PC["parseContext.ts"]
  end

  subgraph PG["PostgreSQL — one instance, two schemas"]
    WSCH["schema workflow<br/>6 tables"]
    PSCH["schema public<br/>thoughts, memory_graph, ..."]
  end

  V --> S
  V --> A
  V --> P
  S --> T
  A --> T
  S --> DB
  SCH --> DB
  DB --> WSCH
  SCH -. "applies db/workflow/<br/>001_workflow_schema.sql" .-> WSCH
  MIG -. "x  never applies workflow DDL" .-> WSCH
  MIG --> PSCH
  P -. "optional adapter — outside any<br/>operational transaction" .-> MEM
  MEM --> PSCH
```

The shape is the finding: **one solid line leaves the module** (`store.ts → db.ts`),
and the memory domain is reachable only across a dashed, failure-tolerant boundary.
That is what makes criteria 2 and 3 pass, and what keeps a later extraction possible.

---

## 13. Proposed ADR-016 amendments — for review, NOT applied

Deliverable 10 of the plan. These are **proposals for the PO**; none has been applied,
and ADR-016 remains Proposed/Conditional.

1. **Keep the status at Proposed / Conditional.** Stage 1 supports the hypothesis but
   does not discharge the gate. Recommend adding a line recording that criteria 1–4
   are met and 5–7 outstanding, so the ADR carries its own progress.
2. **Narrow §1's reuse argument to what the evidence supports.** The Candidate A row
   lists "Postgres + pgvector + AGE storage, hybrid search (RRF/MMR), append-only
   versioned shards, tag grammar" as the reuse case. The spike found those
   **unnecessary for AWCP** (§5). The honest reuse case is *infrastructural* —
   connection pooling, migrations, transactions, logging conventions, container and
   test topology. Recommend rewriting the row to say that, because the current wording
   overstates the benefit and would mislead a future reader comparing against
   Candidate C.
3. **Add an explicit acceptance pre-condition for the policy-scope obligation.**
   §6.1 is a cost that Candidate A carries and Candidate C does not. Recommend ADR-016
   state that accepting Candidate A requires the enforcement surface to be priced
   first (Stage 2 / ST-082), rather than treating isolation as an orthogonal backlog
   item.
4. **Record the shared-blast-radius consequences in §3 (storage layout).** A bad
   co-tenant migration exits the whole server, and MCP tool registration costs
   out-of-module edits. Neither blocks the decision; both belong in the ADR's
   trade-off list rather than only in this findings doc.
5. **No change to §2 (topology) or §4 (source lineage).** Stage 1 produced no evidence
   bearing on either; the remote-node half of §2 is exactly what Stage 2 tests.

---

## 13a. Disposition of every review finding

Four buckets, per PO direction — so nothing is silently absorbed into prose.

### Resolved before Stage 1 submission

**Four P1 defects**, all found by independent review of code that already had 37
passing tests:

| # | Defect | Resolution |
|---|---|---|
| 1 | `resolveAndPromoteDecision` reported `promoted: false` when the projection had **succeeded** but its ref failed to record — a retry would duplicate the projection | `try` narrowed to the port call alone; `refLost` flag added so "never happened" (retry) and "happened, ref lost" (reconcile) are distinguishable |
| 2 | Promotion **hardcoded `policyScope: "personal"`**, silently widening the security boundary for corporate/mixed/public packets | Reads the packet's real scope; `PromotionInput.policyScope` is now the closed `PolicyScope` union, making the class of bug a compile error |
| 3 | The import-boundary **blocklist** omitted `index.ts` and six more, and permitted every future memory module by default | Inverted to an allowlist with a red/green control test |
| 4 | The plan carried no YAML frontmatter, breaking the mandated `story: ST-NNN` link | Added; the PO-supplied body untouched |

**Three architectural findings** the PO required fixed before submission:

| # | Finding | Resolution |
|---|---|---|
| 5 | Both memory ports were **unbounded** — a hung adapter would block an operational command indefinitely | `withPortTimeout` bounds both; a `HangingMemoryAdapter` proves the bound fires, and a further test proves it does not misfire on adapters that settle |
| 6 | The `FOR UPDATE` guarantee was asserted **only in a comment** | Two concurrency tests were added here, then **superseded 2026-07-30** by PR #34 review: neither could actually discriminate the lock, because `completePacket`'s own `UPDATE` takes the same row and blocks regardless — verified by deleting the clause and watching them still pass. Resolved properly by giving `addCriterion` the same lock plus a frozen-contract refusal, which created a real contender and made a deterministic red/green control possible. See §13a residuals. |
| 7 | The workflow migration sat in the shared chain, whose runner `Deno.exit(1)`s the **whole server** before `Deno.serve` | DDL moved to `server/db/workflow/`, invisible to the shared runner. A workflow-owned `ensureWorkflowSchema()` applies it and throws a typed `WorkflowSchemaError`. Tests assert the module contains no `Deno.exit`/`process.exit` and that no workflow DDL sits in the shared chain |
| 8 | Zero-required-criteria packets completed but never reached `ready-for-review` — the gate and the attention queue disagreed | Rule chosen and applied consistently: **zero required criteria means verification-ready**. Gate, attention and tests now agree |

Plus three false claims in comments, now corrected or genuinely proven: `experiment 3`
tested the one branch where `search_path` pollution is impossible; the `completePacket`
docblock asserted an invariant the code does not provide; the schema-qualification scan
was case-sensitive.

**A bonus from fix 7:** with the DDL out of the shared chain, `migrations.test.ts` no
longer needs modifying at all. Stage 1 now touches **zero files outside
`server/src/workflow/`, `server/db/workflow/` and its own tests** — a materially
stronger separability result than the original submission.

### Known Stage 1 residuals (accepted, recorded)

Not fixed, do not affect the criteria 1–4 conclusion: client-versus-database clock skew
in staleness; untested not-found branches on `attentionForPacket`/`completePacket`;
test-only mutators (`backdateRunActivity`, `clearPromotionRef`) interleaved with
production functions in `store.ts`; test-helper duplication across the four test files
(the reviewer explicitly advised **against** extracting at 2–3 call sites); the plan not
following the canonical Product Contract shape (it is a deliberately preserved PO spec);
and `listCheckpoints` having no ORDER BY tiebreaker for identical timestamps (no current
test depends on equal timestamps). `setPacketStatus` and `POLICY_SCOPES` remain exported
without callers.

### Deferred to Stage 2

Criterion 5 (policy-scope enforcement), criterion 6 (remote execution node), criterion 7
(final extraction viability). Contracts for all three are specified in §7 so Stage 2 does
not begin from assumptions. `fetch` must be fixed first — see §6.1.

### Evidence limitations

- **The adversarial lens did not run.** The cross-model peer (`codex`, gpt-5.6-luna at
  xhigh) started but died on repeated 401s from the detached job's execution context.
  Because the peer owned the lens, the in-process fallback was correctly removed at the
  routing boundary. Coverage is **degraded**, not merely uncorroborated. The two risks it
  was specifically briefed on were caught by the testing and correctness lenses.
- **`withPortTimeout` bounds the caller's wait, not the underlying work.** It does not
  cancel an in-flight operation; a real adapter holding a socket should also accept an
  `AbortSignal`.
- **A Postgres schema is namespacing, not access control** (§6.3).
- **The memory-disabled run predates the last two fix rounds.** The 37/37 disabled-mode
  result stands for the code as it was; the 21 tests added since are memory-independent
  by construction (they use in-process adapters and workflow tables only), but that
  specific disabled-mode invocation was not re-run against them.
- ~~**No concurrency test covers a concurrent criterion INSERT** — a phantom no row lock
  can close.~~ **CLOSED 2026-07-30** after PR #34 review, which established that this was
  reachable *in-module* via `addCriterion` (a bare INSERT with no lock), not only by an
  external writer — so the completion-gate invariant was not proven. `addCriterion` now
  takes the same packet row lock and refuses once the packet is complete
  (`CriteriaFrozenError`). Both orderings are now safe: criterion first and the gate
  refuses; gate first and the criterion refuses.

  Two consequences worth recording. First, **the lock became testable**: with a real
  contender on that row, `completePacket`'s `FOR UPDATE` is now covered by a
  deterministic red/green control — hold the row lock, insert a required criterion while
  completion waits, and completion must observe it. Delete `FOR UPDATE` and that test
  fails, which was verified by doing exactly that. Before this change no test could
  discriminate the clause at all, because the subsequent `UPDATE` took the same lock.
  Second, **locking alone would not have been enough**: a criterion arriving *after*
  completion commits is not a race, and only the frozen-contract refusal closes it.

- **A concurrent evidence DELETE remains open.** Different writer, different table; the
  packet lock does not cover it. In-module the only deletion route is `deletePacket`'s
  cascade, which blocks on the same lock; an external writer is unconstrained. Closing it
  generally needs SERIALIZABLE.

- **`setPacketStatus` is an ungated back door.** Zero callers, but exported, and it writes
  any status including `complete` with no lock and no criteria check — bypassing the gate
  entirely rather than racing it. Found while scoping the above; recorded, not fixed.

---

## 14. What the code review changed — and the one lesson worth keeping

The Stage 1 implementation was reviewed by seven independent lenses plus an attempted
cross-model adversarial pass. It found **four P1 defects in code that already had 37
passing tests**, and the pattern across them is more valuable than any individual fix.

| # | Defect | Why the tests missed it |
|---|---|---|
| 1 | `resolveAndPromoteDecision` reported `promoted: false` when the projection had succeeded but its ref failed to record — inviting a duplicate projection on retry | No test failed `attachPromotionRef` independently of the port |
| 2 | Promotion **hardcoded `policyScope: "personal"`**, silently widening the security boundary for corporate/mixed/public packets | Every test created personal-scoped packets, so the hardcode was indistinguishable from correct behaviour |
| 3 | The import-boundary **blocklist** omitted `index.ts` and six other memory modules; a blocklist also permits every future one by default | The test asserted over a list, and the list was the bug — nothing checks a check |
| 4 | The plan carried no YAML frontmatter, breaking the mandated `story: ST-NNN` cross-link | No automated frontmatter check exists for `docs/plans/*.md` |

Plus three claims that were false in comments while the tests passed: `experiment 3`
exercised the one branch where `search_path` pollution is impossible; the
`completePacket` docblock asserted a `FOR UPDATE` invariant the code does not provide
(the lock covers the packet row, not the criteria/evidence rows it reads, which
re-snapshot under READ COMMITTED); and the schema-qualification scan was
case-sensitive.

**The lesson.** Every one of these had green tests. The tests were not merely
incomplete — several *certified claims they could not actually check*. That is a
specific failure mode, not general sloppiness, and it is sharpest exactly here: when a
spike's deliverable **is** evidence, the evidence mechanism needs adversarial review as
much as the production code does. Three concrete habits follow:

1. **Prefer allowlists to blocklists for any boundary check.** A blocklist over a
   growing surface silently weakens with every file added.
2. **Give every verification mechanism a red/green control** — a test proving the check
   *fires*, not just that it stayed quiet. Both boundary scans now have one.
3. **A comment asserting an invariant is a claim that needs a test or a correction.**
   Two of the three false claims above lived only in prose.

This is also the argument for having run the review at all rather than shipping on the
author's own verification: the author wrote both the code and the tests that certified
it, and reviewed the diff before the review — and still missed all four.

**Adversarial coverage gap, recorded honestly:** the cross-model peer (`codex`, gpt-5.6-luna
at xhigh) started but died on repeated 401s from the detached job's execution context.
Because the peer owned the lens, the in-process fallback was correctly removed at the
routing boundary — so **the adversarial lens did not run**. Coverage is therefore
*degraded*, not merely uncorroborated. Mitigating but not equivalent: the two risks the
peer was specifically briefed on (the silent-pass boundary scans, and experiment 3's
branch) were both caught by the testing and correctness lenses.

---

## 15. Surprises and discoveries

0. **Four P1 defects survived 37 passing tests** — see §14. The most transferable
   finding in this report is not architectural: it is that a spike's own verification
   mechanism needs adversarial review, because green tests certified three claims that
   were false.
1. **`scope.tags` is enforced nowhere at all.** The expectation going in was "partially
   enforced"; the reality is zero retrieval paths. The tool descriptions are honest
   about it (`index.ts:242`: *"tags are not search filters in this tool"*) — the gap is
   documented, just not closed.
2. **Memory-disabled mode works by accident.** `startupValidation` demands
   `OPENROUTER_API_KEY` but validates truthiness only, so the literal string `disabled`
   satisfies it. The capability that Stage 1 depends on is unprotected by any test.
3. **AGE leaks `search_path` across a pooled connection** and every co-tenant module
   inherits it. Schema-qualifying everything was mandatory for correctness, not tidiness.
4. **`server/server.ts` is dead code** — a four-line placeholder that binds the same
   port as `index.ts` and is on no boot path.
5. **`index.ts` maintains its own tool list by hand** (`:101-113`) and a test regex-scans
   that single file to verify it, which quietly makes "register tools from another
   module" a two-file change.
6. **CLAUDE.md says six MCP tools; `index.ts` registers eleven.** Stale documentation,
   noted in passing.
