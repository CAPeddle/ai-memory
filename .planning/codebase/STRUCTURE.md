# Codebase Structure

**Analysis Date:** 2026-08-05

## Directory Layout

```
ai-memory/
├── server/                     # Active Deno MCP server (TypeScript)
│   ├── index.ts                # Composition root: McpServer + Hono app + worker startup
│   ├── server.ts               # Placeholder (Task 4.6 — not currently used)
│   ├── Dockerfile              # Deno runtime, prod config
│   ├── deno.json               # Deno project manifest
│   ├── deno.lock               # Dependency lock file
│   │
│   ├── src/                    # Core service modules
│   │   ├── db.ts               # Postgres pool initialization
│   │   ├── auth.ts             # Bearer token validation
│   │   ├── parseContext.ts     # Scope string parser (project/tags/strict/visibility)
│   │   ├── searchQuality.ts    # BM25 + vector hybrid, RRF, MMR, quality bands
│   │   ├── embeddings.ts       # OpenRouter provider, state machine, backfill
│   │   ├── entityWorker.ts     # Background entity extraction polling loop
│   │   ├── consolidationWorker.ts   # Background shard→wiki promotion
│   │   ├── consolidationScoring.ts  # Three-factor scoring algorithm
│   │   ├── consolidationLLM.ts      # Content normalisation via LLM
│   │   ├── identifierNormalization.ts # Query faceting (e.g., strip SQL keywords)
│   │   ├── migrate.ts          # Versioned migration runner
│   │   ├── healthCheck.ts      # Deep health probes (DB, embeddings, workflow)
│   │   ├── logging.ts          # Timing wrapper, request logger
│   │   ├── mcpDiagnostics.ts   # Request context, correlation ID, embedding lane
│   │   ├── startupValidation.ts # Env var checks, fail-fast
│   │   ├── workerLogger.ts     # Worker event logging
│   │   │
│   │   └── workflow/           # Workflow Operations (ST-086, opt-in via FEATURE_WORKFLOW=true)
│   │       ├── bootstrap.ts    # Composition root seam for workflow feature gate
│   │       ├── schema.ts       # Migration runner for workflow schema (server/db/workflow)
│   │       ├── api.ts          # HTTP routes (/api/workflow/{list,resolve,evidence,complete,etc})
│   │       ├── store.ts        # Read model, query builders, transaction management
│   │       ├── types.ts        # Discriminated unions for packet/decision/checkpoint states
│   │       ├── policy.ts       # Role-based access control (operator vs agent)
│   │       ├── readModel.ts    # Packet/decision current state views
│   │       ├── attention.ts    # Attention mark (user-facing checkpoint highlights)
│   │       ├── ports.ts        # Port/port-attachment event structures
│   │       └── dashboard.ts    # Web UI for workflow operations
│   │
│   ├── db/                     # Database schema and migrations
│   │   ├── 001_initial.sql     # thoughts, metadata, created_at/updated_at
│   │   ├── 002_needs_embedding.sql # embedding queue columns, embedding_model
│   │   ├── 003_search_text_and_recall_queries.sql # search_vector (tsvector), recall_events
│   │   ├── 004_worker_runs.sql      # worker telemetry table
│   │   ├── 005_feedback_events.sql  # feedback for recall quality
│   │   ├── 006_tags_replace_profile.sql # tags array, supersedes profile enum
│   │   ├── schema.sql          # Full static schema (reference only, not run as migration)
│   │   ├── search.sql          # Indexes on thoughts (search_vector, embedding)
│   │   ├── graph.sql           # Apache AGE graph schema (memory_graph)
│   │   │
│   │   └── workflow/           # Workflow Operations migrations (applied only when FEATURE_WORKFLOW=true)
│   │       └── *.sql           # Packet, decision, checkpoint, checkpoint_item schemas
│   │
│   ├── tests/                  # Deno test files
│   │   ├── search-mmr.test.ts  # MMR re-ranking behavior tests
│   │   ├── workflow-mvp-e2e.test.ts # Full workflow path (ST-086)
│   │   ├── awcp-cli.test.ts    # CLI integration tests
│   │   ├── fixtures/           # Test data, corpus, seeds
│   │   └── _helpers/           # Test utilities
│   │
│   └── scripts/                # Operational scripts
│       └── awcp.ts             # CLI for workflow checkpoint creation
│
├── contact-memory/             # Contact Memory MVP (Deno, optional)
│   ├── README.md               # Local CLI usage guide
│   ├── deno.json               # Deno project manifest
│   │
│   ├── cli/                    # Interactive review CLI
│   │   └── index.ts            # Export parser, review loop, MCP commits
│   │
│   ├── parser/                 # WhatsApp export parsing
│   │   ├── whatsapp.ts         # WhatsApp text format parser
│   │   ├── extractor.ts        # LLM extraction of contact facts
│   │   └── types.ts            # ContactExtraction, Message, Shard schema definitions
│   │
│   ├── runtime/                # Runtime provider plugins
│   │   ├── agent.ts            # MCP client wrapper
│   │   └── providers/          # LLM provider integrations (Anthropic)
│   │
│   └── tests/                  # Test suites for contact-memory
│       ├── cli/
│       ├── parser/
│       ├── runtime/
│       ├── commit/
│       ├── fixtures/           # Sample WhatsApp exports
│       └── fixtures/whatsapp/  # Parsed export test data
│
├── src/                        # C# / .NET 8 (Skeletal, not active)
│   ├── AiMemory.Core/          # Core library placeholder
│   │   ├── AiMemory.Core.csproj
│   │   └── IMemoryService.cs   # Interface definition only
│   │
│   └── AiMemory.Server/        # Server project (not implemented)
│
├── tests/                      # .NET test project (Skeletal)
│   └── AiMemory.Tests/
│       ├── AiMemory.Tests.csproj
│       └── SmokeTests.cs       # Placeholder test
│
├── tools/                      # Operational tooling
│   └── GovernanceAssetValidator/  # C# CLI for governance asset frontmatter
│       └── GovernanceAssetValidator.csproj
│
├── docs/                       # Design and planning docs
│   ├── architecture/           # Architecture overviews (Contact Memory ADR)
│   ├── design/                 # System design and ADRs (ADR-001 through ADR-011)
│   ├── requirements/           # SRS.md, SystemDesign.md
│   ├── planning/               # Delivery plan
│   ├── investigations/         # Research and problem investigations
│   ├── solutions/              # Documented solutions, tagged by category
│   ├── residual-review-findings/  # Code review findings backlog
│   ├── governance/             # Governance assets (tagged, versioned)
│   └── workflow-mvp.md         # Workflow Operations design overview
│
├── .github/                    # GitHub configuration
│   ├── workflows/              # CI/CD pipelines
│   ├── prompts/                # OpenCode prompts (Copilot CLI)
│   ├── instructions/           # Coding standards, governance rules
│   ├── skills/                 # Agent skills (CE compound-engineering)
│   ├── reviews/                # Review templates
│   └── planning/               # Story board, execution plans
│       ├── story-board.md      # Live board (Backlog / In Progress / Review / Done)
│       ├── execplans/          # Historical ExecPlan documents (ST-NNN)
│       └── query-packets/      # Query scope packets before planning
│
├── .planning/                  # GSD planning artifacts (generated, not source)
│   ├── codebase/               # ← You are here: ARCHITECTURE.md, STRUCTURE.md, etc
│   └── graphs/                 # Knowledge graph snapshots
│
├── .opencode/                  # OpenCode config (gitignored, generated from .example)
├── .vscode/                    # VS Code workspace config, MCP client setup
├── docker/                     # Docker build artifacts
│   └── postgres-age/           # Postgres 15 + pgvector + Apache AGE Dockerfile
│
├── docker-compose.yml          # Dev stack: db, mcp, optional mcp-test
├── docker-compose.workflow.yml # Workflow-specific compose overrides
│
├── .env.example                # Environment template (secrets placeholder)
├── .env.dev.example            # Development defaults
├── .editorconfig               # Editor formatting rules
├── .gitignore                  # Ignore secrets, node_modules, bin/obj
├── CLAUDE.md                   # Canonical governance for Claude agents
├── CONCEPTS.md                 # Shared domain vocabulary
├── STRATEGY.md                 # Product strategy and approach
├── README.md                   # Quickstart and overview
└── global.json                 # .NET global manifest
```

