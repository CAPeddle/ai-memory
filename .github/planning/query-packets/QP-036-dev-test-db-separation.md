# QP-036: Separate Dev/Test DB Containers (Compose Profiles)

> Story: ST-036
> Status: Seed — ready for `/plan`
> Created: 2026-05-25

---

## PO Intent

Eliminate test-pollution failures and protect dev-DB data by introducing structural
isolation between the development database (persistent, manually populated) and the
test database (ephemeral, seeded, disposable).

## Problem Statement

During ST-035 execution, `docker compose down -v` wiped the persistent volume that
held the search-quality corpus. This exposed a latent design flaw: the same DB serves
both development (manual exploration, ad-hoc captures) and testing (deterministic
corpus + assertion). Entity-mentions tests leave behind rows containing "zoom" content
that displace expected results in search-project-boost tests.

The current fix (seed service + cleanup hack in `search-project-boost.test.ts`) works
but is fragile: any future test writing content that matches search test queries will
re-break the search tests unless it adds its own cleanup.

## PO Decisions (from intake discussion 2026-05-25)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Isolation approach | Option A: Two containers | Full separation; no resource sharing |
| Rejected: Option B | Two DBs in one container | Not worth init-script complexity |
| Rejected: Option C | Cleanup guards only | Too fragile |
| Activation mechanism | Compose profiles | `--profile test` to spin up test infra |
| Seed target | db-test only | Dev DB starts empty; no test fixtures in dev |
| Test connection | `MCP_TEST_DATABASE_URL` env var | Tests discover db-test via env |
| Dev-DB priority | High — manual data matters | PO keeps exploration data between sessions |

## Research Findings

### Architecture context
- **ADR-009** defines Docker Compose as the sole dev/validation stack — no managed DB
- **ADR-011** mandates PostgreSQL 15 + pgvector + Apache AGE
- Current `docker-compose.yml` has 3 services: `db`, `seed`, `mcp`
- `db` image is custom-built from `docker/postgres-age/Dockerfile` (PG15 + pgvector + AGE)
- Init scripts run via `docker-entrypoint-initdb.d/` at first volume creation

### Test corpus infrastructure
- `server/tests/fixtures/search-quality-corpus.sql` — 29 thoughts with pre-computed 512-dim embeddings
- `server/tests/fixtures/build-search-quality-corpus.ts` — deterministic generator (seeded RNG)
- `server/tests/fixtures/search-quality-queries.json` — 10 query→expected_id pairs
- Tests use `mcpCall()` helper via HTTP to the MCP server (not direct DB)
- Some tests (entity-mentions) import `sql` directly from `../src/db.ts`

### Affected tests (all 20)
- **Search tests** (need corpus): `search-project-boost` (3), `search-recall-quality` (1), `search-mmr` (2), `search-strict-flag` (1), `search-recall-events` (1)
- **Entity tests** (create own data): `entity-worker` (3), `entity-mentions` (4)
- **Other**: `parseContext` (4, pure unit — no DB), `graph-traverse` (1)

### Current seed service (to be migrated)
```yaml
seed:
  image: postgres:15
  depends_on:
    db:
      condition: service_healthy
  environment:
    PGPASSWORD: ${DB_PASSWORD}
  volumes:
    - ./server/tests/fixtures/search-quality-corpus.sql:/seed/corpus.sql:ro
  entrypoint: ["/bin/sh", "-c", "until pg_isready -h db -U ai_memory -d ai_memory; do sleep 1; done && psql -h db -U ai_memory -d ai_memory -f /seed/corpus.sql"]
  restart: "no"
```

### Key design considerations for `/plan`
1. **db-test needs the same image** as `db` (pgvector + AGE) — reuse the same Dockerfile
2. **Volume strategy**: `db` keeps `db_data` named volume; `db-test` uses either no volume (tmpfs) or an anonymous volume that Compose recreates on `down`
3. **Network connectivity**: Both `db` and `db-test` must be on the same Docker network as `mcp`
4. **MCP server connection**: `mcp` still connects to `db` for dev; tests override their connection to `db-test`
5. **Test helper changes**: `server/src/db.ts` is imported by tests — it reads `DATABASE_URL`. Tests need a way to connect to `db-test` instead. Options:
   - Override `DATABASE_URL` in the test container environment
   - Add a `TEST_DATABASE_URL` check in `db.ts`
   - Pass the URL via `MCP_TEST_DATABASE_URL` specifically for test invocations
6. **MCP-level tests**: Tests that call MCP tools via HTTP (search tests) actually go through the MCP server, which connects to `db`. For full isolation, the MCP server itself would need to point at `db-test` during test runs, OR search tests would need to insert their corpus directly.
7. **Profile activation**: `docker compose --profile test up -d` should bring up `db-test` + `seed` without disturbing the running `db` + `mcp`

## Open Questions for `/plan`

1. **MCP server routing during tests**: Should the `mcp` service switch to `db-test` via environment override when `--profile test` is active? Or should tests bypass the MCP server and query DB directly? (The former is cleaner for search tests that hit MCP; the latter is simpler.)
2. **Test runner invocation pattern**: What's the exact command? `docker compose --profile test exec mcp deno test tests/`? Or a dedicated test-runner service?
3. **Backward compatibility**: After this change, does `docker compose up -d` (no profile) still work exactly as today minus the seed service? (Intent: yes — seed only runs in test profile.)
4. **Entity-mentions tests**: These create their own data via `capture_thought` MCP calls. If `mcp` points at `db` (dev), these tests pollute dev. If `mcp` points at `db-test` during test runs, isolation is complete. How to achieve the switch?
5. **CI implications**: When CI eventually runs tests (ST-010), should it use `--profile test` only? (Probably yes — CI never needs a persistent dev DB.)

## Dependencies and Overlaps

- **ST-010** (Integration testing for cloud MCP) — may benefit from this infrastructure; not a blocker
- **ST-023** (Cloud deployment) — production won't have a test DB; this is dev-only; no conflict
- **ADR-009** — needs a minor amendment documenting the dev/test split convention

## Recommended Next Step

Run `/plan` for ST-036 to produce an ExecPlan. Key planning decisions:
1. Resolve Open Question #1 (MCP routing) — likely answer: MCP service gets a `test` profile variant that overrides `DATABASE_URL` to point at `db-test`
2. Define exact Compose profile structure
3. Enumerate tasks: Compose changes → test helper changes → remove cleanup hack → doc updates → verification
