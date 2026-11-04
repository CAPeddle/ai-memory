import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import postgres from "npm:postgres@3.4.4";

import { POLICY_SCOPES, type PolicyScope } from "../../shared/policyScope.ts";
import { sql } from "../src/db.ts";
import { withPolicyScope } from "../src/policyScope.ts";
import { requireTestDatabase } from "./_helpers/testDatabaseGuard.ts";

/**
 * ST-082 / 05-02 — DECISION-01 technical spike: does Postgres row-level security,
 * driven by a transaction-scoped `app.policy_scope` GUC set by `withPolicyScope()`,
 * implement the D-03/D-06 visibility matrix through postgres.js's real connection
 * pool, and does it fail closed on both kinds of "unscoped" connection?
 *
 * Design choices that carry the evidence (see 05-RESEARCH.md Pattern 3 and Pitfall 2):
 *
 * - **Commit-and-teardown, not rollback.** The RLS DDL is committed against db-test's
 *   real `public.thoughts` and torn down in `finally`. A single outer `sql.begin()`
 *   rollback would hold the DDL on one connection while `withPolicyScope()` checks out
 *   another, which would then see RLS off and prove nothing about pooling.
 * - **A dedicated non-superuser role.** The application's `ai_memory` role is a Postgres
 *   superuser, and superusers bypass RLS unconditionally (`FORCE ROW LEVEL SECURITY`
 *   only closes the table-owner exemption). Every RLS-sensitive query therefore runs
 *   through `spikeSql`, authenticated as `ai_memory_rls_spike`, which is asserted to be
 *   neither `rolsuper` nor `rolbypassrls` before any visibility case runs. The shared
 *   superuser `sql` is used only for provisioning, seeding, RLS DDL and teardown.
 * - **Two distinct "unscoped" states.** A never-scoped connection reads the GUC as
 *   NULL; a connection reused after a committed scoped transaction reads it as `''`.
 *   Cases (b) and (d) assert the GUC value itself so they are provably different
 *   cases, not two zero-row results that happen to agree.
 *
 * Teardown is load-bearing and its order is deliberate: RLS is disabled before the
 * seeded rows are deleted (so the DELETE could never be filtered), and the role's
 * grant is revoked before the role is dropped. The final statements of `finally`
 * prove, against three separate catalogs, that db-test was left as it was found.
 */
await requireTestDatabase();

const SPIKE_ROLE = "ai_memory_rls_spike";
const SPIKE_PASSWORD = "rls_spike_test_only";

type VisibleRow = { id: string; policy_scope: string };

function spikeConnectionUrl(): string {
  const raw = Deno.env.get("DATABASE_URL");
  if (!raw) throw new Error("DATABASE_URL environment variable is not set");
  const url = new URL(raw);
  url.username = SPIKE_ROLE;
  url.password = SPIKE_PASSWORD;
  return url.toString();
}

function sortedScopes(rows: readonly VisibleRow[]): string[] {
  return rows.map((row) => row.policy_scope).sort();
}

function sortedIds(rows: readonly VisibleRow[]): string[] {
  return rows.map((row) => row.id).sort();
}

