# ExecPlan — ST-042: Migration Framework

> Status: ⬜ Not Ready
> Story: ST-042
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document.

---

## §1. Background & Context

Schema changes in ai-memory are currently applied via Docker's `/docker-entrypoint-initdb.d/` mechanism (which only runs on first `initdb`) or manually via `psql -f`. This works for a single developer but has problems:

- No record of which DDL has been applied to a given database instance.
- New schema changes require manual steps for existing volumes.
- Risk of applying DDL twice or out of order.

This story adds a lightweight migration framework:
- A `schema_migrations` table tracking applied migrations by version number.
- A `server/src/migrate.ts` module that runs at startup (before `Deno.serve()`).
- Numbered migration files in `server/db/migrations/`.
- Bootstrap detection for existing databases (tables exist but `schema_migrations` doesn't).

**Key files:**
- `server/db/schema.sql`, `server/db/graph.sql`, `server/db/search.sql` — current DDL applied via Docker init
- `server/index.ts` — startup sequence
- `server/src/db.ts` — Postgres connection pool

**Terminology:**
- "Bootstrap" = first run of migrate.ts against a database that already has tables but no `schema_migrations` table.
- "Migration" = a numbered SQL file that is applied exactly once.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After starting the server against a fresh database, `schema_migrations` table exists and contains version entries for all migration files.
- After starting the server against an existing database (tables present, no `schema_migrations`), the framework detects existing schema, seeds `schema_migrations` with already-applied versions, and skips re-running them.
- Adding a new migration file (e.g. `005_new.sql`) and restarting applies it and records the version.
- A failing migration causes `Deno.exit(1)` with a clear error.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture and design decisions documented
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted
- [x] No tasks require judgment calls
- [x] Script templates provided in §3
- [x] Scoped requirements mapped in §2d
- [x] Every task ends with verification
- [x] Acceptance criteria are observable behaviour

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Schema changes are applied via numbered migrations (QP-038 AC-9) | `schema_migrations` table + `server/src/migrate.ts` | Task 4.1, 4.2, 4.3 | Test: fresh DB + existing DB both handled correctly |

---

## §3. Preconditions

- Docker Compose test stack running
- `server/src/db.ts` exports a `sql` connection pool

**Migration directory structure:**
```
server/db/migrations/
  001_initial.sql
  002_needs_embedding.sql    (from ST-039, if shipped)
```

**Bootstrap detection logic** (pseudo-code):
```
if schema_migrations table does not exist:
  create it
  if thoughts table exists:
    mark 001 as applied (schema already present)
  if needs_embedding column exists:
    mark 002 as applied
  // etc.
then:
  for each migration file not in schema_migrations:
    execute in transaction
    insert version
```

---

## §4. Task Definitions

### Task 4.1: Create migration infrastructure

**Objective:** Create the migrate.ts module and migration directory.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `server/db/migrations/`.

2. Create `server/db/migrations/001_initial.sql` — this is NOT a copy of the full schema.sql. It is a **marker migration** that represents the already-deployed schema:
   ```sql
   -- Migration 001: Initial schema marker
   -- This migration represents the base schema (thoughts, consolidation_queue,
   -- consolidation_log, recall_events, entity_extraction_queue, entity_mentions).
   -- It is NOT executed on existing databases — the bootstrap detection marks it
   -- as applied if tables already exist.
   --
   -- For fresh databases, the Docker init scripts (schema.sql, graph.sql, search.sql)
   -- create the base tables. This file exists only to anchor version numbering.
   SELECT 1; -- no-op; base schema created by Docker init
   ```

3. Create `server/src/migrate.ts`:
   ```typescript
   import { sql } from "./db.ts";

   const MIGRATIONS_DIR = new URL("../db/migrations/", import.meta.url).pathname;

   interface MigrationFile {
     version: number;
     filename: string;
     path: string;
   }

   async function loadMigrationFiles(): Promise<MigrationFile[]> {
     const files: MigrationFile[] = [];
     for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
       if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
       const match = entry.name.match(/^(\d+)_/);
       if (!match) continue;
       files.push({
         version: parseInt(match[1], 10),
         filename: entry.name,
         path: `${MIGRATIONS_DIR}/${entry.name}`,
       });
     }
     return files.sort((a, b) => a.version - b.version);
   }

   async function ensureMigrationsTable(): Promise<void> {
     await sql`
       CREATE TABLE IF NOT EXISTS schema_migrations (
         version INT PRIMARY KEY,
         filename TEXT NOT NULL,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )
     `;
   }

   async function getAppliedVersions(): Promise<Set<number>> {
     const rows = await sql`SELECT version FROM schema_migrations`;
     return new Set(rows.map((r) => Number(r.version)));
   }

   async function detectBootstrap(): Promise<void> {
     // If schema_migrations was just created but tables already exist,
     // seed it with markers for already-applied migrations.

     const [thoughtsCheck] = await sql`
       SELECT to_regclass('public.thoughts') AS exists
     `;
     if (thoughtsCheck?.exists) {
       // Base schema is already deployed — mark 001 as applied
       await sql`
         INSERT INTO schema_migrations (version, filename)
         VALUES (1, '001_initial.sql')
         ON CONFLICT (version) DO NOTHING
       `;
       console.log("[migrate] bootstrap: marked 001_initial.sql as applied (tables exist)");
     }

     // Check for needs_embedding column (ST-039)
     const [colCheck] = await sql`
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'thoughts' AND column_name = 'needs_embedding'
     `;
     if (colCheck) {
       await sql`
         INSERT INTO schema_migrations (version, filename)
         VALUES (2, '002_needs_embedding.sql')
         ON CONFLICT (version) DO NOTHING
       `;
       console.log("[migrate] bootstrap: marked 002_needs_embedding.sql as applied (column exists)");
     }
   }

   export async function runMigrations(): Promise<void> {
     console.log("[migrate] checking for pending migrations...");

     await ensureMigrationsTable();

     // Bootstrap: detect existing schema on first run
     const [countRow] = await sql`SELECT count(*) AS cnt FROM schema_migrations`;
     if (Number(countRow.cnt) === 0) {
       await detectBootstrap();
     }

     const applied = await getAppliedVersions();
     const files = await loadMigrationFiles();
     let newCount = 0;

     for (const migration of files) {
       if (applied.has(migration.version)) continue;

       console.log(`[migrate] applying ${migration.filename}...`);
       const content = await Deno.readTextFile(migration.path);

       try {
         await sql.begin(async (tx) => {
           await tx.unsafe(content);
           await tx`
             INSERT INTO schema_migrations (version, filename)
             VALUES (${migration.version}, ${migration.filename})
           `;
         });
         newCount++;
         console.log(`[migrate] applied ${migration.filename}`);
       } catch (err) {
         console.error(`[migrate] FATAL: migration ${migration.filename} failed:`, (err as Error).message);
         Deno.exit(1);
       }
     }

     if (newCount === 0) {
       console.log("[migrate] all migrations already applied");
     } else {
       console.log(`[migrate] applied ${newCount} new migration(s)`);
     }
   }
   ```

**Expected output:** Migration module ready to be integrated into startup.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check /app/src/migrate.ts
```
Expected: No type errors.

**Failure handling:** If `Deno.readDir` path resolution fails (URL vs filesystem path), use `import.meta.resolve()` instead and convert to a path.

---

### Task 4.2: Integrate into startup sequence

**Objective:** Run migrations before the HTTP server starts.

**Input:** `server/index.ts` — current startup sequence.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Add import at the top of `server/index.ts`:
   ```typescript
   import { runMigrations } from "./src/migrate.ts";
   ```

2. Add migration call **after** the env validation block (from ST-038) and **before** `Deno.serve()`. Since migrations are async, wrap the bottom of the file:
   ```typescript
   // Run migrations before starting server
   await runMigrations();

   Deno.serve({ port: 3000 }, app.fetch);
   ```

   Note: If the file currently uses top-level statements without `await`, you may need to verify Deno allows top-level await (it does by default — no additional config needed).

3. The migration runs against whatever database `DATABASE_URL` points to — in dev that's `memory`, in test that's `memory_test`.

**Expected output:** On server start, migrations are checked and applied before any HTTP requests are accepted.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test restart mcp-test
docker compose --profile test logs mcp-test --tail 20 | Select-String "migrate"
```
Expected: Log lines showing `[migrate] checking for pending migrations...` and either `all migrations already applied` or `applied N new migration(s)`.

**Failure handling:** If the migration fails on startup (e.g. 001_initial.sql tries to create tables that exist without IF NOT EXISTS), the bootstrap detection should have marked it as applied. If bootstrap detection missed a version, add the appropriate detection logic.

---

### Task 4.3: Write tests

**Objective:** Test migration framework against fresh and existing databases.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/migrations.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { getDbConnection } from "./_helpers/mcpClient.ts";

   Deno.test("schema_migrations table exists after server startup", async () => {
     const db = getDbConnection();
     const [row] = await db`
       SELECT to_regclass('public.schema_migrations') AS exists
     `;
     assertEquals(row.exists !== null, true, "schema_migrations table should exist");
     await db.end();
   });

   Deno.test("schema_migrations contains at least version 1", async () => {
     const db = getDbConnection();
     const rows = await db`SELECT version, filename FROM schema_migrations ORDER BY version`;
     assertEquals(rows.length >= 1, true, "At least migration 001 should be recorded");
     assertEquals(rows[0].version, 1);
     assertEquals(rows[0].filename, "001_initial.sql");
     await db.end();
   });
   ```

**Expected output:** Tests validate the framework ran successfully on the test database.

**Requirement mapping:** §2d row 1 (verification evidence)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/migrations.test.ts
```
Expected: 2 tests pass.

**Failure handling:** If the test DB was recreated fresh (tmpfs), migrations should have run on mcp-test startup. If not, ensure mcp-test's entrypoint starts the server (which triggers migrations).

---

### Task 4.4: Full test suite + cross-model review

**Steps:**

1. Run full test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

2. **Cross-model review checklist:**
   - Does the bootstrap detection handle the case where 002 exists but 001 doesn't? (Covered — bootstrap marks each independently based on schema state.)
   - Can two server instances race on migration application? (Single-instance deployment — not a concern today. For future multi-instance, add advisory lock: `SELECT pg_advisory_lock(42)` at start of `runMigrations`.)
   - Does `sql.begin()` properly roll back failed DDL in Postgres? (DDL in Postgres is transactional — `CREATE TABLE` inside a transaction is rolled back on error.)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

---

## §5. State Recovery Protocol

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Next task** | Task 4.1 |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | File-based migrations with bootstrap detection | git HEAD | 🟢 Active |

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

*(populated during execution)*

---

## §6c. Decision Log

*(populated during execution)*

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board: move to Review
3. Present results to PO

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.12.
