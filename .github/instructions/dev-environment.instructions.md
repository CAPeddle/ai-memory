---
applyTo: "**"
---

# Dev Environment — Docker Compose Commands

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
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/

# Run a single test file
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-mmr.test.ts
```

## Key conventions

- **Tests run in `mcp-test`**, not `mcp`. The `mcp-test` service connects to `db-test` (ephemeral, tmpfs).
- **Dev data is never wiped by tests.** The `db` service uses a persistent named volume; `db-test` uses tmpfs (RAM-only, wiped on container stop).
- **Deno runs inside the container**, not on the host. Always use `docker compose exec mcp-test deno ...` or `docker compose exec mcp deno ...`.
- **ExecPlan commands** should use `docker compose --profile test exec mcp-test deno test ...` for verification steps.
- **Seed corpus** (`server/tests/fixtures/search-quality-corpus.sql`) is loaded into `db-test` by the `seed` service on startup.
- **Port mapping**: `mcp` → localhost:3000, `mcp-test` → localhost:3001, `db` → localhost:5432, `db-test` → localhost:5433.
- **Bind mount**: `./server` is mounted to `/app` in both `mcp` and `mcp-test` — source edits are live without rebuild.

## .NET (governance tooling + planned local companion)

```powershell
dotnet build src/AiMemory.sln
dotnet test
```