Deno.test({
  name:
    "DECISION-01 spike: RLS + withPolicyScope() enforces the D-03/D-06 visibility matrix and fails closed",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    let spikeSql: postgres.Sql | undefined;
    const held: postgres.ReservedSql[] = [];
    const testIds: string[] = [];
    const idByScope = new Map<PolicyScope, string>();
    let primaryError: unknown;

    const reserve = async (): Promise<postgres.ReservedSql> => {
      const reserved = await spikeSql!.reserve();
      held.push(reserved);
      return reserved;
    };
    const release = (reserved: postgres.ReservedSql): void => {
      held.splice(held.indexOf(reserved), 1);
      reserved.release();
    };

    try {
      // ---- Provision the non-superuser role the RLS assertions run as. ----
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_memory_rls_spike') THEN
            CREATE ROLE ai_memory_rls_spike LOGIN PASSWORD 'rls_spike_test_only';
          END IF;
        END $$
      `;
      await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON public.thoughts TO ai_memory_rls_spike`;

      // Setup sanity: without this, every visibility assertion below is meaningless.
      const roleFlags = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
        SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${SPIKE_ROLE}
      `;
      assertEquals(roleFlags.length, 1, "spike role must exist after provisioning");
      assertEquals(roleFlags[0].rolsuper, false, "spike role must not be a superuser");
      assertEquals(roleFlags[0].rolbypassrls, false, "spike role must not have BYPASSRLS");

      spikeSql = postgres(spikeConnectionUrl(), { max: 3, idle_timeout: 30, connect_timeout: 10 });

      // ---- Seed one row per scope BEFORE enabling RLS (as the superuser). ----
      for (const scope of POLICY_SCOPES) {
        const [row] = await sql<{ id: string }[]>`
          INSERT INTO public.thoughts (content, content_fingerprint, policy_scope)
          VALUES (
            ${`DECISION-01 RLS spike row (${scope})`},
            ${`policy-scope-rls-spike-${scope}-${crypto.randomUUID()}`},
            ${scope}
          )
          RETURNING id
        `;
        testIds.push(row.id);
        idByScope.set(scope, row.id);
      }

      // ---- Apply the real RLS DDL, committed, on db-test's public.thoughts. ----
      await sql`ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY`;
      await sql`ALTER TABLE thoughts FORCE ROW LEVEL SECURITY`;
      // Allow-list guard, not IS NOT NULL: a reused pooled connection carries '' after
      // a committed scoped transaction, which IS NOT NULL would admit (Pattern 3).
      await sql`
        CREATE POLICY policy_scope_isolation ON thoughts
          USING (
            current_setting('app.policy_scope', true) IN ('personal', 'corporate', 'mixed', 'public')
            AND (
              policy_scope = 'public'
              OR policy_scope = current_setting('app.policy_scope', true)
            )
          )
      `;

      const expectedFor = (scope: PolicyScope): string[] =>
        (scope === "public" ? ["public"] : [scope, "public"]).sort();
      const expectedIdsFor = (scope: PolicyScope): string[] =>
        expectedFor(scope).map((s) => idByScope.get(s as PolicyScope)!).sort();

      // ---- Case (b), FIRST: a fresh, never-scoped connection sees nothing. ----
      // This must be the first query issued on spikeSql, so the reserved connection is
      // genuinely fresh rather than one a scoped call already left carrying ''.
      {
        const fresh = await reserve();
        const [who] = await fresh<{ user: string; guc: string | null }[]>`
          SELECT current_user AS user, current_setting('app.policy_scope', true) AS guc
        `;
        assertEquals(who.user, SPIKE_ROLE, "case (b) must run as the non-superuser spike role");
        assertEquals(who.guc, null, "case (b) connection must never have been scoped (GUC NULL)");
        const rows = await fresh<VisibleRow[]>`
          SELECT id, policy_scope FROM thoughts WHERE id = ANY(${testIds}::uuid[])
        `;
        assertEquals(sortedScopes(rows), [], "a never-scoped connection must see zero rows, including public");
        release(fresh);
      }

      // ---- Case (a): personal / corporate / mixed each see exactly {itself, public}. ----
      for (const scope of ["personal", "corporate", "mixed"] as const) {
        const rows = await withPolicyScope(
          scope,
          (tx) =>
            tx<VisibleRow[]>`
              SELECT id, policy_scope FROM thoughts WHERE id = ANY(${testIds}::uuid[])
            `,
          spikeSql,
        );
        assertEquals(sortedScopes(rows), expectedFor(scope), `case (a): ${scope} visibility`);
        assertEquals(sortedIds(rows), expectedIdsFor(scope), `case (a): ${scope} row identity`);
      }

      // ---- Case (c): a public-declared scope sees only public (D-06). ----
      {
        const rows = await withPolicyScope(
          "public",
          (tx) =>
            tx<VisibleRow[]>`
              SELECT id, policy_scope FROM thoughts WHERE id = ANY(${testIds}::uuid[])
            `,
          spikeSql,
        );
        assertEquals(sortedScopes(rows), ["public"], "case (c): public sees only public");
        assertEquals(sortedIds(rows), expectedIdsFor("public"), "case (c): public row identity");
      }

      // ---- Case (d): the SAME physical connection, reused after a committed scoped
      // transaction, receives an unscoped query and must see nothing. ----
      {
        const reused = await reserve();
        await reused`BEGIN`;
        await reused`SELECT set_config('app.policy_scope', 'personal', true)`;
        const inside = await reused<VisibleRow[]>`
          SELECT id, policy_scope FROM thoughts WHERE id = ANY(${testIds}::uuid[])
        `;
        assertEquals(sortedScopes(inside), expectedFor("personal"), "case (d): scoped step sees {personal, public}");
        await reused`COMMIT`;

        const [state] = await reused<{ guc: string | null; is_not_null: boolean }[]>`
          SELECT current_setting('app.policy_scope', true) AS guc,
                 current_setting('app.policy_scope', true) IS NOT NULL AS is_not_null
        `;
        // The leftover value is '' — NOT NULL — which is exactly what an IS NOT NULL-only
        // guard would admit. Asserting it makes this the empty-string case by observation.
        assertEquals(state.guc, "", "case (d): committed scoped transaction leaves '' on the connection");
        assertEquals(state.is_not_null, true, "case (d): an IS NOT NULL guard would admit this connection");

        const after = await reused<VisibleRow[]>`
          SELECT id, policy_scope FROM thoughts WHERE id = ANY(${testIds}::uuid[])
        `;
        assertEquals(sortedScopes(after), [], "case (d): reused unscoped connection must see zero rows, including public");
        release(reused);
      }
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      const teardownErrors: string[] = [];
      const step = async (name: string, run: () => Promise<unknown>): Promise<void> => {
        try {
          await run();
        } catch (error) {
          teardownErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      };

      // 1. Release still-held reserved connections. Roll back first: a connection left
      //    mid-transaction would hold a lock on thoughts that blocks DROP POLICY below.
      for (const reserved of [...held]) {
        await step("rollback reserved connection", () => reserved`ROLLBACK`);
        release(reserved);
      }
      // 2-4. Remove RLS state, as the superuser, BEFORE deleting any rows.
      await step("DROP POLICY", () => sql`DROP POLICY IF EXISTS policy_scope_isolation ON thoughts`);
      await step("NO FORCE", () => sql`ALTER TABLE thoughts NO FORCE ROW LEVEL SECURITY`);
      await step("DISABLE", () => sql`ALTER TABLE thoughts DISABLE ROW LEVEL SECURITY`);
      // 5. Only now delete the seeded rows. consolidation_log references thoughts without
      //    ON DELETE CASCADE, and the running test server's worker may have touched them.
      if (testIds.length > 0) {
        await step("DELETE consolidation_log", () =>
          sql`
            DELETE FROM consolidation_log
            WHERE thought_id = ANY(${testIds}::uuid[]) OR wiki_id = ANY(${testIds}::uuid[])
          `);
        await step("DELETE seeded rows", () => sql`DELETE FROM thoughts WHERE id = ANY(${testIds}::uuid[])`);
      }
      // 6. Close the spike role's pool before dropping the role it authenticates as.
      if (spikeSql) await step("spikeSql.end()", () => spikeSql!.end());
      // 7-8. REVOKE before DROP ROLE: the table grant is a dependency DROP ROLE refuses.
      await step("REVOKE", () =>
        sql`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_memory_rls_spike') THEN
              REVOKE ALL ON public.thoughts FROM ai_memory_rls_spike;
            END IF;
          END $$
        `);
      await step("DROP ROLE", () => sql`DROP ROLE IF EXISTS ai_memory_rls_spike`);

      // ---- Teardown proof: the last statements of finally, on pass and fail paths. ----
      if (testIds.length > 0) {
        const [leftover] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM thoughts WHERE id = ANY(${testIds}::uuid[])
        `;
        assertEquals(leftover.count, 0, "seeded rows must not leak into shared db-test");
      }
      const [flags] = await sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = 'thoughts' AND relnamespace = 'public'::regnamespace
      `;
      assertEquals(flags.relrowsecurity, false, "RLS must be disabled on thoughts after teardown");
      assertEquals(flags.relforcerowsecurity, false, "FORCE RLS must be off on thoughts after teardown");
      const [policies] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'thoughts' AND policyname = 'policy_scope_isolation'
      `;
      assertEquals(policies.count, 0, "policy_scope_isolation must not exist after teardown");
      const [roles] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_roles WHERE rolname = ${SPIKE_ROLE}
      `;
      assertEquals(roles.count, 0, "ai_memory_rls_spike must not exist after teardown");

      if (teardownErrors.length > 0) {
        const prefix = primaryError instanceof Error ? `after test failure (${primaryError.message}); ` : "";
        assert(false, `${prefix}teardown steps failed: ${teardownErrors.join("; ")}`);
      }
    }
  },
});
