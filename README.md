# ai-memory

**A long-lived memory service for AI coding agents — and for the humans working alongside them.**

ai-memory is a self-hosted MCP server that gives every AI tool you use (Claude, Copilot, ChatGPT, custom agents, your own scripts) a shared, persistent place to read and write what's worth remembering. The same store is yours: it remembers things *about* you and *for* you across sessions, projects, and tools.

> **Status:** Early development. The cloud MCP server is functional end-to-end (search, capture, graph traversal, entity extraction). The local Obsidian-synthesis companion is planned but not yet built. See the [story board](.github/planning/story-board.md) for current scope.

---

## Why this exists

Most agent tools have either no memory or a per-conversation scratchpad. That means:

- Context you taught Claude on Tuesday is gone when you open Copilot on Wednesday.
- Every coding session re-explains the same project conventions, the same blockers, the same naming preferences.
- Knowledge that *should* compound — what a function did six months ago, why an ADR was overturned, what a colleague flagged last quarter — leaks out of the loop.

ai-memory is a single endpoint any MCP-aware agent can call to *capture* a thought and later *retrieve* it. The retrieval is hybrid (BM25 + vector + graph) so it works whether you remember a phrase, an idea, or the relationship between two things.

It is intentionally **single-user-first** (one person's memory across all the tools they use) but **multi-user-ready** (the storage architecture doesn't foreclose scoping by user, only by `project` and `profile`).

---

## How it's built

```
┌─────────────────────────────────────────────────────────────────────┐
│  AI agents / your scripts / ChatGPT          │  You (CLI / web)     │
│  (Claude Code, Copilot, custom MCP clients)  │                      │
└──────────────────────┬────────────────────────┴──────────────────────┘
                       │ MCP over HTTP (Bearer auth)
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloud MCP server  (Deno 2.0 / TypeScript / Hono)                   │
│  ── search_thoughts ── capture_thought ── list_thoughts             │
│  ── thought_stats  ── graph_traverse  ── graph_search               │
│  ── search / fetch (ChatGPT compatibility)                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 15  +  pgvector (HNSW)  +  Apache AGE                   │
│  thoughts table │ tsvector (BM25) │ vector(512) │ memory_graph      │
└─────────────────────────────────────────────────────────────────────┘
```