## Directory Purposes

**`server/`:**
- Purpose: Active Deno MCP server (TypeScript) — capture, search, graph traversal, entity extraction, consolidation
- Contains: Composition root (index.ts), service modules (src/), database migrations (db/), tests, operational scripts
- Key files: `server/index.ts` (entry point), `server/src/*.ts` (services), `server/db/*.sql` (schema)

**`server/src/`:**
- Purpose: Core service modules for search, embeddings, workers, auth, context parsing
- Contains: ~17 .ts files + workflow/ subdirectory
- Key patterns: Stateless request handlers, fire-and-forget background work, Postgres pool access via shared `sql` export

**`server/src/workflow/`:**
- Purpose: Opt-in (FEATURE_WORKFLOW=true) operational surface for structured decision verification
- Contains: Schema, API routes, permission policy, read model
- Key files: `bootstrap.ts` (feature gate), `api.ts` (HTTP routes), `store.ts` (persistence)

**`server/db/`:**
- Purpose: Database schema versioning and migrations
- Contains: Numbered .sql files (001-006), plus schema.sql (reference), graph.sql (AGE), search.sql (indexes)
- Pattern: Applied once on startup via migrate.ts; tracked in schema_migrations table

**`server/tests/`:**
- Purpose: Deno test files for server behavior
- Contains: MMR tests, workflow E2E tests, CLI tests, fixtures
- Pattern: Run with `docker compose --profile test exec mcp-test deno test ...`

