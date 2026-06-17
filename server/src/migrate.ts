import { sql } from "./db.ts";

type SqlExecutor = typeof sql;

interface MigrationFile {
  version: number;
  filename: string;
  content: string;
}

const MIGRATIONS_DIR = new URL("../db/", import.meta.url);

export async function runMigrations(): Promise<void> {
  console.log("[migrate] checking for pending migrations...");
  await ensureMigrationsTable();

  const files = await loadMigrationFiles();

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM schema_migrations
  `;

  if (count === 0) {
    console.log("[migrate] schema_migrations empty - probing existing schema...");
    await sql.begin(async (tx) => {
      await detectBootstrapVersions(tx);
    });
  }

  const migration003 = files.find((file) => file.version === 3);
  if (migration003) {
    await sql.begin(async (tx) => {
      await repairMissingMigration003Artifacts(tx, migration003);
    });
  }

  const applied = new Set(
    (await sql<{ version: number }[]>`SELECT version FROM schema_migrations ORDER BY version`)
      .map((row) => row.version),
  );

  const pending = files.filter((file) => !applied.has(file.version));
  if (pending.length === 0) {
    console.log("[migrate] all migrations already applied");
    return;
  }

  for (const file of pending) {
    console.log(`[migrate] applying ${file.filename}...`);
    try {
      await sql.begin(async (tx) => {
        await applyAndRecordVersion(tx, file.version, file.filename, file.content);
      });
    } catch (err) {
      console.error(`[migrate] FATAL: migration ${file.filename} failed:`, err);
      Deno.exit(1);
    }
  }

  console.log(`[migrate] applied ${pending.length} new migration(s)`);
}

export async function applyAndRecordVersion(
  tx: SqlExecutor,
  version: number,
  filename: string,
  content: string,
): Promise<void> {
  await tx.unsafe(content);
  await tx`
    INSERT INTO schema_migrations (version, filename)
    VALUES (${version}, ${filename})
  `;
}

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INT PRIMARY KEY,
      filename    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const files: Array<{ version: number; filename: string }> = [];

  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (!entry.isFile) continue;

    const match = entry.name.match(/^(\d+)_.*\.sql$/);
    if (!match) continue;

    files.push({ version: parseInt(match[1], 10), filename: entry.name });
  }

  files.sort((left, right) => left.version - right.version);

  return await Promise.all(
    files.map(async (file) => ({
      ...file,
      content: await Deno.readTextFile(new URL(file.filename, MIGRATIONS_DIR)),
    })),
  );
}

export async function detectBootstrapVersions(tx: SqlExecutor): Promise<void> {
  const [thoughtsTable] = await tx`
    SELECT 1 AS found FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'thoughts'
  `;
  if (thoughtsTable) {
    await tx`
      INSERT INTO schema_migrations (version, filename)
      VALUES (1, '001_initial.sql')
      ON CONFLICT (version) DO NOTHING
    `;
  }

  const [needsEmbeddingColumn] = await tx`
    SELECT 1 AS found FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"needs_embedding"}
  `;
  if (needsEmbeddingColumn) {
    await tx`
      INSERT INTO schema_migrations (version, filename)
      VALUES (2, '002_needs_embedding.sql')
      ON CONFLICT (version) DO NOTHING
    `;
  }

  const [searchTextColumn] = await tx`
    SELECT 1 AS found FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"search_text"}
  `;
  const [normalizerVersionColumn] = await tx`
    SELECT 1 AS found FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"normalizer_version"}
  `;
  const [recallQueriesTable] = await tx`
    SELECT 1 AS found FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recall_queries'
  `;

  if (searchTextColumn && normalizerVersionColumn && recallQueriesTable) {
    await tx`
      INSERT INTO schema_migrations (version, filename)
      VALUES (3, '003_search_text_and_recall_queries.sql')
      ON CONFLICT (version) DO NOTHING
    `;
  }
}

async function repairMissingMigration003Artifacts(tx: SqlExecutor, migration003: MigrationFile): Promise<void> {
  const [version003] = await tx`
    SELECT 1 AS found FROM schema_migrations WHERE version = 3
  `;
  if (!version003) return;

  const [recallQueriesTable] = await tx`
    SELECT 1 AS found FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recall_queries'
  `;
  if (recallQueriesTable) return;

  try {
    console.warn("[migrate] version 003 recorded but recall_queries is missing - reapplying 003_search_text_and_recall_queries.sql");
    await tx.unsafe(migration003.content);
  } catch (err) {
    console.error("[migrate] FATAL: repair migration 003 failed:", err);
    Deno.exit(1);
  }
}