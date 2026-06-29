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
    assertEquals(afterBootstrap.map((row) => row.version), [1, 2, 3, 4, 5, 6]);
    assertEquals(afterBootstrap.map((row) => row.filename), [
      "001_initial.sql",
      "002_needs_embedding.sql",
      "003_search_text_and_recall_queries.sql",
      "004_worker_runs.sql",
      "005_feedback_events.sql",
      "006_tags_replace_profile.sql",
    ]);

    await runMigrations();
    const afterRerun = await sql<{ version: number }[]>`
      SELECT version FROM schema_migrations ORDER BY version
    `;
    assertEquals(afterRerun.map((row) => row.version), [1, 2, 3, 4, 5, 6]);

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
    assertEquals(afterPartial.map((row) => row.version), [1, 2, 3, 4, 5, 6]);

    const [recallProfileColumn] = await sql`
      SELECT 1 AS found FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recall_queries' AND column_name = 'profile'
    `;
    assertEquals(recallProfileColumn, undefined);

    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();
  },
});

Deno.test({
  name: "migration 006: backfills profile values, creates GIN tags index, and drops binary columns",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const migration = await Deno.readTextFile(new URL("../db/006_tags_replace_profile.sql", import.meta.url));

    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS profile text`;
      await tx`ALTER TABLE public.recall_queries ADD COLUMN IF NOT EXISTS profile text`;

      const professionalFingerprint = `migration-006-professional-${crypto.randomUUID()}`;
      const personalFingerprint = `migration-006-personal-${crypto.randomUUID()}`;
      const nullFingerprint = `migration-006-null-${crypto.randomUUID()}`;

      const [professional] = await tx<{ id: string }[]>`
        INSERT INTO public.thoughts (content, content_fingerprint, profile, tags)
        VALUES ('migration 006 professional row', ${professionalFingerprint}, 'professional', ARRAY['contact']::text[])
        RETURNING id
      `;
      const [personal] = await tx<{ id: string }[]>`
        INSERT INTO public.thoughts (content, content_fingerprint, profile)
        VALUES ('migration 006 personal row', ${personalFingerprint}, 'personal')
        RETURNING id
      `;
      const [nullProfile] = await tx<{ id: string }[]>`
        INSERT INTO public.thoughts (content, content_fingerprint, profile)
        VALUES ('migration 006 null row', ${nullFingerprint}, NULL)
        RETURNING id
      `;

      await tx.unsafe(migration);

      const rows = await tx<{ id: string; tags: string[] }[]>`
        SELECT id, tags FROM public.thoughts
        WHERE id = ANY(${[professional.id, personal.id, nullProfile.id]}::uuid[])
        ORDER BY content
      `;
      const tagsById = new Map(rows.map((row) => [row.id, row.tags]));
      assertEquals(tagsById.get(professional.id), ["contact", "developer"]);
      assertEquals(tagsById.get(personal.id), ["personal"]);
      assertEquals(tagsById.get(nullProfile.id), []);

      const [profileColumn] = await tx`
        SELECT 1 AS found FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = 'profile'
      `;
      assertEquals(profileColumn, undefined);

      const [recallProfileColumn] = await tx`
        SELECT 1 AS found FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recall_queries' AND column_name = 'profile'
      `;
      assertEquals(recallProfileColumn, undefined);

      const [indexRow] = await tx<{ access_method: string; columns: string[] }[]>`
        SELECT am.amname AS access_method, array_agg(a.attname ORDER BY a.attnum) AS columns
        FROM pg_class idx
        JOIN pg_index i ON i.indexrelid = idx.oid
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = tbl.relnamespace
        JOIN pg_am am ON am.oid = idx.relam
        JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname = 'public'
          AND tbl.relname = 'thoughts'
          AND idx.relname = 'idx_thoughts_tags'
        GROUP BY am.amname
      `;
      assertEquals(indexRow.access_method, "gin");
      assertEquals(indexRow.columns, ["tags"]);

      throw new Error("rollback migration 006 fixture");
    }).catch((err) => {
      if ((err as Error).message !== "rollback migration 006 fixture") throw err;
    });
  },
});

Deno.test({
  name: "migration 006 bootstrap: only marks v6 when tags exists and profile is absent",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS profile text`;
      await tx`DROP TABLE IF EXISTS schema_migrations`;
      await tx`
        CREATE TABLE schema_migrations (
          version     INT PRIMARY KEY,
          filename    TEXT NOT NULL,
          applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await detectBootstrapVersions(tx);

      const withProfile = await tx<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 6
      `;
      assertEquals(withProfile.length, 0);

      await tx`ALTER TABLE public.thoughts DROP COLUMN profile`;
      await detectBootstrapVersions(tx);

      const withoutProfile = await tx<{ version: number; filename: string }[]>`
        SELECT version, filename FROM schema_migrations WHERE version = 6
      `;
      assertEquals([...withoutProfile], [{ version: 6, filename: "006_tags_replace_profile.sql" }]);

      throw new Error("rollback migration 006 bootstrap fixture");
    }).catch((err) => {
      if ((err as Error).message !== "rollback migration 006 bootstrap fixture") throw err;
    });

    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();
  },
});

Deno.test({
  name: "fresh schema baseline declares tags and recall_queries has no profile column",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const schemaSql = await Deno.readTextFile(new URL("../db/schema.sql", import.meta.url));
    assert(schemaSql.includes("tags                text[]      NOT NULL DEFAULT '{}'::text[]"));
    assert(schemaSql.includes("idx_thoughts_tags"));
    assert(!schemaSql.includes("profile             text"));
    assert(!schemaSql.includes("profile          text"));

    const [tagsColumn] = await sql<{ data_type: string; is_nullable: string; column_default: string }[]>`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = 'tags'
    `;
    assertEquals(tagsColumn.data_type, "ARRAY");
    assertEquals(tagsColumn.is_nullable, "NO");
    assert(tagsColumn.column_default.includes("'{}'::text[]"));

    const [profileColumn] = await sql`
      SELECT 1 AS found FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = 'profile'
    `;
    assertEquals(profileColumn, undefined);

    const [recallProfileColumn] = await sql`
      SELECT 1 AS found FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recall_queries' AND column_name = 'profile'
    `;
    assertEquals(recallProfileColumn, undefined);
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
