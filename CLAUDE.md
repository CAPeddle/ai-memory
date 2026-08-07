# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is also the canonical governance source for OpenCode sessions — see [AGENTS.md](AGENTS.md), which points back here rather than duplicating this content.

## What this repo is

ai-memory is a persistent memory service for AI coding agents. It currently ships as a **cloud-hosted MCP server** (Deno/TypeScript) backed by **PostgreSQL 15 + pgvector + Apache AGE**. A future **local synthesis companion** (C#/.NET 8) is scaffolded but not yet implemented.

The **Contact Memory product track** (Android app, WhatsApp parser, human review gate, Contact MCP) is defined in [docs/architecture/ai_memory_architecture_decisions.md](docs/architecture/ai_memory_architecture_decisions.md) — this document supersedes the platform architecture assumptions in `SRS.md` and `SystemDesign.md` for Contact Memory-specific work.

## Two stacks coexist — don't confuse them

| Path | Stack | Status | Purpose |
|---|---|---|---|
| `server/` | Deno 2.0 / TypeScript / Hono / `@modelcontextprotocol/sdk` | **Active** — feature work happens here | Cloud MCP server (search, capture, graph traversal, entity worker) |
| `src/`, `tests/` | C# 12 / .NET 8 / xUnit / FluentAssertions / NSubstitute | **Skeletal** (placeholder `SmokeTests` only) | Reserved for ST-019 local Obsidian synthesis service |
| `tools/GovernanceAssetValidator/` | C# / .NET 8 | Active | CLI that builds/validates the governance asset catalog from frontmatter |

**Architectural divergence to be aware of:** [.github/copilot-instructions.md](.github/copilot-instructions.md) and [.github/prompts/*.prompt.md](.github/prompts/) still describe "C# / SQLite / FTS5" as the architectural default. That was the v1 vision. [ADR-009](docs/design/adr/ADR-009-deployment-model.md) and [ADR-011](docs/design/adr/ADR-011-storage-strategy.md) superseded it: the cloud MCP is now Deno + Postgres. When the prompt files and the ADRs disagree, **the ADRs win**.

**Contact Memory track supersedes platform docs:** [docs/architecture/ai_memory_architecture_decisions.md](docs/architecture/ai_memory_architecture_decisions.md) contains the authoritative architecture for the Contact Memory product (Android app, WhatsApp parser, human review gate, Contact MCP). Its decisions supersede the platform-level assumptions in `docs/requirements/SRS.md` and `docs/design/SystemDesign.md` wherever they conflict.

### Contact Memory Supersession Map

For Contact Memory work, apply [docs/architecture/ai_memory_architecture_decisions.md](docs/architecture/ai_memory_architecture_decisions.md) and [ADR-012](docs/design/adr/ADR-012-tags-replace-binary-profile.md) over these older assumptions:

- **SRS §2, §4.3, §5.4, §5.5, §5.6:** The platform is no longer a three-tier Shards/Wiki/Views brain for Contact Memory. The platform stores append-only versioned shards only; wiki/consolidation/view promotion is product-layer. Contact Memory uses a human review gate and parser curation instead of the generic consolidation pipeline.
- **SRS §5.7, §5.8 and SystemDesign §1-§3:** Do not model Contact Memory as one shared REST+MCP service layer. Use per-product MCP/API boundaries: Platform MCP exposes shard primitives; Contact MCP exposes domain tools such as contact profiles, commitments, manual facts, and upcoming dates.
- **SRS §5.6, §5.8, §7 and ADR-008:** `profile: professional | personal` is superseded as a platform scoping primitive. Use `tags: string[]` with reserved tags such as `contact`, `developer`, `colleague`, `personal`, `professional`, plus namespaced tags like `project:*` and `contact:*`.
- **SystemDesign §4 and ADR-005:** Separate `semantic_memories` / `episodic_memories`, `memory_type = shard|wiki`, and platform-level Wiki tier assumptions are superseded for Contact Memory. Contact facts are curated shards with domain tags and provenance, not platform-promoted wiki rows.
- **ADR-006 and ADR-007:** Local Obsidian synthesis and generic Developer Memory consolidation are not blocking Contact Memory. Contact Memory's parser output commits curated knowledge directly after review; Developer Memory consolidation remains deferred/product-specific.
- **ADR-009 and ADR-011, for Contact Memory deployment only:** The Contact Memory target is Supabase local dev (`supabase start` + `deno serve`) and Supabase cloud + Edge Functions, with Postgres + pgvector + tsvector and Supabase Storage for WhatsApp exports. Do not assume the Contact product must use the existing Docker Compose MCP server or Apache AGE graph path unless a later Contact-specific decision reintroduces it.
- **ADR-010, for Android/API auth only:** Existing Bearer auth on `/mcp` remains valid for the current platform MCP. Android-to-Contact API authentication is still a Contact Memory design item and should not be copied blindly from the platform MCP auth model.

## Source-of-truth precedence

Higher tier wins on conflict unless the PO explicitly overrides:

1. **Tier 1 (binding):** [docs/requirements/SRS.md](docs/requirements/SRS.md), [docs/design/adr/](docs/design/adr/) (ADR-001..ADR-011 — note ADR-011 supersedes ADR-002), [docs/design/SystemDesign.md](docs/design/SystemDesign.md), [docs/architecture/ai_memory_architecture_decisions.md](docs/architecture/ai_memory_architecture_decisions.md) (Contact Memory track — supersedes SRS/SystemDesign on conflict), [docs/planning/delivery-plan.md](docs/planning/delivery-plan.md)
2. **Tier 2 (reference):** `docs/investigations/*`, `docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas. [CONCEPTS.md](CONCEPTS.md) — shared domain vocabulary (entities, named processes, status concepts); relevant when orienting to the codebase or discussing domain concepts.

## Workflow gate — DO NOT skip

Implementation work is gated by a written plan and tracked on the board — regardless of which tool is doing the work (Claude Code, OpenCode, or VS Code Copilot).

**Canonical plan format:** [docs/plans/*.md](docs/plans/) — the compound-engineering unified plan artifact (Product Contract / Requirements / Implementation Units, produced by `ce-brainstorm`/`ce-plan` or authored by hand in the same shape). Every plan's YAML frontmatter must include `story: ST-NNN` linking it to its board entry. This is now the canonical format for **new** plans, superseding `.github/planning/execplans/exec-plan-ST-NNN.md` — existing ExecPlans stay in place as historical record and are not retroactively converted.

**Before starting implementation** (via `ce-brainstorm`/`ce-plan`/`ce-work`, ad hoc, or any other path):
1. Confirm a story-board entry exists for the work; create one if it doesn't (next available `ST-NNN`).
2. Move it Backlog → In Progress, respecting **WIP limits: 1 In Progress, 1 in Review** on [.github/planning/story-board.md](.github/planning/story-board.md).
3. Once the plan file exists, cross-link it: the plan's `story:` frontmatter and the board entry's `Plan:` field must point at each other.

This is a **soft gate** — session discipline, not mechanical enforcement. Trivial docs/housekeeping edits are fine without a plan or board entry as long as they don't conflict with an active story or change governance.

**VS Code Copilot workflow (legacy, pending migration — ST-066):** `/plan-new`, `/plan`, `/continue`, and `/recover` in [.github/prompts/](.github/prompts/) still target the retired ExecPlan format and its §-numbered sections (Recovery Ledger, Execution Log), which have no equivalent in the unified `docs/plans/` format — execution progress there is derived from git history, not stored in the plan body. These prompts remain usable for existing In Progress ExecPlan-driven stories but should not be used to start new work until ST-066 migrates them.

Session handoff lives in [FollowUpSessionLog.txt](FollowUpSessionLog.txt) — replace (not append), max 40 lines, parseable by a fresh agent.

## Common commands

### Cloud MCP server

```powershell
# Bring up the dev stack (Postgres + pgvector + AGE, plus the Deno MCP server)
docker compose up -d

# Bring up the test stack (adds ephemeral db-test, seed corpus, mcp-test)
docker compose --profile test up -d

# Run a single Deno test file inside the mcp-test container
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-mmr.test.ts

# Run all server tests. Three grants beyond the defaults, each earned by named files.
# Keep this list current — it is an inventory, and a stale one reads as "these are the
# only files that spawn anything", which is exactly how it stopped being true:
#   --allow-run=deno    every file that boots a real server process. Currently
#                       workflow-mvp-e2e.test.ts (ST-086, starts and restarts one),
#                       provider-egress.test.ts, workflow-agent-key-e2e.test.ts,
#                       workflow-node-hub-e2e.test.ts (each proves over real HTTP
#                       something no in-process test can: a mount, or what a boot does
#                       and does not reach). awcp-cli.test.ts (ST-087) spawns the CLI.
#                       Find them with: grep -l startServerProcess tests/*.ts
#   --allow-run=git     awcp-cli.test.ts builds a throwaway repository, because
#                       server/scripts/awcp.ts derives a checkpoint's repo/branch/commit
#                       by running git and there is no honest way to prove that without
#                       giving it a repository.
#   --allow-write=/tmp  that throwaway repository. Scoped to the temp directory rather
#                       than opened wholesale.
# Both run grants name their binary rather than using a bare --allow-run, so the suite
# does not get unrestricted subprocess-spawn permission. Without them the two files
# above error rather than skip.
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/

# Workflow Operations only (local MVP — see docs/workflow-mvp.md)
docker compose -f docker-compose.yml -f docker-compose.workflow.yml up -d --wait

# Tail the MCP server logs
docker compose logs -f mcp

# Health check (Bearer auth NOT required on /health)
curl http://localhost:3000/health
```

**Dev vs Test isolation:** The default `docker compose up -d` starts only `db` + `mcp` (persistent dev data). The `--profile test` flag adds `db-test` (ephemeral, tmpfs — wiped on stop), `seed` (loads test corpus into `db-test`), and `mcp-test` (connects to `db-test`, port 3001). Tests never touch the dev database.

That guarantee is about the *dev* database only. `db-test` is itself **shared and accumulating** — it is wiped when its container stops, not between runs — so successive `exec` runs, and host-side runs against its published `127.0.0.1:5433`, pollute each other. See [.github/instructions/dev-environment.instructions.md](.github/instructions/dev-environment.instructions.md) § Gotchas.

The `./server` directory is bind-mounted to `/app` in the `mcp` container ([docker-compose.yml:33](docker-compose.yml#L33)), so file edits are picked up live without rebuilding — **edits in the checkout that ran `docker compose up`.** The mount is fixed at container creation and no project name is pinned, so with a `git worktree` in play the running stack may be serving a different checkout than the one you are editing; see [docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md](docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md). `.env` must define `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY` (see [.env.example](.env.example)) — and a worktree does not inherit the main checkout's `.env`, since it is gitignored.

### WSL2-Native Dev (recommended inner loop)

This workflow requires a one-time WSL2 setup: see [docs/wsl2-setup.md](docs/wsl2-setup.md).

```bash
# Start the native dev server (starts Postgres if needed, enables hot reload)
./dev.sh

# Quick native test against the shared dev Postgres
deno test --frozen --allow-net --allow-env --allow-read server/tests/search-mmr.test.ts

# Native health check
curl http://127.0.0.1:3000/health
```

> For full isolation tests, continue using the Docker test profile commands
> above. Native tests use the shared dev Postgres and may leave test data
> behind.
>
> `DATABASE_URL` in `.env.dev` must use `127.0.0.1`, not `localhost` —
> see [docs/wsl2-setup.md §6](docs/wsl2-setup.md#6-create-the-envdev-file-for-native-deno)
> for details.

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

Every commit for board-tracked work uses Conventional Commits with a `Story: ST-NNN` trailer:

```
feat(search): add MMR re-ranking pass

Story: ST-005
```

**Legacy ExecPlan-driven work** additionally uses a `Task: §4.4`-style trailer and updates the ExecPlan's §5b Recovery Ledger immediately after each commit ([.github/instructions/session-resilience.instructions.md](.github/instructions/session-resilience.instructions.md)) — this applies only to the retired `.github/planning/execplans/` format.

**`docs/plans/*.md`-driven work** (compound-engineering `ce-work` or equivalent) uses `Story: ST-NNN` alone; execution progress is derived from git history, not stored in the plan body.

### Merge strategy — squash, and keep the trailer

**Squash-merge PRs into `main`.** This is the established convention (every merge on `main` to date) and it fits because PRs here are *story-scoped*: one PR ≈ one `ST-NNN` ≈ one reviewable unit, so a merge commit would group a group of one.

**The load-bearing part is the squash message, not the squash.** It must carry the `Story: ST-NNN` trailer, because that trailer is the only thing that keeps "execution progress is derived from git history" true above — `git log --grep="Story: ST-084"` is how a story's shipped work is found. GitHub's default squash message (PR title + bulleted commit list) **drops the trailer**; write the message deliberately.

Squashing does not lose the granular history: GitHub keeps a PR's individual commits browsable even after the branch is deleted, and the durable "how this evolved" knowledge belongs in [docs/solutions/](docs/solutions/) and investigation findings rather than in `main`'s log.

**The exception: long-lived integration branches** carrying several stories (e.g. an umbrella branch accumulating a whole ST-0NN series). Squashing many stories into one commit destroys something worth keeping and lands an unreviewable blob — merge those, or land them story by story.

**The verification cost of stacking, which this section otherwise leaves implicit:** [.github/workflows/ci.yml](.github/workflows/ci.yml) triggers only on `main` and PRs targeting `main`, so **a PR into an integration or feature branch runs no CI whatsoever** — and five of the last seven PRs here did exactly that. CI arrives only when the integration branch itself merges to `main`, by which point several stories' worth of change land on the first green-or-red signal. On a stacked PR the local run is the only gate, which makes a recorded verification's freshness load-bearing — see [docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md](docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md).

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

- **Tests run in `mcp-test`**, not `mcp`. Use `docker compose --profile test exec mcp-test deno test ...` in ExecPlan commands. **Under-specified on one point:** the memory names the service and the flags but not the *working directory*. `exec` reaches whichever checkout ran `up`, so with a worktree on the machine this command can pass against code you did not edit — verify the mount first ([docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md](docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md)).
- **ExecPlan verification should match deliverable scope** — don't run unrelated test suites as a safety net.
- **Git EOL semantics:** `i/` is always LF for text; `w/` follows `eol=`; `git status` clean is the real success indicator.

These came from prior plan reviews and should keep applying. If you're about to act on a memory-recommended file/flag/function, verify it still exists before recommending (memories freeze in time).

## Session review — continuous improvement

At the end of each non-trivial session, review the work for **reusable nuggets** — recurring patterns, gotchas, workflow gaps, or conventions that a fresh agent would miss. When you identify one, suggest creating or updating:

- A **`.github/instructions/*.instructions.md`** file — for conventions, commands, or constraints that should auto-load into every Copilot session.
- A **skill** (`.github/skills/*/SKILL.md`) — for domain-specific procedural knowledge (multi-step workflows, research patterns).
- An update to **`CLAUDE.md`** or **`.github/copilot-instructions.md`** — for architectural context or workflow-level guidance.

Don't create these unilaterally — propose them to the PO with a one-line rationale. The goal is to compound project knowledge so future sessions start smarter.
