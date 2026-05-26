---
name: "ADR-009: Deployment Model"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-009-deployment-model.md"
created: "2026-05-16"
---

# ADR-009: Deployment Model

**Status:** Accepted  
**Date:** 2026-05-16  
**Deciders:** PO (sole maintainer)

---

## Context

The original architecture assumed local-first deployment: a Windows service binding to localhost, with SQLite as the database. The architecture has changed to a cloud-hosted MCP server (ADR-001, ADR-004) accessible from multiple AI chat platforms (Claude.ai, ChatGPT, Gemini, GitHub Copilot, Cursor).

The deployment model must:
- Make the MCP server accessible via public HTTPS
- Host PostgreSQL 15 + pgvector + Apache AGE v1.7.0 (ADR-011)
- Support the entity extraction and consolidation workers (ADR-007)
- Stay within the cost ceiling (soft target: €0 free tier; hard ceiling: €10/month)
- Be validated locally (Docker Desktop / VM) before committing to a cloud platform

---

## Decision

### Docker Compose — two services

The server stack is defined as a single `docker-compose.yml` with two containers:

```yaml
services:
  db:
    build: ./docker/postgres-age     # PostgreSQL 15 + pgvector + AGE v1.7.0
    environment:
      POSTGRES_DB: ai_memory
      POSTGRES_USER: ai_memory
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_memory"]

  mcp:
    build: ./server                  # Deno MCP server (OB1 fork, TypeScript)
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://ai_memory:${DB_PASSWORD}@db:5432/ai_memory
      MEMORY_API_KEY: ${MEMORY_API_KEY}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
    ports:
      - "3000:3000"
```

The PostgreSQL image is a custom Dockerfile that installs pgvector and AGE v1.7.0 on the PostgreSQL 15 base image.

### Development and validation target: local Docker

The spike (ST-021) validates the architecture locally:
- Docker Desktop on Windows / WSL2, or a local VM
- Full stack runs on the developer's machine
- OpenRouter API key is configured in `.env` for entity extraction
- No cloud platform dependency during the spike phase

### Production platform: deferred until post-spike

The cloud hosting platform is not selected until the spike proves the architecture. Candidate platforms (evaluated after ST-021):

| Platform | Free tier | Notes |
|----------|-----------|-------|
| Fly.io | 3 shared VMs, 3GB storage | Docker-native; Fly Postgres no custom extensions, so self-managed DB container needed |
| Railway | $5/month hobby | Good Docker Compose support |
| DigitalOcean Droplet | $6/month (1GB RAM) | Simple; full VM control; Docker Compose directly |
| Azure Container Apps | Free tier + $150 credits | Suitable; credits cover any overage |
| Render | Free web service (sleeps) | Cold start on free tier may be unacceptable for MCP |

Decision criteria for platform selection: cost, Docker Compose support, persistent volume for database, always-on availability (no sleep on inactivity), HTTPS termination.

### HTTPS and public endpoint

In production, the MCP server must be reachable via public HTTPS. All candidate platforms provide automatic TLS termination. The MCP StreamableHTTP endpoint is:

```
https://<platform-host>/mcp
```

This URL is configured once per chat platform (Claude.ai, ChatGPT, Gemini, Copilot settings).

### Environment variables

All secrets are injected via environment variables. No secrets are committed to the repository.

| Variable | Purpose |
|----------|---------|
| `MEMORY_API_KEY` | Bearer token for MCP authentication (ADR-010) |
| `DB_PASSWORD` | PostgreSQL password |
| `OPENROUTER_API_KEY` | Entity extraction and consolidation LLM calls |
| `DATABASE_URL` | Full connection string (composed from above) |

---

## Consequences

### Positive
- Docker Compose is platform-agnostic; the same `docker-compose.yml` runs locally and on any cloud host
- Local validation before cloud commitment avoids paying for infrastructure that may need architectural changes
- Single Compose file: simple to understand, version-control, and reproduce
- Custom PostgreSQL image (PG15 + pgvector + AGE) can be built once and reused across environments

### Negative / Trade-offs
- Self-managed PostgreSQL in a container requires the developer to manage database backups; no automatic managed-service backups
- Platform selection is deferred: the spike cannot assume a specific production environment when writing deployment documentation
- Docker Desktop on Windows / WSL2 is a development dependency; not all machines may have it installed

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **Supabase managed service** | Does not include Apache AGE in its extension list; structural graph queries are a confirmed requirement (ADR-003) |
| **Self-hosted Supabase (Docker)** | 10+ container stack (PostgREST, GoTrue, Kong, Realtime, Storage, Studio) for the sole value of Deno Edge Functions; a plain Deno server achieves the same at a fraction of the complexity |
| **Azure Database for PostgreSQL (managed)** | Managed PostgreSQL on Azure does not allow custom extensions (AGE); same constraint as Supabase managed |
| **Local-first deployment (original design)** | Incompatible with online access from Claude.ai, ChatGPT, Gemini, Copilot; confirmed dropped as a requirement |

### Dev/Test container separation (ST-036)

The Compose file uses **profiles** to separate development and test infrastructure:

| Profile | Services started | Volume strategy | Purpose |
|---------|-----------------|-----------------|----------|
| _(default)_ | `db`, `mcp` | `db_data` named volume (persistent) | Development — manual exploration data persists across sessions |
| `test` | `db-test`, `seed`, `mcp-test` (plus default services) | tmpfs (RAM-only, wiped on stop) | Testing — ephemeral, seeded, deterministic |

**Key conventions:**
- `docker compose up -d` gives a clean dev stack. No seed data. Dev DB data persists.
- `docker compose --profile test up -d` adds the test infrastructure alongside dev.
- Tests run inside `mcp-test`: `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/`
- `db-test` uses the same image as `db` (PG15 + pgvector + AGE) but with tmpfs storage, so init scripts re-run on every start (always fresh schema).
- `seed` loads the deterministic test corpus (`server/tests/fixtures/search-quality-corpus.sql`) into `db-test` only.
- `mcp-test` connects to `db-test` via its own `DATABASE_URL`; no env-var override needed in tests.
- `mcp-test` exposes port 3001 on the host for curl debugging.

This separation ensures test runs never alter dev data, and eliminates test-pollution failures where one test's data affects another test's assertions.

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.1 | 2026-05-26 | Added dev/test container separation via Compose profiles (ST-036) |
| 1.0 | 2026-05-16 | Initial — Docker Compose (PostgreSQL 15 + pgvector + AGE, Deno MCP server); local validation first; cloud platform TBD post-spike |