**Hybrid retrieval.** `search_thoughts` runs a BM25 lane (Postgres `ts_rank_cd`) and a vector lane (`pgvector` cosine, 512-dim embeddings from OpenRouter's `text-embedding-3-small`) in parallel, fuses them with Reciprocal Rank Fusion (k=60), applies an optional in-project boost, then re-ranks with MMR (λ=0.7) for diversity. See [`server/src/searchQuality.ts`](server/src/searchQuality.ts).

**Graph traversal.** Captured thoughts are processed by a background entity-extraction worker that populates an Apache AGE knowledge graph. `graph_search` lets agents traverse relationships from a named entity up to N hops; `graph_traverse` accepts read-only openCypher MATCH queries for advanced use.

**Context scoping.** Every tool accepts a `context` string like `"project:zoom,profile:professional,strict"` so the same memory store can hold work, personal, and per-project knowledge without bleed-through.

The future **local Obsidian-synthesis companion** (`src/`, C# / .NET 8, planned) will be an MCP *client* — it'll periodically pull from the cloud MCP and write Markdown summaries into an Obsidian vault you own, with `[[wiki-links]]` and YAML frontmatter, using local Ollama for LLM cost control.

---

## Quickstart

### Prerequisites

- Docker + Docker Compose
- An [OpenRouter](https://openrouter.ai) API key (used for embeddings + entity extraction)

You do **not** need Deno or Postgres installed locally — both run in containers.

### 1. Configure secrets

```bash
cp .env.example .env
# Edit .env and fill in:
#   MEMORY_API_KEY   — generate with: openssl rand -hex 32
#   DB_PASSWORD      — generate with: openssl rand -hex 16
#   OPENROUTER_API_KEY — from openrouter.ai
```

### 2. Bring up the stack

```bash
docker compose up -d
```

This builds two images:
- **`db`** — Postgres 15 with `pgvector` and Apache AGE pre-loaded (built from [`docker/postgres-age/Dockerfile`](docker/postgres-age/Dockerfile))
- **`mcp`** — the Deno MCP server (built from [`server/Dockerfile`](server/Dockerfile))

The `./server` directory is bind-mounted to `/app` in the `mcp` container, so editing TypeScript files on the host is picked up live without rebuilding.

### 3. Verify it's up

```bash
curl http://localhost:3000/health
# → ok
```

### 4. Connecting Clients

The MCP server uses **Streamable HTTP transport** at `http://localhost:3000/mcp`. Every request requires an `Authorization: Bearer <MEMORY_API_KEY>` header. Ensure `MEMORY_API_KEY` is set in your environment before configuring clients.

#### VS Code Copilot

The workspace already includes `.vscode/mcp.json` which auto-configures the connection. Ensure `MEMORY_API_KEY` is set in your shell environment before launching VS Code:

```powershell
# Windows (PowerShell) — add to your $PROFILE or set as a system env var
$env:MEMORY_API_KEY = "your-key-here"
code .
```

The committed workspace config currently uses `http://127.0.0.1:3000/mcp` for the VS Code MCP client path. On some Windows hosts, VS Code fetch can fail against `localhost` when it resolves to IPv6 loopback (`::1`) while the IPv4 loopback path succeeds.

After VS Code starts, open the MCP server panel and confirm `ai-memory` appears as a configured server.

#### Claude Code

Use the **user-level** setup method (not project-level `.mcp.json`) so this server is available across your projects. Claude Code stores user-scoped MCP servers in `~/.claude.json`.

Add the server with the CLI:

```bash
claude mcp add --transport http --scope user ai-memory http://localhost:3000/mcp \
  --header "Authorization: Bearer YOUR_MEMORY_API_KEY"
```

Equivalent JSON server entry:

```json
{
  "type": "http",
  "url": "http://localhost:3000/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_MEMORY_API_KEY"
  }
}
```

Claude Code docs explicitly confirm environment-variable expansion in project-level `.mcp.json` (including `url` and `headers`). For user-level `~/.claude.json`, prefer adding the server via `claude mcp add` unless you have verified interpolation behavior in your installed version.

#### Claude Desktop

Open Claude Desktop, then go to **Settings → Developer → Edit Config**.

Configuration file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Current official documentation confirms where Claude Desktop MCP configuration lives, but does not confirm this exact JSON shape for a localhost Streamable HTTP server. Verify the current Claude Desktop release before adding ai-memory there.

#### Verify connectivity

From a connected client, call `thought_stats`. A successful non-error text response containing `Total active thoughts:` confirms the server connection is working.

**Raw HTTP (curl):** The server uses Streamable HTTP transport — clients must accept SSE:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $MEMORY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"thought_stats","arguments":{}}}'
```

Expected response (SSE framed):

```
event: message
data: {"result":{"content":[{"type":"text","text":"Total active thoughts: ..."}]},"jsonrpc":"2.0","id":1}
```

If you get HTTP 406, ensure the `Accept` header includes both `application/json` and `text/event-stream`.

#### Client troubleshooting

`MCP error -32601` on `prompts/list` or `resources/list` means a client probed an MCP method the server did not implement. After ST-057, `prompts/list`, `resources/list`, and `resources/templates/list` are compatibility-safe on ai-memory.

`ProviderModelNotFoundError` is an OpenCode provider/model configuration issue, not an ai-memory MCP server error.

`@opencode-ai/plugin@local` install failure is an OpenCode plugin/dependency configuration issue, not an ai-memory MCP server error.

### Running tests

```bash
# Start the test infrastructure (ephemeral DB + seeded corpus + test MCP server)
docker compose --profile test up -d

# All server tests (run inside the mcp-test container)
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/

# A single test file
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-mmr.test.ts

# Intentional lock refresh (only when dependencies/imports changed)
docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts
```

The `.NET` solution (governance tooling + the planned local synthesis companion) is built and tested with the standard `dotnet` CLI:

```bash
dotnet build src/AiMemory.sln
dotnet test
```

---

## MCP tools exposed

| Tool | Purpose |
|---|---|
| `capture_thought` | Save a new thought. Generates an embedding asynchronously. Dedupes by content fingerprint. |
| `search_thoughts` | Hybrid BM25 + vector search with RRF fusion and MMR re-ranking. Supports context scoping. |
| `list_thoughts` | Recent thoughts, filterable by `memory_type`, `project`, `days`. |
| `thought_stats` | Totals broken down by memory type and project. |
| `graph_search` | Parameterised graph traversal from a named entity (safer; allow-listed relationship types). |
| `graph_traverse` | Read-only openCypher MATCH queries against the `memory_graph` (more powerful, more advanced). |
| `search` / `fetch` | ChatGPT-compatibility read-only tools. |

All tools live in [`server/index.ts`](server/index.ts) and share the Postgres pool from [`server/src/db.ts`](server/src/db.ts).

---

## How the project is built

This repo is **workflow-first**: implementation work flows through a board (`.github/planning/story-board.md`) → query packet → ExecPlan → execution. Each story has an ExecPlan precise enough that a stateless executor can follow it without improvising. The patterns are encoded in the prompt files under [`.github/prompts/`](.github/prompts/) (`/plan`, `/continue`, `/recover`, `/governance-review`).

The complete design rationale is documented:

- **Requirements:** [`docs/requirements/SRS.md`](docs/requirements/SRS.md)
- **Architecture:** [`docs/design/SystemDesign.md`](docs/design/SystemDesign.md)
- **Architecture Decision Records:** [`docs/design/adr/`](docs/design/adr/) (ADR-001 through ADR-011)
- **Delivery plan:** [`docs/planning/delivery-plan.md`](docs/planning/delivery-plan.md)
- **Investigations:** [`docs/investigations/`](docs/investigations/) — the research behind every Tier-1 decision, organised as compact landing pages with focused fragment files

For coding-agent-specific guidance, see [`CLAUDE.md`](CLAUDE.md).

---

## Status, roadmap, contributing

### What works today

- Capture + hybrid search + graph traversal + entity extraction worker, all via MCP over HTTP
- Recall-quality tests with a seeded corpus (BM25, vector, MMR, project boost, strict-flag, recall events)
- Postgres 15 + pgvector + Apache AGE in a single Docker Compose stack
- Bearer-auth gate; CORS for browser-based clients

### What's planned

- **Phase 2** — cloud deployment (managed Postgres + container hosting), full integration test suite in CI, worker observability + a `stats` MCP tool
- **Phase 3** — local Obsidian synthesis companion (C# / .NET 8 / MCP client / Ollama)

See [`.github/planning/story-board.md`](.github/planning/story-board.md) for live status.

### Contributing

This is an early-stage personal project shared publicly for transparency. If you're interested in using or extending it:

- Issues and PRs are welcome, but expect slower turnaround than a staffed project.
- All implementation work goes through the ExecPlan workflow — please open an issue first to discuss scope before opening a non-trivial PR.
- Coding conventions for the .NET portion are in [`.github/instructions/coding-standards.instructions.md`](.github/instructions/coding-standards.instructions.md). Conventions for the Deno portion are inferable from existing files in `server/`.

### License

No license file is currently committed. Until one is added, this code is "all rights reserved" by default. Open an issue if you want to use it for something specific and I'll prioritise picking a license.
