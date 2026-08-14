<!-- refreshed: 2026-08-05 -->
# Architecture

**Analysis Date:** 2026-08-05

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│         AI Agents / Clients (Claude, Copilot, etc)           │
│         Human CLI / Web Browsers                              │
└─────────────────────┬──────────────────────────────────────┘
                      │ MCP over Streamable HTTP
                      │ Authorization: Bearer token
                      ▼
┌──────────────────────────────────────────────────────────────┐
│    Cloud MCP Server Layer (Deno 2.0 / TypeScript)            │
│  `server/index.ts` — McpServer + Hono app                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ MCP Tools: search, fetch, search_thoughts,              │ │
│  │ capture_thought, list_thoughts, thought_stats, stats,   │ │
│  │ report_feedback, graph_traverse, graph_search,          │ │
│  │ consolidate                                             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  Core Services Layer `server/src/`:                           │
│  ├─ Search Quality (BM25 + vector hybrid)                    │
│  ├─ Embeddings (OpenRouter provider, backfill)               │
│  ├─ Entity Extraction Worker (background LLM)                │
│  ├─ Consolidation Worker (shard→wiki promotion)              │
│  ├─ Context Parsing (project/tag scoping)                    │
│  ├─ Workflow Operations (ST-086, opt-in)                     │
│  └─ Migrations & Health Checks                               │
└──────────────┬───────────────────────────────────────────────┘
               │ Database Driver: postgres@3.4.4
               ▼
