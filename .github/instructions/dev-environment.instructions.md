---
applyTo: "**"
---

# Dev Environment — Native Deno + Docker Compose Commands

## WSL2-Native dev (recommended inner loop)

One-time setup: see `docs/wsl2-setup.md`. Full command reference: `CLAUDE.md §WSL2-Native Dev`.

```bash
./dev.sh                                                                        # start native server (starts Postgres if needed, hot reload)
deno test --frozen --allow-net --allow-env --allow-read server/tests/<file>.ts  # quick native test
curl http://127.0.0.1:3000/health                                               # health check (use 127.0.0.1, not localhost)
```

> Native tests share the dev Postgres — test data may persist. Use the Docker test profile below for full isolation.

## Dev stack (persistent data)

```powershell
# Start dev (db + mcp only, persistent volume)
docker compose up -d

# Health check
curl http://localhost:3000/health
```

## Test stack (ephemeral, seeded corpus)

```powershell
# Start test infrastructure alongside dev
docker compose --profile test up -d

# Run all server tests inside the mcp-test container
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/

# Run a single test file
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-mmr.test.ts

# Refresh deno.lock intentionally after dependency/import changes
docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts
```

## Key conventions

- **Tests run in `mcp-test`**, not `mcp`. The `mcp-test` service connects to `db-test` (ephemeral, tmpfs).
- **Dev data is never wiped by tests.** The `db` service uses a persistent named volume; `db-test` uses tmpfs (RAM-only, wiped on container stop).
- **Deno runs natively on the host** for the WSL2-native dev workflow (see `docs/wsl2-setup.md`). For isolation tests, Deno runs inside the `mcp-test` container — use `docker compose exec mcp-test deno ...` or `docker compose exec mcp deno ...`.
- **ExecPlan commands** should use `docker compose --profile test exec mcp-test deno test --frozen ...` for verification steps.
- **Lockfile hygiene:** `server/deno.json` enforces frozen lock mode; if dependencies change, refresh `server/deno.lock` intentionally via `deno cache --lock-write` and commit it in the same change.
- **Seed corpus** (`server/tests/fixtures/search-quality-corpus.sql`) is loaded into `db-test` by the `seed` service on startup.
- **Port mapping**: `mcp` → localhost:3000, `mcp-test` → localhost:3001, `db` → localhost:5432, `db-test` → localhost:5433.
- **Bind mount**: `./server` is mounted to `/app` in both `mcp` and `mcp-test` — source edits are live on disk without rebuild. **But the running server process loads `index.ts` into memory at boot; Deno does not hot-reload it.** Integration tests hit the server over HTTP (`mcpCall` → `MCP_BASE_URL`), so after editing server code you must `docker compose --profile test restart mcp-test` before re-running tests, or the tests exercise the old code.
- **Bind mount, second hazard — which *checkout* is mounted.** A bind mount is fixed when `up` creates the container, not when you `exec` into it, and no project name is pinned (`docker-compose.yml` has no top-level `name:`; `COMPOSE_PROJECT_NAME` is unset), so Compose derives the project from the directory basename. With a `git worktree` on the machine, the stack belongs to whichever checkout ran `up` — run the test command from there and it passes against **that** tree, not your worktree edit, with nothing in the output naming a path. Confirm before trusting a result: `docker compose ls` (its `CONFIG FILES` column) or `docker inspect --format '{{range .Mounts}}{{.Source}}=>{{.Destination}}{{"\n"}}{{end}}' ai-memory-mcp-test-1`. Full treatment: [docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md](../../docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md).

## Gotchas — local tests are NOT a faithful CI mirror

Do not treat local integration failures as regressions without checking these first:

- **A PR into a feature branch runs NO CI at all.** `.github/workflows/ci.yml` triggers only on `push: branches: [main]` and `pull_request: branches: [main]`, so a stacked PR gets zero jobs — not a reduced set, none. This is the normal shape here, not an edge case: five of the last seven PRs targeted a feature branch. Check before relying on it: `gh pr view <n> --json baseRefName` — anything other than `main` means the local run in front of you is the only gate that exists. The rest of this section describes where local and CI *diverge*; this is the case where there is no CI to diverge from.

- **Placeholder API key → false `e2e` failures.** Local `.env` ships a placeholder `OPENROUTER_API_KEY` (`placeh…`). Every LLM/embedding-dependent test (most of `e2e.test.ts`, `entity-worker-observability.test.ts`) fails locally with `OpenRouter 401: Missing Authentication header`. These **pass in CI**, which injects the real secret. The real key is a GitHub secret only — never pull it into a local run.
- **`db-test` accumulates state across `exec` runs.** The tmpfs is RAM-only but persists for the container's lifetime, so triggers/queues pollute across successive `deno test` runs (e.g. `consolidation_queue`, `entity_extraction_queue`). To reset to a clean seed, `docker compose --profile test down && up -d` (recreates the container, wipes tmpfs, re-runs `seed`), or more narrowly `docker compose --profile test rm -sf mcp-test seed db-test && docker compose --profile test up -d --wait`. A fresh seed alone yields ~33 pending `consolidation_queue` rows — tests that `drainPendingOnce(limit=1)` must backdate their own `queued_at` to be claimed first. **A native `deno test` against `127.0.0.1:5433` contaminates `db-test` the same way** — the port is published, so a host-side run is not isolated from the container's database. Because the polluted assertions are row counts, the result looks like a regression in whatever you just changed: recreate the stack *before* debugging a new count failure.
- **CI uses fresh containers every run**, so local stateful pollution is never reproduced there. When local and CI disagree, suspect the two items above before suspecting a code regression.
- **Triggers auto-enqueue.** `trg_queue_entity_extraction` (AFTER INSERT ON thoughts) and the `recall_events` trigger auto-populate queues, so test fixtures that also INSERT into those queues must use `ON CONFLICT (thought_id) DO UPDATE`, not a plain INSERT, to avoid PK collisions.


## .NET (governance tooling + planned local companion)

```powershell
dotnet build src/AiMemory.sln
dotnet test
```
