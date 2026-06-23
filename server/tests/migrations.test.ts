import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { applyAndRecordVersion, detectBootstrapVersions, runMigrations } from "../src/migrate.ts";

Deno.test({
  name: "migration framework: bootstrap, apply, and rollback",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();

    const afterBootstrap = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM schema_migrations ORDER BY version
    `;
    assertEquals(afterBootstrap.map((row) => row.version), [1, 2, 3, 4, 5]);
    assertEquals(afterBootstrap.map((row) => row.filename), [
      "001_initial.sql",
      "002_needs_embedding.sql",
      "003_search_text_and_recall_queries.sql",
      "004_worker_runs.sql",
      "005_feedback_events.sql",
    ]);

    await runMigrations();
    const afterRerun = await sql<{ version: number }[]>`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    assertEquals(afterRerun.map((row) => row.version), [1, 2, 3, 4, 5]);

    const tempVersion = 999;
    const tempFilename = `${tempVersion}_test_marker.sql`;
    const tempTable = "_migtest_999";

    try {
      await sql.begin(async (tx) => {
        await applyAndRecordVersion(tx, tempVersion, tempFilename, `CREATE TABLE IF NOT EXISTS ${tempTable} (id int);`);
      });

      const [newRow] = await sql<{ version: number; filename: string }[]>`
        SELECT version, filename FROM schema_migrations WHERE version = ${tempVersion}
      `;
      assertEquals(newRow.version, tempVersion);
      assertEquals(newRow.filename, tempFilename);

      const [tableCheck] = await sql`
        SELECT to_regclass('public.${sql.unsafe(tempTable)}') AS oid
      `;
      assertEquals(!!tableCheck.oid, true);
    } finally {
      await sql`DROP TABLE IF EXISTS ${sql.unsafe(tempTable)}`;
      await sql`DELETE FROM schema_migrations WHERE version = ${tempVersion}`;
    }

    await assertRejects(
      () => sql.begin((tx) => applyAndRecordVersion(tx, 998, "998_broken.sql", "SELECT * FROM __nope__")),
    );
    const [badRow] = await sql<{ version: number }[]>`
      SELECT version FROM schema_migrations WHERE version = 998
    `;
    assertEquals(badRow, undefined);
  },
});

Deno.test({
  name: "migration 003 bootstrap: partial artifacts do not mark v3 applied",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await sql`DROP TABLE IF EXISTS recall_queries`;

    await sql`
      CREATE TABLE schema_migrations (
        version     INT PRIMARY KEY,
        filename    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql.begin(async (tx) => {
      await detectBootstrapVersions(tx);
    });

    const afterBootstrapProbe = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM schema_migrations ORDER BY version
    `;
    assertEquals(afterBootstrapProbe.map((row) => row.version), [1, 2, 4, 5]);

    await runMigrations();

    const afterPartial = await sql<{ version: number; filename: string }[]>`
      SELECT version, filename FROM schema_migrations ORDER BY version
    `;
    assertEquals(afterPartial.map((row) => row.version), [1, 2, 3, 4, 5]);

    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();
  },
});

Deno.test({
  name: "migration 003 repair probe reapplies missing recall_queries when v3 is already recorded",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await sql`
      CREATE TABLE schema_migrations (
        version     INT PRIMARY KEY,
        filename    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO schema_migrations (version, filename)
      VALUES
        (1, '001_initial.sql'),
        (2, '002_needs_embedding.sql'),
        (3, '003_search_text_and_recall_queries.sql')
    `;
    await sql`DROP TABLE IF EXISTS recall_queries`;

    await runMigrations();

    const [repairedTable] = await sql`
      SELECT to_regclass('public.recall_queries') AS oid
    `;
    assertEquals(!!repairedTable.oid, true);

    const versionRows = await sql<{ version: number }[]>`
      SELECT version FROM schema_migrations WHERE version = 3
    `;
    assertEquals(versionRows.length, 1);

    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();
    const restoredVersions = await sql<{ version: number }[]>`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    assert(restoredVersions.length >= 3);
  },
});