# QP-010: Integration Testing for Cloud MCP (Deno + Docker Compose)

> Story: ST-010
> Status: Scoped — ready for Phase 2 ExecPlan
> Created: 2026-05-27

---

## PO Intent

Create a unified end-to-end (E2E) integration test suite exercising the cloud MCP server over HTTP, and a GitHub Actions CI pipeline that runs these tests on every push. The existing 8 individual E2E test files will be consolidated into a single `e2e.test.ts` file to reduce maintenance surface.

## Problem Statement

The project has 10 test files covering various aspects of the MCP server but:
1. No CI pipeline exists — tests only run manually via `docker compose --profile test exec mcp-test deno test`
2. Several acceptance criteria (full capture→search BM25 path, capture→vector retrieval, consolidation→queryable wiki) lack dedicated E2E coverage
3. Eight individual E2E test files overlap in infrastructure concerns (MCP client helpers, setup/teardown) and create maintenance burden

## PO Decisions (from scoping rounds 2026-05-27)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test level | HTTP-level E2E via mcp-test container | Real server, real DB — matches existing pattern |
| CI platform | GitHub Actions with Docker Compose | Standard; no additional infra needed |
| Restructure scope | Consolidate E2E tests into one file; keep unit tests separate | One authoritative E2E file; unit tests have value alone |
| Unified file name | `server/tests/e2e.test.ts` | Clear purpose |
| Old E2E files | Delete after merge | Git history preserves originals; clean maintenance |
| Embedding wait | DB polling (retry loop checking embedding IS NOT NULL) | Deterministic, no brittle sleeps |
| CI embeddings | Pre-seed embeddings via SQL fixtures (no live OpenRouter in CI) | Eliminates external dependency; CI is hermetic |
| Out of scope | Nothing excluded | All board ACs in scope |

## Scope

### In scope

1. **Unified `server/tests/e2e.test.ts`** replacing these 8 files:
   - `entity-worker.test.ts`
   - `entity-mentions.test.ts`
   - `consolidation-worker.test.ts`
   - `search-project-boost.test.ts`
   - `search-mmr.test.ts`
   - `search-recall-events.test.ts`
   - `search-recall-quality.test.ts`
   - `search-strict-flag.test.ts`

2. **E2E flows covering all ST-010 ACs:**
   - AC1: `capture_thought` → `search_thoughts` returns via BM25 lane
   - AC2: `capture_thought` + embedding polled → `search_thoughts` returns via vector lane (pre-seeded embedding in fixture)
   - AC3: Shard promoted to wiki via `consolidate` tool → both queryable
   - AC4: Entity extraction populates AGE graph → `graph_traverse`/`graph_search` returns nodes
   - AC5: Context-scoped search (project + profile filtering, strict vs non-strict)
   - AC6: Recall event tracking (search → `recall_events` row created)

3. **Pre-computed embeddings** in test fixture SQL for CI-hermetic vector-lane tests

4. **GitHub Actions workflow** (`.github/workflows/ci.yml`):
   - Triggers on push to main and pull requests
   - Spins up `docker compose --profile test up -d`
   - Waits for services healthy
   - Runs `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/`
   - Reports test results

5. **Delete old merged test files**

### Kept separate (not merged)

- `parseContext.test.ts` — pure unit test of context string parsing
- `consolidation-scoring.test.ts` — pure unit test of scoring arithmetic

### Out of scope

- Performance/load testing
- N:1 consolidation testing (ST-031)
- Non-Docker CI runners (self-hosted, etc.)

## Research Findings

### Current test infrastructure

- **MCP client helper:** `server/tests/_helpers/mcpClient.ts` — shared `mcpCall(tool, args)` over HTTP JSON-RPC + SSE parsing
- **Docker Compose test profile:** `db-test` (ephemeral tmpfs), `seed` (loads corpus SQL), `mcp-test` (port 3001)
- **Seed corpus:** `server/tests/fixtures/search-quality-corpus.sql` — 29 thoughts with 512-dim embeddings
- **Consolidation fixtures:** `server/tests/fixtures/consolidation-corpus.sql` — used by consolidation test setup
- **Workers disabled in mcp-test:** `CONSOLIDATION_WORKER_DISABLED=true` — allows explicit `consolidate` tool calls without races

### Existing test patterns

- Tests use `Deno.test("name", async () => {...})`
- Direct DB access via `import { sql } from "../src/db.ts"` for setup/teardown/assertions
- `mcpCall(tool, args)` for MCP HTTP calls
- Deterministic UUIDs for test data isolation
- Self-contained cleanup: each test group manages its own rows

### MCP tools available for testing

| Tool | Purpose |
|------|---------|
| `capture_thought` | Insert thought (triggers async embedding + entity extraction) |
| `search_thoughts` | Hybrid BM25 + vector search with RRF + MMR |
| `search` | Vector-only search (ChatGPT compat) |
| `fetch` | Get thought by ID |
| `list_thoughts` | List with filters |
| `thought_stats` | Counts |
| `graph_traverse` | Raw openCypher MATCH |
| `graph_search` | Parameterized graph traversal |
| `consolidate` | Manual consolidation sweep |

### CI considerations

- No `.github/workflows/` directory exists yet — this story creates it
- Docker Compose services need `.env` variables: `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`
- For CI: `OPENROUTER_API_KEY` can be a dummy value (embedding generation will fail gracefully; tests use pre-seeded embeddings)
- `mcp-test` healthcheck confirms server is ready before tests run
- `search-quality-corpus.sql` is auto-loaded by the `seed` service into `db-test`

## Key Files

- Board entry: `.github/planning/story-board.md` (ST-010 section)
- Test helper: `server/tests/_helpers/mcpClient.ts`
- Docker Compose: `docker-compose.yml` (test profile lines 44–98)
- Search corpus fixture: `server/tests/fixtures/search-quality-corpus.sql`
- Consolidation corpus: `server/tests/fixtures/consolidation-corpus.sql`
- MCP server: `server/index.ts`
- Schema: `server/db/schema.sql`
