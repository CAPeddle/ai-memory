# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

ai-memory is a persistent memory service for AI coding agents. It currently ships as a **cloud-hosted MCP server** (Deno/TypeScript) backed by **PostgreSQL 15 + pgvector + Apache AGE**. A future **local synthesis companion** (C#/.NET 8) is scaffolded but not yet implemented.

## Two stacks coexist — don't confuse them

| Path | Stack | Status | Purpose |
|---|---|---|---|
| `server/` | Deno 2.0 / TypeScript / Hono / `@modelcontextprotocol/sdk` | **Active** — feature work happens here | Cloud MCP server (search, capture, graph traversal, entity worker) |
| `src/`, `tests/` | C# 12 / .NET 8 / xUnit / FluentAssertions / NSubstitute | **Skeletal** (placeholder `SmokeTests` only) | Reserved for ST-019 local Obsidian synthesis service |
| `tools/GovernanceAssetValidator/` | C# / .NET 8 | Active | CLI that builds/validates the governance asset catalog from frontmatter |

**Architectural divergence to be aware of:** [.github/copilot-instructions.md](.github/copilot-instructions.md) and [.github/prompts/*.prompt.md](.github/prompts/) still describe "C# / SQLite / FTS5" as the architectural default. That was the v1 vision. [ADR-009](docs/design/adr/ADR-009-deployment-model.md) and [ADR-011](docs/design/adr/ADR-011-storage-strategy.md) superseded it: the cloud MCP is now Deno + Postgres. When the prompt files and the ADRs disagree, **the ADRs win**.

## Source-of-truth precedence

Higher tier wins on conflict unless the PO explicitly overrides:

1. **Tier 1 (binding):** [docs/requirements/SRS.md](docs/requirements/SRS.md), [docs/design/adr/](docs/design/adr/) (ADR-001..ADR-011 — note ADR-011 supersedes ADR-002), [docs/design/SystemDesign.md](docs/design/SystemDesign.md), [docs/planning/delivery-plan.md](docs/planning/delivery-plan.md)
2. **Tier 2 (reference):** `docs/investigations/*` — each is a compact landing page with detailed fragments in a same-name folder. Link to the landing page by default; link to a fragment only when citing a precise section.

## Workflow gate — DO NOT skip

Implementation work is gated by a written ExecPlan. Workflow is enforced via prompts in [.github/prompts/](.github/prompts/):

- `/plan-new` and `/plan` — collaborative scoping with the PO (Phase 1 query packet → Phase 2 ExecPlan). Planning must be back-and-forth with the PO via `vscode_askQuestions`; never unilateral.
- `/continue` — mechanically executes Ready ExecPlans.
- `/recover` — forensic analysis of failed sessions; annotates the ExecPlan so the next `/continue` succeeds. Never re-executes failed work directly.

**Board:** [.github/planning/story-board.md](.github/planning/story-board.md). **WIP limits: 1 In Progress, 1 in Review.** Trivial docs/housekeeping edits are fine without an ExecPlan as long as they don't conflict with an active story or change governance.

Session handoff lives in [FollowUpSessionLog.txt](FollowUpSessionLog.txt) — replace (not append), max 40 lines, parseable by a fresh agent.

## Common commands

### Cloud MCP (Deno, runs in container — host Deno is NOT a prerequisite)

```powershell
# Bring up the dev stack (Postgres + pgvector + AGE, plus the Deno MCP server)
docker compose up -d

# Bring up the test stack (adds ephemeral db-test, seed corpus, mcp-test)
docker compose --profile test up -d

# Run a single Deno test file inside the mcp-test container
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-mmr.test.ts

# Run all server tests
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/

# Tail the MCP server logs
docker compose logs -f mcp

# Health check (Bearer auth NOT required on /health)
curl http://localhost:3000/health
```

**Dev vs Test isolation:** The default `docker compose up -d` starts only `db` + `mcp` (persistent dev data). The `--profile test` flag adds `db-test` (ephemeral, tmpfs — wiped on stop), `seed` (loads test corpus into `db-test`), and `mcp-test` (connects to `db-test`, port 3001). Tests never touch the dev database.

The `./server` directory is bind-mounted to `/app` in the `mcp` container ([docker-compose.yml:33](docker-compose.yml#L33)), so file edits are picked up live without rebuilding. `.env` must define `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY` (see [.env.example](.env.example)).

### .NET (skeleton only at present)

```powershell
# Build the .NET solution (also runs all four analyzers; TreatWarningsAsErrors)
dotnet build src/AiMemory.sln

# Run all .NET tests
dotnet test

# Run a single .NET test
dotnet test --filter "FullyQualifiedName~SmokeTests.Placeholder_WhenExecuted_Passes"

# Build the governance asset catalog (writes JSON + Markdown index)
dotnet run --project tools/GovernanceAssetValidator -- build .

# Validate frontmatter across all governance assets
dotnet run --project tools/GovernanceAssetValidator -- validate .
```

## Repo-wide conventions and gotchas

### Line endings — non-trivial

[.gitattributes](.gitattributes) enforces:
- Text files (default): `eol=lf` in the working tree
- `*.bat`, `*.cmd`, `*.ps1`: `eol=crlf` in the working tree

Git's index (`i/`) is always LF for text files regardless of working-tree EOL. When verifying an EOL-related change, **`git status` clean is the real success indicator** — `git diff -w` is the minimal proof for a whitespace-scoped story. Don't run unrelated test suites as a "safety net" for an EOL-only story; match the verification command to the deliverable's scope.

### Docker — no `git clone` inside Dockerfiles

A corporate SSL proxy (Fortinet-style) intercepts HTTPS inside containers and breaks `git clone`. The mandated pattern (see [.github/instructions/coding-standards.instructions.md §Docker](.github/instructions/coding-standards.instructions.md)):

1. Download the release tarball on the Windows host.
2. Commit the tarball under `docker/<image>/`.
3. `COPY` and extract inside the Dockerfile.

Existing precedent: [docker/postgres-age/age-v1.6.0-rc0.tar.gz](docker/postgres-age/age-v1.6.0-rc0.tar.gz). Also verify version tags exist for the exact runtime (Apache AGE publishes per-Postgres-major tag namespaces — `PG15/v1.6.0-rc0` is not interchangeable with `PG17/v1.7.0`).

### .NET analyzers and warnings

[Directory.Build.props](Directory.Build.props) sets `TreatWarningsAsErrors=true` and runs four analyzers on every build: **NetAnalyzers, StyleCop, SonarAnalyzer, Meziantou**. New analyzer suppressions must be documented in [.editorconfig](.editorconfig) and logged in the active ExecPlan §6b Surprises & Discoveries.

### Conventional commits with story trailers

Every commit during ExecPlan execution uses Conventional Commits with a story+task footer ([.github/instructions/session-resilience.instructions.md](.github/instructions/session-resilience.instructions.md)):

```
feat(search): add MMR re-ranking pass

Story: ST-005
Task: §4.4
```

Update the active ExecPlan's §5b Recovery Ledger immediately after each commit.

## High-level architecture (cloud MCP)

The Deno MCP server in [server/](server/) is a thin Hono app over `@modelcontextprotocol/sdk`'s `StreamableHTTPTransport`. All requests to `/mcp` go through `requireApiKey` Bearer auth ([server/src/auth.ts](server/src/auth.ts)); `/health` is unauthenticated for Docker healthchecks.

**Transport contract (Streamable HTTP):** The SDK's transport layer enforces content negotiation. Clients **must** send `Accept: application/json, text/event-stream` — omitting this returns HTTP 406. Responses use SSE framing (`event: message\ndata: <JSON-RPC payload>\n\n`), not bare JSON. MCP client libraries handle this automatically; raw `curl` callers must parse the `data:` line from the SSE envelope. See [server/tests/_helpers/mcpClient.ts](server/tests/_helpers/mcpClient.ts) for the canonical request/response parsing pattern.

[server/index.ts](server/index.ts) registers six MCP tools that share the Postgres pool from [server/src/db.ts](server/src/db.ts):

- `search` / `fetch` — ChatGPT-compatible read-only tools (vector lane only)
- `search_thoughts` — hybrid BM25 (Postgres `ts_rank_cd`) + vector (`pgvector` cosine) fused via **Reciprocal Rank Fusion (k=60)**, with optional in-project boost (×1.2 when not strict) and **MMR re-rank (λ=0.7)** for diversity ([server/src/searchQuality.ts](server/src/searchQuality.ts))
- `capture_thought` — inserts a thought with a content-fingerprint upsert; embeddings are computed fire-and-forget via OpenRouter (`text-embedding-3-small`, 512-dim truncation)
- `list_thoughts`, `thought_stats` — filtered listings and counts
- `graph_traverse` / `graph_search` — read-only openCypher MATCH queries against the Apache AGE `memory_graph`. `graph_traverse` accepts raw Cypher (stripped of `$$` to block dollar-quote injection, MATCH-only); `graph_search` is the parameterised safer alternative with an allow-listed relationship set.

A background **entity-extraction worker** ([server/src/entityWorker.ts](server/src/entityWorker.ts)) is started at boot from `index.ts` and populates the AGE graph from new thoughts.

Database schema and graph DDL live in [server/db/schema.sql](server/db/schema.sql), [server/db/graph.sql](server/db/graph.sql), [server/db/search.sql](server/db/search.sql). The Postgres image is built from [docker/postgres-age/Dockerfile](docker/postgres-age/Dockerfile) (PG15 + pgvector + AGE).

Context scoping (`project:zoom,profile:professional,strict`) is parsed once in [server/src/parseContext.ts](server/src/parseContext.ts) and threaded through every tool.

## High-level architecture (.NET skeleton)

The .NET solution in [src/AiMemory.sln](src/AiMemory.sln) follows a strict Core/Server split per [.github/instructions/coding-standards.instructions.md](.github/instructions/coding-standards.instructions.md):

- **`AiMemory.Core`** has **zero framework dependencies** — no ASP.NET, no MCP SDK. Only domain models, interfaces, services.
- **`AiMemory.Server`** depends on Core; Core never depends on Server.
- **DI everywhere**, no static state, all I/O is async (`Async` suffix), parameterised SQL only.
- Tests use xUnit + FluentAssertions + NSubstitute; SQLite-backed integration tests use `:memory:`.

`AiMemory.Server/Program.cs` is currently a one-liner — populated by future stories.

## PO interaction (VS Code Copilot context)

When running in the Copilot/VS Code workflow, gather PO input via `vscode_askQuestions` (1–3 focused questions per round), not freeform text. Post a short context message with clickable links to the relevant artifact (board entry, ExecPlan, ADR) immediately before each question round.

## Auto-memory notes worth checking

The user's auto-memory (loaded into every session) currently asserts:

- **Tests run in `mcp-test`**, not `mcp`. Use `docker compose --profile test exec mcp-test deno test ...` in ExecPlan commands.
- **ExecPlan verification should match deliverable scope** — don't run unrelated test suites as a safety net.
- **Git EOL semantics:** `i/` is always LF for text; `w/` follows `eol=`; `git status` clean is the real success indicator.

These came from prior plan reviews and should keep applying. If you're about to act on a memory-recommended file/flag/function, verify it still exists before recommending (memories freeze in time).

## Session review — continuous improvement

At the end of each non-trivial session, review the work for **reusable nuggets** — recurring patterns, gotchas, workflow gaps, or conventions that a fresh agent would miss. When you identify one, suggest creating or updating:

- A **`.github/instructions/*.instructions.md`** file — for conventions, commands, or constraints that should auto-load into every Copilot session.
- A **skill** (`.github/skills/*/SKILL.md`) — for domain-specific procedural knowledge (multi-step workflows, research patterns).
- An update to **`CLAUDE.md`** or **`.github/copilot-instructions.md`** — for architectural context or workflow-level guidance.

Don't create these unilaterally — propose them to the PO with a one-line rationale. The goal is to compound project knowledge so future sessions start smarter.