**`contact-memory/`:**
- Purpose: Local MVP tooling for WhatsApp → reviewed Contact Memory shards
- Contains: CLI (interactive review), parser (WhatsApp text format), runtime (MCP client)
- Key files: `cli/index.ts` (main entry point), `parser/extractor.ts` (LLM), `parser/types.ts` (schema)

**`src/` (C#/.NET):**
- Purpose: Placeholder for future local Obsidian synthesis companion (not active)
- Contains: Core library interface, server project stub
- Status: Skeletal; no implementation until ST-019

**`tests/` (C#/.NET):**
- Purpose: Placeholder test project for .NET companion
- Contains: SmokeTests.cs (placeholder only)
- Status: Skeletal

**`docs/`:**
- Purpose: Design docs, ADRs, requirements, investigations, solutions
- Contains: ADR-001 through ADR-011, SRS.md, SystemDesign.md, architecture decisions for Contact Memory
- Key files: `docs/design/adr/` (decisions), `docs/requirements/SRS.md` (spec), `docs/architecture/ai_memory_architecture_decisions.md` (Contact track)

**`.github/planning/`:**
- Purpose: Execution planning and story board
- Contains: story-board.md (Backlog/In Progress/Review/Done), execplans/exec-plan-ST-NNN (historical), query-packets/
- Key files: `story-board.md` (live board), `execplans/` (historical artifact storage)

**`.planning/codebase/` (You are here):**
- Purpose: GSD codebase analysis artifacts
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md, STACK.md, INTEGRATIONS.md
- Pattern: Generated by `/gsd-map-codebase`, consumed by `/gsd-plan-phase` and `/gsd-execute-phase`

## Key File Locations

**Entry Points:**
- `server/index.ts`: MCP server startup, McpServer creation, tool registration, worker startup, Hono app mount
- `contact-memory/cli/index.ts`: WhatsApp export parsing and interactive review
- `tools/GovernanceAssetValidator/`: CLI for validation of governance assets

**Configuration:**
- `.env.example`: Environment variable template (secrets placeholder)
- `docker-compose.yml`: Dev stack (db + mcp, optional mcp-test with profile)
- `server/deno.json`: Deno project config, import map
- `.github/workflows/`: CI/CD pipeline definitions

**Core Logic:**
- `server/src/searchQuality.ts`: BM25 + vector hybrid search, RRF fusion, MMR reranking
- `server/src/entityWorker.ts`: Background entity extraction polling
- `server/src/consolidationWorker.ts`: Background consolidation scoring and promotion
- `server/src/embeddings.ts`: OpenRouter provider state machine

**Database:**
- `server/db/001_initial.sql` through `006_tags_replace_profile.sql`: Sequential migrations
- `server/db/schema.sql`: Full schema reference (not run as migration)
- `server/db/graph.sql`: Apache AGE knowledge graph schema
- `server/db/workflow/`: Workflow-specific migrations (opt-in)

**Testing:**
- `server/tests/search-mmr.test.ts`: MMR diversity testing
- `server/tests/workflow-mvp-e2e.test.ts`: Full workflow path (ST-086)
- `tests/AiMemory.Tests/SmokeTests.cs`: Placeholder .NET tests

## Naming Conventions

**Files:**
- TypeScript: camelCase (e.g., `searchQuality.ts`, `entityWorker.ts`)
- C#: PascalCase (e.g., `AiMemory.Core.csproj`, `IMemoryService.cs`)
- SQL migrations: `NNN_description.sql` (e.g., `001_initial.sql`, `003_search_text_and_recall_queries.sql`)
- Test files: `*.test.ts` for Deno, `*Tests.cs` for .NET

**Functions:**
- TypeScript: camelCase (e.g., `rrfFuse()`, `deriveQualityBand()`, `escapeForCypher()`)
- C#: PascalCase (e.g., `GetMemory()`, `CaptureThought()`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `POLL_INTERVAL_MS`, `MAX_CONTENT_BYTES`, `ALLOWED_LABELS`)
- Locals: camelCase (e.g., `normalizedQuery`, `topIds`, `boosted`)
- Module-level exports: camelCase (e.g., `sql`, `server`)

**Types:**
- TypeScript interfaces: PascalCase (e.g., `ContextScope`, `RrfLaneRow`, `ExtractionResult`)
- TypeScript enums: PascalCase values (e.g., `memory_type: "shard" | "wiki"`)
- C#: PascalCase (e.g., `IMemoryService`, `ContactExtraction`)

**Database:**
- Tables: snake_case (e.g., `thoughts`, `entity_extraction_queue`, `schema_migrations`)
- Columns: snake_case (e.g., `content_fingerprint`, `memory_type`, `created_at`)
- Indexes: `ix_<table>_<cols>` pattern (e.g., `ix_thoughts_search_vector`)

**API/HTTP:**
- Routes: kebab-case paths (e.g., `/mcp`, `/health`, `/ready`, `/api/workflow/list`)
- Query params: snake_case (e.g., `limit`, `context`, `dry_run`)
- JSON fields: snake_case (e.g., `memory_type`, `project`, `content_fingerprint`)

## Where to Add New Code

**New MCP Tool:**
1. **Define tool in** `server/index.ts` — call `server.registerTool("tool_name", {...schema...}, handler)`
2. **Implement handler** — either inline or extracted to `server/src/<domain>.ts` (e.g., consolidationWorker.ts exports drainPendingOnce() called by consolidate tool)
3. **Add tests** in `server/tests/<feature>.test.ts`
4. **Document** in tool schema description + `README.md` if new capability tier

**New Background Worker:**
1. **Export start function** from `server/src/<worker>.ts` (e.g., `startEntityWorker()`)
2. **Call from** `server/index.ts` composition root (line ~50-80, before Deno.serve)
3. **Use Postgres pool** via `import { sql } from "./db.ts"` (module-level singleton)
4. **Log with** `console.log("[<worker>] ...")` prefix for consistent formatting
5. **Implement polling** with FOR UPDATE SKIP LOCKED for concurrency safety
6. **Add tests** in `server/tests/` covering happy path and failure modes

**New Service Module:**
1. **Create** `server/src/<feature>.ts` with pure functions (no global state)
2. **Export** functions and types; import from `db.ts` if database access needed
3. **Use consistent error handling**: throw for validation/auth, return null for degradation (embedding timeout)
4. **Add tests** in `server/tests/<feature>.test.ts`
5. **Import in** `server/index.ts` for composition

**New Database Migration:**
1. **Create** `server/db/NNN_description.sql` (increment version number, match naming convention)
2. **Use idempotent patterns**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
3. **Update** workflow migrations in `server/db/workflow/` if Workflow Operations schema changes
4. **Test** with `docker compose --profile test up` and verify schema
5. **Document** schema change in `server/db/schema.sql` (reference only)

**New Workflow Route (if FEATURE_WORKFLOW=true):**
1. **Define in** `server/src/workflow/api.ts` — add route via `app.post("/api/workflow/...")`
2. **Apply auth** via `requireApiKey()` check (composition root applies this; see index.ts ~1220)
3. **Check operator requirement** via `requiresOperator(routeName)` policy (policy.ts)
4. **Implement handler** — call store functions from `server/src/workflow/store.ts`
5. **Add tests** in workflow integration test file

**New Contact Memory Feature:**
1. **Parser changes** → `contact-memory/parser/{whatsapp,extractor,types}.ts`
2. **CLI changes** → `contact-memory/cli/index.ts`
3. **Tests** → `contact-memory/tests/{cli,parser,runtime}/`
4. **Update README** with usage if CLI flags/behavior change

**New .NET Feature (Future, ST-019):**
1. **Add to** `src/AiMemory.Core/` (interfaces, domain model)
2. **Implement in** `src/AiMemory.Server/` (MCP client wrapper, Obsidian synthesis logic)
3. **Test in** `tests/AiMemory.Tests/`
4. **Follow** coding standards in `.github/instructions/coding-standards.instructions.md`

## Special Directories

**`server/db/workflow/`:**
- Purpose: Workflow Operations schema migrations (separate from platform migrations)
- Generated: No (manually authored)
- Committed: Yes (part of source control)
- Applied: Only when `FEATURE_WORKFLOW=true` env var is set; bootstrapWorkflow() runner enforces this

**`server/tests/fixtures/`:**
- Purpose: Test data and corpus
- Generated: Partially (some test data may be generated by seeding scripts)
- Committed: Yes (fixtures are part of test harness)
- Usage: Loaded by test setup to populate mcp-test container's ephemeral DB

**`.opencode/` and generated `opencode-mcp.json`:**
- Purpose: OpenCode client configuration (Copilot CLI)
- Generated: Yes (from `.opencode/config.example.json` and `opencode-mcp.json.example` templates)
- Committed: No (gitignored; only .example templates are committed)
- Secrets: .example templates have `******` placeholders; actual values generated by `sync-api-key.sh`

**`.github/planning/execplans/`:**
- Purpose: Historical execution plans (ST-NNN format, pre-unified-plan era)
- Generated: Yes (by operator using `/plan` Copilot prompt or by hand)
- Committed: Yes (historical artifact storage)
- Superceded: By unified `docs/plans/` format (newer stories use that; existing ExecPlans remain)

**`docs/solutions/`:**
- Purpose: Documented solutions to recurring problems
- Generated: No (authored by hand after solving problems)
- Committed: Yes (part of tribal knowledge base)
- Format: Markdown with YAML frontmatter (`module`, `tags`, `problem_type`)

---

*Structure analysis: 2026-08-05*
