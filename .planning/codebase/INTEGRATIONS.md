# External Integrations

**Analysis Date:** 2026-08-05

## APIs & External Services

**Large Language Model & Embeddings (OpenRouter):**
- OpenRouter API - Primary provider for both embeddings and LLM calls
  - SDK/Client: Fetch API (native Deno) + manual JSON over HTTPS
  - Embeddings: `openai/text-embedding-3-small` (512-dim truncated)
    - Implementation: `server/src/embeddings.ts`
    - Timeout: 10 seconds (configurable via `EMBEDDING_TIMEOUT_MS`)
    - Used by: Semantic search (MMR rerank), entity extraction, embedding backfill
  - LLM: `openai/gpt-4o-mini` (for consolidation)
    - Implementation: `server/src/consolidationLLM.ts`
    - Purpose: Normalize episodic shards into durable semantic wiki entries (ST-008)
    - JSON response format required; responses validated for `normalised_content` field
  - Auth: `OPENROUTER_API_KEY` env var (Bearer token in Authorization header)
  - Endpoint: `https://openrouter.ai/api/v1` (configurable via `OPENROUTER_BASE_URL`)

## Data Storage

**Primary Database:**
- PostgreSQL 15
  - Provider: Docker container or managed Postgres (Supabase for Contact Memory)
  - Connection: `DATABASE_URL` env var (connection string)
  - Client: `postgres` npm package (version 3.4.4, from `server/src/db.ts`)
  - Pool: 10 max connections, 30s idle timeout, 10s connect timeout

**PostgreSQL Extensions:**
- `pgvector` - Vector similarity search for embeddings
  - Used by: Semantic search in `server/src/searchQuality.ts`
  - Table column: `thoughts.embedding` (pgvector type)
  - Queries: Cosine distance (`<=>`) and L2 distance operations

- `Apache AGE` - Graph database layer
  - Used by: Entity relationship tracking (memory_graph)
  - Implementation: `server/db/graph.sql` (initialization)
  - Purpose: Relate entities and facts across thoughts
  - Graph name: `memory_graph`

**File Storage:**
- Local filesystem only (no cloud storage integration detected)
- Contact Memory WhatsApp exports: Supabase Storage (mentioned in ADR-009, not yet implemented)

**Caching:**
- None detected — queries hit PostgreSQL directly; no Redis or in-memory cache layer

## Authentication & Identity

**API Authentication:**
- Custom Bearer token scheme (platform MCP)
  - Implementation: `server/src/auth.ts` - `requireApiKey()` function
  - Token env var: `MEMORY_API_KEY`
  - Header: `Authorization: ****** {token}`
  - Validation: Fails closed (missing env var throws error; mismatch returns 401)

**Operator vs. Agent Split (Workflow Operations, ST-086):**
- Operator credential: `MEMORY_API_KEY` (full access to platform MCP)
- Agent credential: `AWCP_AGENT_API_KEY` (optional, restricted scope for Workflow Operations `/api/workflow`)
  - Scope: Can create packets, register runs, record checkpoints/decisions, end runs, read overview
  - Denied: resolve, attach-evidence, complete, add-criterion (sign-off endpoints)
  - Collision guard: Server refuses startup if both keys are equal
  - Default behavior: If `AWCP_AGENT_API_KEY` is blank/missing, only `MEMORY_API_KEY` is used (single-key mode)
  - Implementation: `server/src/workflow/policy.ts` - `requiresOperator()` function

**OpenRouter Auth:**
- API key authentication
- Env var: `OPENROUTER_API_KEY`
- Fails open on missing key: throws error at startup (embeddings) or at call time (LLM)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or third-party error service)

**Logging:**
- Console-based (Deno `console.log`, `console.error`)
- Structured context: Request correlation ID via AsyncLocalStorage
- Implementation: `server/src/mcpDiagnostics.ts` - `runWithMcpRequestContext()`
- Log levels: Info (startup), error (failures), debug (worker events via `workerLogger.ts`)
- Worker events: Entity worker, consolidation worker, embedding backfill logged to stdout

