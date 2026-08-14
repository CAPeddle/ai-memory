# Technology Stack

**Analysis Date:** 2026-08-05

## Languages

**Primary:**
- TypeScript 5.x - Cloud MCP server, all active feature work in `server/`
- SQL (PostgreSQL dialect) - Schema, migrations, queries in `server/db/`

**Secondary:**
- C# 12 - Skeletal .NET 8 scaffold in `src/`, `tests/` (placeholder `SmokeTests` only; reserved for ST-019 local Obsidian synthesis, not active)
- PowerShell - Governance asset validation tooling in `tools/GovernanceAssetValidator/`

## Runtime

**Environment:**
- Deno 2.0 (frozen imports, strict mode)
- Node.js compatibility layer via npm imports (Deno's npm protocol)

**Package Manager:**
- Deno's native import system with `deno.lock` (frozen lockfile required)
- Separate: npm (via `npm:` specifier in deno.json imports)

## Frameworks

**Core:**
- Hono 4.9.2 - HTTP server framework, MCP StreamableHTTPTransport binding
- @modelcontextprotocol/sdk 1.24.3 - MCP server protocol (tools, resources, prompts)
- @hono/mcp 0.1.1 - Hono + MCP bridge

**Validation:**
- Zod 4.1.13 - Runtime schema validation for request/response contracts

**Database:**
- postgres 3.4.4 - PostgreSQL client (npm import)

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk 1.24.3 - MCP protocol implementation; all client/agent integrations depend on this
- postgres 3.4.4 - Database driver; blocking dependency for all data operations
- Hono 4.9.2 - Web framework; no alternative; all routes bind to this
- Zod 4.1.13 - Runtime validation; used throughout for tool/API contracts

**Infrastructure:**
- node:async_hooks (built-in) - AsyncLocalStorage for request correlation ID and embedding lane tracking (see `server/src/mcpDiagnostics.ts`)

## Database

**RDBMS:**
- PostgreSQL 15 (via `postgres:15` Docker image)
- Extension: pgvector 0.x - Semantic search via vector embeddings
- Extension: Apache AGE 1.6.0-rc0 - Graph database layer for entity relationships (memory_graph)

**Connection Pool:**
- postgres client configured with:
  - `max: 10` concurrent connections
  - `idle_timeout: 30s`
  - `connect_timeout: 10s`
  - Connection via DATABASE_URL env var

**Schema Initialization:**
- `server/db/schema.sql` - thoughts table, indices, base schema
- `server/db/graph.sql` - Apache AGE memory_graph initialization
- `server/db/002_needs_embedding.sql` - Embedding resilience columns (ST-039)
- `server/db/workflow/` - Workflow Operations schema migrations (opt-in via FEATURE_WORKFLOW=true)

## Configuration

**Environment:**
- **Required:**
  - `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://ai_memory:password@db:5432/ai_memory`)
  - `MEMORY_API_KEY` - Bearer token for platform MCP authentication
  - `OPENROUTER_API_KEY` - API key for embeddings (OpenRouter, text-embedding-3-small) and LLM (OpenRouter gpt-4o-mini)

- **Optional:**
  - `AWCP_AGENT_API_KEY` - Separate credential for Workflow Operations `/api/workflow` endpoints; must not equal MEMORY_API_KEY; blank defaults to single-key mode (MEMORY_API_KEY only)
  - `PORT` - Server port (default: 3000)
  - `EMBEDDING_TIMEOUT_MS` - Embedding request timeout (default: 10000)
  - `OPENROUTER_BASE_URL` - OpenRouter API endpoint override (default: `https://openrouter.ai/api/v1`)
  - `AI_MEMORY_CITATION_BASE_URL` - Base URL for thought citations (default: `https://ai-memory.local/thoughts`)
  - `MODEL_PROVIDER_ENABLED` - Disable embeddings provider if set to "false" (for degraded mode)
  - `FEATURE_ENTITY_WORKER` - Enable entity extraction worker (default: true)
  - `FEATURE_CONSOLIDATION_WORKER` - Enable consolidation worker (default: true)
  - `FEATURE_WORKFLOW` - Enable Workflow Operations feature (default: false)
  - `CONSOLIDATION_WORKER_DISABLED` - Disable auto-drain of consolidation queue (used in tests)
  - `EMBEDDING_BACKFILL_DISABLED` - Disable auto-sweep of embedding backfill (used in tests)

**Environment Files (not committed):**
- `.env` - Local development secrets (gitignored)
- `.env.dev` - Development override
- `.env.example` - Template for required/optional vars
- `.env.dev.example` - Development template

**Build Configuration:**
- `server/deno.json` - Deno runtime config, TypeScript strict mode, npm imports
- `deno.lock` - Frozen dependency lockfile (required for production)
- Dockerfile: `server/Dockerfile` - Containerized Deno runtime with mounted `./server` volume for dev

## Platform Requirements

**Development:**
- Deno 2.0 (or later compatible version)
- Docker + Docker Compose (for PostgreSQL + pgvector + Apache AGE)
- PostgreSQL 15 client tools optional (psql for manual schema inspection)

**Production:**
- Deno 2.0 runtime
- PostgreSQL 15 server with pgvector and Apache AGE extensions
- OpenRouter API access (for embeddings and LLM calls)
- Deployment target: Docker (see `server/Dockerfile` and `docker-compose.yml`)
- Cloud option: Supabase (Postgres + pgvector + Edge Functions) mentioned in Contact Memory track (ADR-009, ADR-011)

## Inactive/Skeletal Stack

**C# / .NET (Reserved, not active):**
- .NET SDK 8.0.100
- Target: Local Obsidian synthesis service (ST-019)
- Current state: Placeholder SmokeTests only in `tests/`, no production code
- Framework/ORM choices: Not yet finalized

**Governance Asset Validator (Active CLI only):**
- Language: C#
- Runtime: .NET 8
- Purpose: Build and validate frontmatter-driven governance catalog
- Location: `tools/GovernanceAssetValidator/`

---

*Stack analysis: 2026-08-05*
