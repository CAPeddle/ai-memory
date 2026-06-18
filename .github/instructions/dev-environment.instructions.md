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
- **Bind mount**: `./server` is mounted to `/app` in both `mcp` and `mcp-test` — source edits are live without rebuild.

## .NET (governance tooling + planned local companion)

```powershell
dotnet build src/AiMemory.sln
dotnet test
```