**Health Checks:**
- HTTP GET `/health` endpoint
  - Implementation: `server/src/healthCheck.ts`
  - Auth: None (public endpoint)
  - Returns: 200 on ready, 503 when unhealthy
  - Deep check: Verifies database connectivity with timeout
- Docker health check: Polls `/health` every 10s (startup period 15s)

## CI/CD & Deployment

**Container Deployment:**
- Docker images:
  - `server/Dockerfile` - Deno runtime, TypeScript compilation, frozen deps
  - `docker/postgres-age/Dockerfile` - PostgreSQL 15 + pgvector + Apache AGE
- Docker Compose orchestration:
  - `docker-compose.yml` - Dev stack (db + mcp)
  - `docker-compose.workflow.yml` - Optional Workflow Operations profile
  - `--profile test` - Ephemeral test stack (db-test, seed, mcp-test)

**CI Pipeline:**
- Not detected in this codebase (GitHub Actions config or other CI not visible in current exploration)

**Cloud Deployment (Referenced, not implemented):**
- Supabase (Postgres + pgvector + Edge Functions) - Contact Memory target per ADR-009, ADR-011
- Deployment: `deno serve` or Deno Deploy (not yet active)

## Environment Configuration

**Required Startup Environment Variables:**
1. `DATABASE_URL` - PostgreSQL connection string (blocks startup if missing)
2. `MEMORY_API_KEY` - API key for platform MCP (blocks startup if missing)
3. `OPENROUTER_API_KEY` - API key for embeddings and LLM (blocks startup if missing)

**Optional but Recommended:**
1. `DB_PASSWORD` - PostgreSQL password (referenced in docker-compose.yml)
2. `AWCP_AGENT_API_KEY` - Separate agent credential for Workflow Operations (empty/missing = single-key mode)
3. `PORT` - Server port (default 3000)
4. `OPENROUTER_BASE_URL` - Override OpenRouter endpoint
5. `AI_MEMORY_CITATION_BASE_URL` - Override citation base URL
6. `EMBEDDING_TIMEOUT_MS` - Embedding request timeout
7. `MODEL_PROVIDER_ENABLED` - Disable embeddings if set to "false"
8. `FEATURE_ENTITY_WORKER` - Toggle entity extraction (default enabled)
9. `FEATURE_CONSOLIDATION_WORKER` - Toggle consolidation (default enabled)
10. `FEATURE_WORKFLOW` - Toggle Workflow Operations feature (default disabled)

**Test-Only Env Variables:**
- `CONSOLIDATION_WORKER_DISABLED` - Disable auto-drain in test suite
- `EMBEDDING_BACKFILL_DISABLED` - Disable auto-sweep in test suite

**Secrets Storage:**
- Local development: `.env` file (gitignored)
- Docker Compose: Env vars passed via `--environment` in docker-compose.yml
- Production: Secrets manager (not yet specified; implies future ST-023 deployment work)

## Webhooks & Callbacks

**Incoming Webhooks:**
- None detected (platform is pull-based via MCP tools, not push-based)

**Outgoing Webhooks/Callbacks:**
- None detected (no external event subscriptions or notifications)

**LISTEN/NOTIFY (Internal PostgreSQL PubSub):**
- Entity Worker: Listens for `entity_extraction_queued` events (consolidation worker signals)
- Consolidation Worker: Listens for `consolidation_needed` events (auto-drain via `LISTEN`)
- Implementation: Background workers in `server/src/entityWorker.ts` and `server/src/consolidationWorker.ts`
- Test override: `CONSOLIDATION_WORKER_DISABLED=true` disables auto-drain so tests can control timing

## Contact Memory Product Track (Future Integration Points)

**Per docs/architecture/ai_memory_architecture_decisions.md and ADR-009, ADR-011:**
- Android app - Contact Memory client (not yet integrated)
- WhatsApp parser - Input pipeline for message export ingestion (planned)
- Human review gate - Manual curation before commit (planned)
- Contact MCP - Product-specific tools for profiles, commitments, dates (planned)
- Supabase deployment - Postgres + pgvector + Storage + Edge Functions (ADR-009, not yet active)

**Note:** Contact Memory architecture decisions supersede platform-level assumptions in SRS and SystemDesign where they conflict.

---

*Integration audit: 2026-08-05*
