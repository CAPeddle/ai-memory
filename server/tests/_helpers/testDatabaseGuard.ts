/**
 * ST-092 R6 — refuse to run a destructive suite against a database that is not a
 * designated test database.
 *
 * **The hazard, concretely.** `workflow-mvp-e2e.test.ts` reads `DATABASE_URL` from the
 * environment and runs `DROP SCHEMA IF EXISTS workflow CASCADE` against whatever it
 * points at. `workflow` holds `execution_nodes`, so dropping it de-enrols every real
 * remote node and locks each one out behind a 401 until an operator reopens enrolment
 * by hand. CLAUDE.md's documented WSL2-native inner loop points `.env.dev` at the
 * SHARED DEV Postgres, and `deno test <file>` from the repo root is a command the
 * docs actively recommend — so the destructive path was one ordinary, documented
 * command away, with no error and no warning in between.
 *
 * **The guard asserts a property of the DATABASE, not of the environment.** A check
 * keyed on `CI`, `NODE_ENV`, or a URL substring would pass in exactly the case that
 * matters, because the dev inner loop looks like ordinary local development — which
 * it is. `db` and `db-test` are both `POSTGRES_DB: ai_memory`, so the database NAME
 * does not discriminate either (verified: `current_database()` returns `ai_memory` on
 * both). What discriminates is a database-level setting applied only by the test
 * stack's seed step: `ALTER DATABASE ai_memory SET ai_memory.test_database = 'true'`,
 * stored in `pg_db_role_setting` where no `DROP SCHEMA` can reach it.
 *
 * **It fails closed.** Marker absent, marker not `true`, or the probe itself throwing
 * all produce a refusal. A guard that treats "I could not tell" as "go ahead" is worse
 * than none, because its passing result is read as enforcement.
 *
 * **It throws; it does not skip.** A skip would make a native run look green while the
 * suite silently stopped executing, and a skip that quietly became universal is the
 * fails-open mode this guard exists to avoid. Throwing means a native full-suite run
 * shows a real failure on the guarded files, which is the correct report: those files
 * genuinely cannot run there.
 */

import { sql } from "../../src/db.ts";

/** The database-level setting `server/tests/fixtures/test-database-marker.sql` applies. */
export const TEST_DATABASE_MARKER = "ai_memory.test_database";

export interface TestDatabaseProbe {
  /** Returns the marker's value, or `null` when it is unset. */
  markerValue(): Promise<string | null>;
  /** Only used to make the refusal message concrete. */
  describe(): Promise<string>;
}

const realProbe: TestDatabaseProbe = {
  markerValue: async () => {
    // The `true` second argument makes `current_setting` return NULL for an unset
    // custom parameter instead of raising — so an unmarked database answers the
    // question rather than erroring, and a genuine connection failure still throws.
    const rows = await sql<{ marker: string | null }[]>`
      SELECT current_setting(${TEST_DATABASE_MARKER}, true) AS marker
    `;
    return rows[0]?.marker ?? null;
  },
  describe: async () => {
    const rows = await sql<{ db: string; host: string | null }[]>`
      SELECT current_database() AS db, inet_server_addr()::text AS host
    `;
    return `${rows[0]?.db ?? "?"} at ${rows[0]?.host ?? "(local socket)"}`;
  },
};

function refusal(reason: string, where: string): Error {
  return new Error(
    `REFUSING TO RUN: this suite drops schemas and tables, and ${reason}.\n` +
      `  Connected to: ${where}\n` +
      `  Dropping the \`workflow\` schema removes \`execution_nodes\`, which de-enrols\n` +
      `  every real remote execution node and locks it out behind a 401 until an\n` +
      `  operator reopens enrolment by hand. Dropping \`schema_migrations\` or\n` +
      `  \`recall_queries\` destroys real platform state the same way.\n` +
      `  Run this suite against the Docker test stack:\n` +
      `    docker compose --profile test exec mcp-test deno test ...\n` +
      `  A designated test database carries \`${TEST_DATABASE_MARKER} = true\`, applied\n` +
      `  by the compose \`seed\` service from server/tests/fixtures/test-database-marker.sql.`,
  );
}

/**
 * Throw unless the connected database is positively identified as a test database.
 *
 * Call this once, before the first destructive statement in a suite. `probe` exists so
 * the guard's own tests can drive every branch — including the ones that cannot be
 * produced on demand against a real connection — without pointing anything at a
 * database it must never touch.
 */
export async function requireTestDatabase(
  probe: TestDatabaseProbe = realProbe,
): Promise<void> {
  // Only ever used to make a refusal concrete, so it is fetched at the throw sites
  // rather than up front — the accepting path is the common one and owes no round
  // trip for a string it will discard. A probe that cannot answer must not turn a
  // refusal into a pass, so its failure degrades the message and nothing else.
  const whereOr = async (): Promise<string> => {
    try {
      return await probe.describe();
    } catch {
      return "(could not be determined)";
    }
  };

  let marker: string | null;
  try {
    marker = await probe.markerValue();
  } catch (error) {
    // Fail closed. An unreachable or uncooperative database is not evidence that
    // dropping things on it is safe. No `describe()` here: the connection that just
    // failed the marker query is in no position to answer a second one.
    throw refusal(
      `the check for the test-database marker could not be completed ` +
        `(${error instanceof Error ? error.message : String(error)})`,
      "(could not be determined)",
    );
  }

  if (marker === null || marker === "") {
    throw refusal(
      `this database carries no \`${TEST_DATABASE_MARKER}\` marker`,
      await whereOr(),
    );
  }
  if (marker !== "true") {
    throw refusal(
      `its \`${TEST_DATABASE_MARKER}\` marker is ${JSON.stringify(marker)}, not "true"`,
      await whereOr(),
    );
  }
}