┌──────────────────────────────────────────────────────────────┐
│   PostgreSQL 15 + pgvector + Apache AGE                      │
│  `server/db/` migrations                                      │
│  ├─ thoughts table (BM25 tsvector, vector(512), embeddings)  │
│  ├─ entity_extraction_queue (background worker)              │
│  ├─ consolidation_queue (promotion scoring & retry)          │
│  ├─ memory_graph (Apache AGE, knowledge graph)               │
│  ├─ feedback_events (recall quality telemetry)               │
│  ├─ worker_runs (background job telemetry)                   │
│  └─ schema_migrations (versioned DDL track)                  │
└──────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **MCP Server** | Registers all tools, routes HTTP requests to McpServer, handles Streamable HTTP transport and CORS | `server/index.ts` |
| **Search Quality** | BM25 + vector hybrid search, RRF fusion (k=60), MMR reranking (λ=0.7), quality band derivation | `server/src/searchQuality.ts` |
| **Embeddings** | Calls OpenRouter `text-embedding-3-small`, caches provider state, falls back to BM25, backfill sweep for retry | `server/src/embeddings.ts` |
| **Entity Worker** | Polls `entity_extraction_queue`, calls OpenRouter GPT-4o-mini, extracts Person/Function/Error/Topic/Project nodes and relationships, inserts into Apache AGE graph | `server/src/entityWorker.ts` |
| **Consolidation Worker** | Polls `consolidation_queue`, scores shards by recency + recall + cross-project usage, promotes to wiki or flags, LLM normalises content | `server/src/consolidationWorker.ts` |
| **Context Parser** | Validates and parses `project:X,tags:Y;Z,strict` scope strings, returns ContextScope or validation error | `server/src/parseContext.ts` |
| **Workflow Operations** | Opt-in (FEATURE_WORKFLOW=true) operational surface for packet/decision/checkpoint management; composed from workflow/{api,schema,store,types} | `server/src/workflow/` |
| **Auth** | Validates `Authorization: Bearer {MEMORY_API_KEY}` header, fails closed | `server/src/auth.ts` |
| **Migrations** | Runs versioned `.sql` files from `server/db/`, tracks state in `schema_migrations` table | `server/src/migrate.ts` |
| **.NET Skeleton** | Placeholder for future local Obsidian synthesis companion (C# / .NET 8); contains only test smoke tests | `src/AiMemory.Core/`, `tests/AiMemory.Tests/` |
| **Contact Memory MVP** | WhatsApp export parser, interactive review CLI, commits extracted contact facts through platform MCP | `contact-memory/{cli,parser,runtime}/` |

## Pattern Overview

**Overall:** Layered event-sourcing + hybrid retrieval + background worker composition

**Key Characteristics:**
- **Append-only captures** — `capture_thought` writes immutable thoughts with deduplication by content fingerprint; no direct mutations
- **Async knowledge promotion** — Background workers handle enrichment (embeddings, entity extraction, consolidation scoring/promotion)
- **Dual storage** — Postgres for structured facts + Apache AGE for graph relationships; same LLM extracts both
- **Scoped retrieval** — All search tools accept context string (`project:X,strict`) for project isolation and cross-project boosting
- **Read-only Cypher** — `graph_traverse` only accepts MATCH queries; mutations forbidden

## Layers

**HTTP Transport & MCP Server:**
- Purpose: Accept client requests over Streamable HTTP, route to MCP tool handlers, return responses
- Location: `server/index.ts` (composition root); `server/src/mcpDiagnostics.ts` (request logging)
- Contains: McpServer instance, Hono app, CORS headers, bearer auth check, tool registration
- Depends on: All service modules below
- Used by: External MCP clients (Claude, Copilot, ChatGPT, custom scripts)

**Search & Retrieval:**
- Purpose: Rank memories by relevance using hybrid BM25 + vector search, apply project scoping, MMR diversity reranking
- Location: `server/src/searchQuality.ts` (core algorithms); `server/index.ts` (search_thoughts, search, fetch tools)
- Contains: Reciprocal Rank Fusion (RRF), Maximal Marginal Relevance (MMR), cosine similarity, quality band derivation
- Depends on: Embeddings module (getEmbedding), Postgres pool (sql), context parser (parseContextOrError)
- Used by: search_thoughts, search, fetch tools; called on every recall request

**Embeddings & Model Inference:**
- Purpose: Call external embedding provider (OpenRouter text-embedding-3-small) or degrade gracefully to BM25
- Location: `server/src/embeddings.ts`
- Contains: Provider state machine (enabled/disabled/error), exponential backoff, model version tracking
- Depends on: OpenRouter API key from env
- Used by: Search quality (to vectorize queries), Entity worker (as part of entity extraction context)

**Entity Extraction Worker:**
- Purpose: Background polling of `entity_extraction_queue`, LLM extraction of entities/relationships, graph population
- Location: `server/src/entityWorker.ts`
- Contains: Polling loop (10s interval), batch claiming (10 rows), GPT-4o-mini via OpenRouter, Cypher injection sanitization, exponential backoff
- Depends on: Postgres pool, OpenRouter API key, entity-extraction `entity_extraction_queue` table
- Used by: Long-running background process (started in server/index.ts), writes to memory_graph

**Consolidation Worker:**
- Purpose: Background promotion of "shard" memories to "wiki" tier based on recall signals and scoring
- Location: `server/src/consolidationWorker.ts`, `server/src/consolidationScoring.ts`, `server/src/consolidationLLM.ts`
- Contains: Queue polling, three-factor scoring (recency, recall count, distinct projects), LLM normalisation, dry-run mode
- Depends on: Postgres pool, OpenRouter API key, recall_events telemetry, consolidation_queue table
- Used by: Long-running background process; also callable via consolidate MCP tool

**Workflow Operations (Optional):**
- Purpose: Opt-in (FEATURE_WORKFLOW=true) operational surface for structured verification of knowledge
- Location: `server/src/workflow/{schema,store,api,types,bootstrap,policy}`
- Contains: Schema migrations, HTTP routes, read model, packet/decision state machines
- Depends on: Postgres pool, optional FEATURE_WORKFLOW flag, optional AWCP_AGENT_API_KEY for role-based access
- Used by: `/api/workflow/*` HTTP routes when enabled

**Contact Memory MVP (Separate Deno Project):**
- Purpose: Parse WhatsApp exports, extract contact-specific facts via LLM, interactive review CLI, commit through platform MCP
- Location: `contact-memory/{cli,parser,runtime}`
- Contains: WhatsApp text format parser, extraction schema validation, CLI state machine, MCP client
- Depends on: Platform MCP server (http://localhost:3000), Anthropic API key for extraction, MEMORY_API_KEY for commits
- Used by: Local operator reviewing WhatsApp transcripts; produces shard commits

**.NET Skeleton (Scaffolded, Not Active):**
- Purpose: Reserved for future local Obsidian synthesis companion
- Location: `src/AiMemory.Core/`, `tests/AiMemory.Tests/`
- Contains: Placeholder interface definitions, C# / .NET 8 project structure
- Depends on: None (not yet implemented)
- Used by: None (future track: ST-019)

## Data Flow

### Primary Request Path: search_thoughts

1. Client calls `search_thoughts` with query, optional context scope, and limit (`server/index.ts:~350-500`)
2. Server parses context string; returns validation error if malformed (`server/src/parseContext.ts`)
3. Query normalized (identifier faceting) to extract searchable terms (`server/src/identifierNormalization.ts`)
4. If query is non-empty, embedding requested from OpenRouter via `getEmbedding()` (`server/src/embeddings.ts`)
5. BM25 lane executes Postgres `plainto_tsquery` search with `ts_rank_cd` ranking; respects `strict` flag (`server/index.ts:~380`)
6. Vector lane executes Postgres `pgvector` cosine distance search (if embedding succeeded); respects `strict` flag
7. RRF fusion combines ranks from both lanes (k=60); optional project boost (1.2×) applied if not strict
8. Top N candidates (3× limit) pulled from database with embedding vectors
9. MMR re-ranking applied (λ=0.7 relevance, 0.3 diversity) to final result set
10. Quality band (high/medium/low) derived per result from rank and similarity signals
11. Fire-and-forget recall log recorded asynchronously (`logRecall`, `logRecallQuery`)
12. Response returned with ranked results, scores, and quality bands

### Capture & Enrichment Path

1. Client calls `capture_thought` with content, memory_type, and context (`server/index.ts:~600-800`)
2. Content size validated (32KB limit); context parsed for project and tags
3. Content fingerprinted (SHA-256) for deduplication
4. Row inserted or ON CONFLICT updated (merges tags, reactivates if deactivated)
5. BM25 search text generated from normalized query
6. Fire-and-forget embedding request to OpenRouter (non-blocking; failures logged, not refused)
7. Fire-and-forget entity extraction queue entry created (triggers background worker)
8. Response returned immediately with thought UUID
9. Background: Entity worker polls queue, calls GPT-4o-mini for extraction, creates Apache AGE nodes/edges
10. Background: Consolidation worker polls, scores the new thought for promotion readiness

### Graph Traversal Path

1. Client calls `graph_traverse` with Cypher MATCH query (`server/index.ts:~1050`)
2. Query validated: must start with MATCH, no mutation keywords, string literals/comments masked to prevent injection
3. Comments stripped, dollar-quotes escaped (AGE safety)
4. `sql.unsafe()` wrapper executes: `LOAD 'age'; SET search_path...; SELECT * FROM cypher('memory_graph', $$...$$)`
5. Raw agtype rows converted to strings and returned line-by-line

### Background Worker: Entity Extraction

1. `startEntityWorker()` called on server startup (`server/index.ts:~50`)
2. Polling loop every 10s claims batch of pending rows with FOR UPDATE SKIP LOCKED
3. For each row: fetch thought content, truncate to 16K chars, call OpenRouter GPT-4o-mini
4. LLM returns JSON with nodes (label + name) and edges (from + to + relationship)
5. Nodes inserted/merged into memory_graph; edges created between them
6. Allow-lists enforced: only Person/Function/Error/Topic/Project labels, only CAUSED_BY/LIKES/WORKS_ON/USES/RELATED_TO relationships
7. Cypher injection sanitized by escapeForCypher() on all user strings
8. Exponential backoff on LLM errors; max 5 attempts per thought

### Background Worker: Consolidation

1. `startConsolidationWorker()` called on server startup; also callable via `consolidate` MCP tool
2. Polling loop every 1 hour claims pending shards with FOR UPDATE SKIP LOCKED
3. For each shard: fetch recall event count, distinct project count, compute recency
4. Three-factor scoring: `scoreCandidate()` from `consolidationScoring.ts`
5. If score exceeds threshold, call consolidation LLM to normalise content
6. Decide: promote to wiki, flag for review, or skip
7. Record decision in consolidation_log with dry_run flag
8. If not dry_run, update thoughts table (memory_type = 'wiki')

**State Management:**
- Postgres is the single source of truth for all state
- Workers are stateless polling loops; no local memory between runs
- Deduplication by content_fingerprint ensures idempotency on re-capture
- Workflow schema (optional) holds packet/decision state in separate namespace

## Key Abstractions

**Thought:**
- Purpose: Atomic unit of memory — captured text, metadata, provenance, type (shard vs wiki)
- Examples: `server/db/001_initial.sql` (schema); `server/index.ts` (capture_thought, search_thoughts tools)
- Pattern: Write-once (except tag merging on duplicate fingerprint), read-many via hybrid search

**Memory Type:**
- Purpose: Tier/phase of a thought's lifecycle
- Values: "shard" (raw captured note), "wiki" (promoted durable fact)
- Pattern: Consolidation worker promotes shards based on usage signals

**Context Scope:**
- Purpose: Scoping string for project isolation and cross-project search boosting
- Format: `project:X,tags:Y;Z,strict,visibility:prefer`
- Pattern: Parsed once per tool call; strict mode restricts results to in-project only

**Quality Band:**
- Purpose: Signal to client whether a search result was high/medium/low confidence
- Derivation: Based on BM25 rank, vector rank, and cosine similarity thresholds
- Pattern: Computed post-MMR, returned alongside each result

**Entity Node:**
- Purpose: Discrete fact in the knowledge graph (Person, Function, Error, Topic, Project)
- Examples: "Alice", "TypeScript", "timeout bug"
- Pattern: Created by entity worker from LLM extraction, queried via graph_search

**Relationship Edge:**
- Purpose: Semantic connection between two entities in the graph
- Types: CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO (allow-listed)
- Pattern: Created by entity worker; traversed via graph_search or graph_traverse

## Entry Points

**Server Startup:**
- Location: `server/index.ts` top-level (lines 1-100)
- Triggers: `docker compose up` or `deno serve`
- Responsibilities: Validate env vars, run migrations, bootstrap workflows, start workers, create McpServer, mount Hono app, listen on port 3000

**HTTP GET /health:**
- Location: `server/index.ts` (~1180)
- Triggers: Container healthcheck, orchestrator probes
- Responsibilities: Return `{status: "healthy"}` immediately

**HTTP GET /ready:**
- Location: `server/index.ts` (~1185)
- Triggers: Orchestrator readiness checks (K8s, Kuma, etc)
- Responsibilities: Run deep health checks (DB connection, embedding provider, workflow schema if enabled), return status code 200/503

**HTTP POST /mcp:**
- Location: `server/index.ts` (~1241)
- Triggers: MCP client makes tool call
- Responsibilities: Validate Bearer auth, route to McpServer, handle Streamable HTTP (SSE), return response

**HTTP POST /api/workflow/***:**
- Location: `server/src/workflow/api.ts` (mounted conditionally, `server/index.ts` ~1250)
- Triggers: Operator or AWCP agent calls workflow endpoints (FEATURE_WORKFLOW=true)
- Responsibilities: Enforce role-based auth (operator vs agent), manage packet/decision/checkpoint state

**Contact Memory CLI:**
- Location: `contact-memory/cli/index.ts`
- Triggers: `deno run cli/index.ts <export.txt> <contact-name> [flags]`
- Responsibilities: Parse WhatsApp export, extract via Anthropic, show review UI, commit approved facts through platform MCP

## Architectural Constraints

- **Threading:** Single-threaded event loop (Deno). Workers are async polling loops, not OS threads. Postgres connection pool handles concurrency.
- **Global state:** McpServer singleton created once at startup; `sql` postgres pool is shared module-level export; workers are started once with no restart mechanism.
- **Circular imports:** None detected; layering is strict (HTTP → Tools → Services → DB).
- **Content limit:** 32KB per thought enforced at capture time (checked before fingerprint, before INSERT).
- **Cypher safety:** All user-provided entity names, node labels, and relationship types sanitized via escapeForCypher() or allow-listed.
- **Embedding provider resilience:** ModelProviderDisabledError (env flag off) propagates to caller; other errors (timeout, 5xx) fall back to BM25 silently.
- **Polling idempotence:** Workers use FOR UPDATE SKIP LOCKED; failed attempts increment counter; exponential backoff prevents thundering herd.
- **Database schema versioning:** Migrations are numbered, applied once, tracked in schema_migrations; no down migrations.

## Anti-Patterns

### Direct Thought Mutation

**What happens:** Code attempts to UPDATE thoughts.memory_type or thoughts.content outside of capture_thought or consolidation worker paths

**Why it's wrong:** Violates append-only semantic; breaks deduplication by content fingerprint; audit trail incomplete

**Do this instead:** `capture_thought` for new/updated facts; consolidation worker for promotion; use tags/project for scoping updates

### Ignoring Embedding Failures

**What happens:** Code fails a search if embedding provider is unavailable instead of degrading to BM25

**Why it's wrong:** Makes search unavailable when embeddings are temporarily down; wastes coverage for a non-fatal degradation

**Do this instead:** Check for ModelProviderDisabledError; rethrow. All other errors: set qEmb=null, continue with BM25-only lanes (see `server/index.ts:~350-360`)

### Unescaped Entity Names in Cypher

**What happens:** Code interpolates entity names directly into Cypher MATCH queries without escapeForCypher()

**Why it's wrong:** Entity names can contain quotes/backslashes; injection possible (though not mutation due to read-only check)

**Do this instead:** Call escapeForCypher() before string interpolation; or better, use parameter binding (not currently supported by AGE in Deno)

### Synchronous Worker Operations

**What happens:** Tool handlers await embedding, entity extraction, or consolidation instead of returning immediately

**Why it's wrong:** Client timeout risk; violates "capture must succeed immediately" contract; blocks MCP listener

**Do this instead:** Fire-and-forget background work; record side effects asynchronously (see capture_thought embedding update at `server/index.ts:~750`)

## Error Handling

**Strategy:** Fail closed on auth, validation, and env config; fail open (degrade) on transient infrastructure (embedding timeout, DB momentary blip)

**Patterns:**
- **Auth failures** → 401 Unauthorized, no error details leaked
- **Validation errors** → 400-equivalent (via Zod schema), detailed context parse message returned to caller
- **Migration failures** → `Deno.exit(1)`, logged, breaks startup
- **Embedding provider disabled** → Rethrow ModelProviderDisabledError to caller (high-level contract breach)
- **Embedding timeout** → Catch, log, return null, continue with BM25
- **DB connection lost** → Crash (Postgres module handles reconnection; no graceful degradation)
- **Worker LLM error** → Log, increment attempt_count, exponential backoff, retry up to 5 times, then mark failed
- **Cypher injection attempt** → Reject before execution with "disallowed keyword" error

## Cross-Cutting Concerns

**Logging:** Console-based; structured logs from workers include `[server]`, `[entity-worker]`, `[consolidation-worker]` prefixes; migrations log `[migrate]`; timing info logged from withTiming() wrapper

**Validation:** Zod schemas on all MCP tool inputs; context parser validates project/tag format; Cypher tokenizer validates query structure; content fingerprint validated post-insert

**Authentication:** Bearer token checked via requireApiKey() on all /mcp requests; workflow routes check both MEMORY_API_KEY (operator) and optional AWCP_AGENT_API_KEY (agent, read-only)

**Request Tracking:** MCP request context captured in mcpDiagnostics.ts; correlationId, embedding lane, safe body fields logged for observability

---

*Architecture analysis: 2026-08-05*
