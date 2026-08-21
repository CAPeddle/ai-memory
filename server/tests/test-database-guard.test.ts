/**
 * ST-092 U6 (R6) — the destructive-suite guard, and proof that it can refuse.
 *
 * A guard that has never been observed refusing is indistinguishable from one that
 * always passes, so most of this file drives the guard through an injected probe: the
 * refusal branches are exercised directly rather than reasoned about. The last test
 * closes the other half — it asserts that the REAL probe, against the database this
 * suite is actually connected to, finds the marker. Without it every refusal test
 * above would still pass on a guard that refused unconditionally, and the suites it
 * protects would never run again.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import {
  readDatabaseScopedMarker,
  requireTestDatabase,
  TEST_DATABASE_MARKER,
  type TestDatabaseProbe,
} from "./_helpers/testDatabaseGuard.ts";

function probe(
  markerValue: () => Promise<string | null>,
  description = "ai_memory at 10.0.0.9",
): TestDatabaseProbe {
  return { markerValue, describe: () => Promise.resolve(description) };
}

Deno.test("ST-092 R6: a marked database is accepted", async () => {
  await requireTestDatabase(probe(() => Promise.resolve("true")));
});

Deno.test("ST-092 R6: an unmarked database is refused", async () => {
  const error = await assertRejects(
    () => requireTestDatabase(probe(() => Promise.resolve(null))),
    Error,
    "REFUSING TO RUN",
  );
  assertStringIncludes(error.message, TEST_DATABASE_MARKER);
  // The message has to say what is at stake, or the next person to hit it will
  // reach for the shortest way to make it stop.
  assertStringIncludes(error.message, "execution_nodes");
  assertStringIncludes(error.message, "de-enrols");
  assertStringIncludes(error.message, "docker compose --profile test");
  assertStringIncludes(
    error.message,
    "ai_memory at 10.0.0.9",
    "the refusal must name the database it refused, so the reader knows which one",
  );
});

Deno.test("ST-092 R6: a marker set to anything but `true` is refused", async () => {
  for (const value of ["false", "TRUE", "1", "yes", ""]) {
    await assertRejects(
      () => requireTestDatabase(probe(() => Promise.resolve(value))),
      Error,
      "REFUSING TO RUN",
      `marker ${JSON.stringify(value)} must not be accepted`,
    );
  }
});

Deno.test("ST-092 R6: an unreadable marker fails CLOSED", async () => {
  // The case that decides whether this is a guard or a decoration. A check that
  // treats "I could not tell" as "go ahead" reads as enforcement while enforcing
  // nothing.
  const error = await assertRejects(
    () =>
      requireTestDatabase(
        probe(() => Promise.reject(new Error("connection refused"))),
      ),
    Error,
    "REFUSING TO RUN",
  );
  assertStringIncludes(error.message, "connection refused");
});

Deno.test("ST-092 R6: a failing describe() does not turn a refusal into a pass", async () => {
  await assertRejects(
    () =>
      requireTestDatabase({
        markerValue: () => Promise.resolve(null),
        describe: () => Promise.reject(new Error("no")),
      }),
    Error,
    "REFUSING TO RUN",
  );
});

Deno.test({
  name:
    "ST-092 R6 control: the REAL probe finds the marker on the database this suite is connected to",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Non-vacuity for the whole file: the refusal tests above are all satisfied by a
    // guard that refuses everything. This is the assertion that would catch that, and
    // it is also the assertion that catches a test stack whose seed step silently did
    // not apply the marker.
    await requireTestDatabase();

    const rows = await sql<{ marker: string | null; db: string }[]>`
      SELECT current_setting(${TEST_DATABASE_MARKER}, true) AS marker,
             current_database() AS db
    `;
    assertEquals(rows[0].marker, "true");

    // And the reason the marker exists rather than a name check: the shared dev
    // database and the throwaway one are both called `ai_memory`, so the name cannot
    // tell them apart. If this ever stops being true the marker is still correct, but
    // the comment explaining it would have gone stale.
    assert(
      typeof rows[0].db === "string" && rows[0].db.length > 0,
      "sanity: the connection answers",
    );
  },
});

Deno.test({
  name:
    "ST-092 R6 control: the marker survives DROP SCHEMA, which is the operation it guards",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // A marker table would have been the obvious design and would have been wrong:
    // the suites this protects drop schemas, so evidence stored in one has a window
    // in it. Demonstrated on a scratch schema rather than argued.
    await sql.unsafe("DROP SCHEMA IF EXISTS st092_marker_probe CASCADE");
    await sql.unsafe("CREATE SCHEMA st092_marker_probe");
    try {
      await sql.unsafe("DROP SCHEMA st092_marker_probe CASCADE");
      await requireTestDatabase();
    } finally {
      await sql.unsafe("DROP SCHEMA IF EXISTS st092_marker_probe CASCADE");
    }
  },
});

// ---------------------------------------------------------------------------
// PR #52 round 2 — the marker must be a property of the DATABASE, which is what this
// file's opening docblock has claimed from the start and what `current_setting` alone
// does not deliver. `current_setting` returns the EFFECTIVE session value, so a
// connection string carrying `options=-c ai_memory.test_database=true`, a role with
// `ALTER ROLE ... SET`, or a plain `SET` in the session all answer "true" on a
// database nobody ever designated as expendable — and the guard would then clear the
// destructive suites to drop `workflow`, `schema_migrations`, and `recall_queries` on
// it. Raised by an automated reviewer (Codex); the gap is between the docblock's
// claim and the query, not in the guard's branching, which is why every existing test
// in this file passes over it.
//
// Both tests below run inside `sql.begin` with `set_config(..., is_local => true)`,
// so the override is scoped to that transaction and never outlives it on a pooled
// connection — the search_path pollution this repo already documents, arrived at from
// the other direction.
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "PR52-F6: a marker present only in the session must not read as a database marker",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // A name no `ALTER DATABASE` has ever been run against, so the ONLY place it can
    // be found is the session — which is exactly the shape of the attack: a setting
    // supplied by the connection rather than designated on the database.
    const sessionOnly = "ai_memory.pr52_session_only_marker";

    await sql.begin(async (tx) => {
      await tx`SELECT set_config(${sessionOnly}, 'true', true)`;

      // Non-vacuity: the override really is in force for this transaction. Without
      // this the assertion below passes for a query that returned null because it
      // errored, because it looked at the wrong database, or because nothing was set.
      const sessionSays = await tx<{ v: string | null }[]>`
        SELECT current_setting(${sessionOnly}, true) AS v
      `;
      assertEquals(
        sessionSays[0].v,
        "true",
        "precondition: the session override must be in force",
      );

      assertEquals(
        await readDatabaseScopedMarker(tx, sessionOnly),
        null,
        "a setting present only in the session is not a designated test database",
      );
    });
  },
});

Deno.test({
  name:
    "PR52-F6b: a session override must not be able to contradict the database's own marker",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    await sql.begin(async (tx) => {
      // The inverse direction, and the one that proves the fix reads the catalog
      // rather than merely ignoring everything: this database IS designated, and a
      // session that says otherwise must not be believed either way round.
      await tx`SELECT set_config(${TEST_DATABASE_MARKER}, 'false', true)`;

      const sessionSays = await tx<{ v: string | null }[]>`
        SELECT current_setting(${TEST_DATABASE_MARKER}, true) AS v
      `;
      assertEquals(
        sessionSays[0].v,
        "false",
        "precondition: the session override must be in force",
      );

      assertEquals(
        await readDatabaseScopedMarker(tx),
        "true",
        "the designated marker is a property of the database, not of the session",
      );
    });
  },
});
