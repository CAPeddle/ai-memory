import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { detectBootstrapVersions, runMigrations } from "../src/migrate.ts";
import { requireTestDatabase } from "./_helpers/testDatabaseGuard.ts";

/**
 * ST-082 / v1.1 Policy-Scope Isolation — POLICY-01 and POLICY-02.
 *
 * This file mutates schema state (drops and re-adds `thoughts.policy_scope`, drops
 * `schema_migrations`), so it refuses to run against anything but a marked test
 * database, exactly as migrations.test.ts does.
 */
await requireTestDatabase();

const PG_CHECK_VIOLATION = "23514";
const PG_NOT_NULL_VIOLATION = "23502";

function hasSqlState(code: string): (err: Error) => boolean {
  return (err) => (err as Error & { code?: string }).code === code;
}

Deno.test({
  name: "migration 007: backfills pre-existing rows to corporate and enforces NOT NULL + CHECK",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const migration = await Deno.readTextFile(new URL("../db/007_policy_scope.sql", import.meta.url));

    await sql.begin(async (tx) => {
      // Undo the schema.sql-declared column so this transaction looks like a genuine
      // pre-007 database.
      await tx`ALTER TABLE public.thoughts DROP COLUMN IF EXISTS policy_scope`;

      const [legacy] = await tx<{ id: string }[]>`
        INSERT INTO public.thoughts (content, content_fingerprint)
        VALUES ('migration 007 legacy row', ${`migration-007-legacy-${crypto.randomUUID()}`})
        RETURNING id
      `;

      await tx.unsafe(migration);

      const [backfilled] = await tx<{ policy_scope: string }[]>`
        SELECT policy_scope FROM public.thoughts WHERE id = ${legacy.id}
      `;
      assertEquals(backfilled.policy_scope, "corporate");

      // Each negative case runs in its own savepoint. A failed statement directly
      // inside `tx` would abort the whole transaction (25P02), and a second
      // assertRejects would then pass for that reason rather than the one it names.
      await assertRejects(
        () =>
          tx.savepoint((sp) =>
            sp`
              INSERT INTO public.thoughts (content, content_fingerprint, policy_scope)
              VALUES ('migration 007 bogus scope', ${`migration-007-bogus-${crypto.randomUUID()}`}, 'bogus')
            `
          ),
        Error,
        undefined,
      ).then((err) => assertEquals(hasSqlState(PG_CHECK_VIOLATION)(err), true, `expected SQLSTATE 23514, got ${(err as { code?: string }).code}`));

      await assertRejects(
        () =>
          tx.savepoint((sp) =>
            sp`
              INSERT INTO public.thoughts (content, content_fingerprint)
              VALUES ('migration 007 omitted scope', ${`migration-007-omitted-${crypto.randomUUID()}`})
            `
          ),
        Error,
        undefined,
      ).then((err) => assertEquals(hasSqlState(PG_NOT_NULL_VIOLATION)(err), true, `expected SQLSTATE 23502, got ${(err as { code?: string }).code}`));

      throw new Error("rollback migration 007 fixture");
    }).catch((err) => {
      if ((err as Error).message !== "rollback migration 007 fixture") throw err;
    });
  },
});

Deno.test({
  name: "migration 007 bootstrap: only marks v7 when policy_scope is NOT NULL and CHECK-constrained, not merely present",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.thoughts DROP COLUMN IF EXISTS policy_scope`;
      await tx`DROP TABLE IF EXISTS schema_migrations`;
      await tx`
        CREATE TABLE schema_migrations (
          version     INT PRIMARY KEY,
          filename    TEXT NOT NULL,
          applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await detectBootstrapVersions(tx);
      const withoutColumn = await tx<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 7
      `;
      assertEquals(withoutColumn.length, 0);

      // A bare, nullable, unconstrained column is NOT the migrated shape.
      await tx`ALTER TABLE public.thoughts ADD COLUMN policy_scope text`;
      await detectBootstrapVersions(tx);
      const withBareColumn = await tx<{ version: number }[]>`
        SELECT version FROM schema_migrations WHERE version = 7
      `;
      assertEquals(withBareColumn.length, 0);

      await tx`UPDATE public.thoughts SET policy_scope = 'corporate' WHERE policy_scope IS NULL`;
      await tx`ALTER TABLE public.thoughts ALTER COLUMN policy_scope SET NOT NULL`;
      await tx`
        ALTER TABLE public.thoughts ADD CONSTRAINT thoughts_policy_scope_check
          CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public'))
      `;
      await detectBootstrapVersions(tx);
      const withFullShape = await tx<{ version: number; filename: string }[]>`
        SELECT version, filename FROM schema_migrations WHERE version = 7
      `;
      assertEquals([...withFullShape], [{ version: 7, filename: "007_policy_scope.sql" }]);

      throw new Error("rollback migration 007 bootstrap fixture");
    }).catch((err) => {
      if ((err as Error).message !== "rollback migration 007 bootstrap fixture") throw err;
    });

    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await runMigrations();
  },
});
