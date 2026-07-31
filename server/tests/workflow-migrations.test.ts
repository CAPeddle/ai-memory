/**
 * ST-084 spike — the workflow module's ordered migration mechanism.
 *
 * This file exists because the spike's original claim of "independent schema
 * evolution" was false. The module had one hardcoded `IF NOT EXISTS` DDL file, which
 * meant editing a `CREATE TABLE` body was a silent no-op against any existing
 * database and adding `002_*.sql` did nothing at all. No test caught either, so the
 * claim survived review on the strength of the schema *existing*.
 *
 * The hermetic tests below drive `applyMigrations` with synthetic in-memory
 * migrations against a throwaway schema and ledger. That shape is deliberate on two
 * counts:
 *
 *   1. **Re-runnable.** "Prove an existing 001 upgrades through 002" destroys its own
 *      precondition the first time it succeeds. Against the shared dev Postgres
 *      (CLAUDE.md: native tests reuse it) a fixed ledger would already hold 002 on the
 *      second run and the test could never set itself up again — a suite that passes
 *      once, which is the exact failure class this PR is about. Each test drops and
 *      recreates its own schema.
 *   2. **No filesystem writes.** CI runs `deno test --frozen --allow-net --allow-env
 *      --allow-read` (.github/workflows/ci.yml) — no `--allow-write`. Fixture files in
 *      a temp dir would pass locally and fail in CI.
 *
 * Discovery against the REAL directory is proven separately at the bottom.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import {
  applyMigrations,
  checksumOfText,
  type DiscoveredMigration,
  discoverMigrations,
  MIGRATION_LOCK_KEY,
  orderMigrationVersions,
  runWorkflowMigrations,
} from "../src/workflow/schema.ts";
import {
  MigrationApplyError,
  MigrationDiscoveryError,
  MigrationDriftError,
} from "../src/workflow/types.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

/** Build a synthetic migration whose checksum is derived from its own contents. */
async function migration(
  version: number,
  filename: string,
  statements: string,
): Promise<DiscoveredMigration> {
  return { version, filename, statements, checksum: await checksumOfText(statements) };
}

/** A throwaway schema + ledger, torn down after the test regardless of outcome. */
async function withScratchSchema(
  name: string,
  fn: (opts: { schemaName: string; ledgerTable: string }) => Promise<void>,
): Promise<void> {
  const ledgerTable = `${name}.schema_migrations`;
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
  try {
    await fn({ schemaName: name, ledgerTable });
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
  }
}

async function ledgerRows(ledgerTable: string) {
  return await sql.unsafe<
    { version: number; filename: string; checksum: string; applied_at: Date }[]
  >(`SELECT version, filename, checksum, applied_at FROM ${ledgerTable} ORDER BY version`);
}

async function tableExists(schemaName: string, table: string): Promise<boolean> {
  const rows = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM information_schema.tables
    WHERE table_schema = ${schemaName} AND table_name = ${table}
  `;
  return Number(rows[0].n) === 1;
}

Deno.test({
  ...T,
  name: "migrations: an existing 001 schema upgrades through 002",
  fn: async () => {
    await withScratchSchema("wf_migtest_upgrade", async (opts) => {
      const first = await migration(1, "001_alpha.sql", `
        CREATE TABLE ${opts.schemaName}.alpha (id int PRIMARY KEY);
      `);
      const second = await migration(2, "002_beta.sql", `
        ALTER TABLE ${opts.schemaName}.alpha ADD COLUMN label text;
        CREATE TABLE ${opts.schemaName}.beta (id int PRIMARY KEY);
      `);

      // Establish the precondition the reviewer's scenario actually cares about: a
      // database that already has 001 and knows nothing about 002.
      const initial = await applyMigrations([first], opts);
      assertEquals(initial.applied.map((a) => a.version), [1]);
      assertEquals(initial.skipped, []);
      assert(await tableExists(opts.schemaName, "alpha"));
      assert(!(await tableExists(opts.schemaName, "beta")), "002 must not have run yet");

      // Now 002 appears. This is the step the old mechanism could NOT do.
      const upgrade = await applyMigrations([first, second], opts);
      assertEquals(upgrade.applied.map((a) => a.version), [2], "only 002 is pending");
      assertEquals(upgrade.skipped.map((s) => s.version), [1], "001 is already applied");

      assert(await tableExists(opts.schemaName, "beta"), "002 created its table");
      const [col] = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${opts.schemaName}
          AND table_name = 'alpha' AND column_name = 'label'
      `;
      assertEquals(col?.column_name, "label", "002's ALTER also took effect");

      const ledger = await ledgerRows(opts.ledgerTable);
      assertEquals(ledger.map((r) => r.version), [1, 2]);
      assertEquals(ledger.map((r) => r.filename), ["001_alpha.sql", "002_beta.sql"]);
      assertEquals(ledger[1].checksum, second.checksum);
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: reruns are idempotent and do not restamp the ledger",
  fn: async () => {
    await withScratchSchema("wf_migtest_rerun", async (opts) => {
      // Deliberately NOT `IF NOT EXISTS` — as in the real 002. If the runner were to
      // re-execute an applied migration, this DDL would raise "already exists" rather
      // than passing quietly, so the test cannot succeed vacuously.
      const set = [
        await migration(1, "001_alpha.sql", `CREATE TABLE ${opts.schemaName}.alpha (id int);`),
        await migration(2, "002_beta.sql", `CREATE TABLE ${opts.schemaName}.beta (id int);`),
      ];

      const first = await applyMigrations(set, opts);
      assertEquals(first.applied.map((a) => a.version), [1, 2]);
      const before = await ledgerRows(opts.ledgerTable);

      const second = await applyMigrations(set, opts);
      assertEquals(second.applied, [], "a rerun must apply nothing");
      assertEquals(second.skipped.map((s) => s.version), [1, 2]);

      const after = await ledgerRows(opts.ledgerTable);
      assertEquals(after.length, 2, "a rerun must not add ledger rows");
      assertEquals(
        after.map((r) => r.applied_at.getTime()),
        before.map((r) => r.applied_at.getTime()),
        "a rerun must not restamp applied_at",
      );
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: changed contents of an APPLIED migration are detected as drift",
  fn: async () => {
    await withScratchSchema("wf_migtest_drift", async (opts) => {
      const original = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int);`,
      );
      await applyMigrations([original], opts);

      // The scenario: someone edits an applied migration instead of adding a new one.
      // Under the old IF NOT EXISTS mechanism this was a silent no-op and the file
      // and the database diverged with nothing reporting it.
      const edited = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int, extra text);`,
      );
      assert(edited.checksum !== original.checksum, "editing must change the checksum");

      const pending = await migration(
        2,
        "002_beta.sql",
        `CREATE TABLE ${opts.schemaName}.beta (id int);`,
      );

      const err = await assertRejects(
        () => applyMigrations([edited, pending], opts),
        MigrationDriftError,
      );
      assertEquals((err as MigrationDriftError).version, 1);
      assertEquals((err as MigrationDriftError).appliedChecksum, original.checksum);
      assertEquals((err as MigrationDriftError).currentChecksum, edited.checksum);

      // Drift must abort the whole run, not just skip the drifted file. A database
      // whose applied migrations no longer match their files is in an unknown state;
      // stacking 002 on top of it deepens the divergence.
      assert(
        !(await tableExists(opts.schemaName, "beta")),
        "drift must abort BEFORE applying pending migrations",
      );
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: an unchanged applied migration is NOT reported as drift",
  fn: async () => {
    // Red/green partner to the test above. Without it, a checksum comparison that
    // always threw would look identical to one that works.
    await withScratchSchema("wf_migtest_nodrift", async (opts) => {
      const only = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int);`,
      );
      await applyMigrations([only], opts);
      const report = await applyMigrations([only], opts);
      assertEquals(report.applied, []);
      assertEquals(report.skipped.map((s) => s.version), [1]);
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: a concurrent runner with DIFFERENT bytes for the same version is refused",
  fn: async () => {
    // The deployment race the advisory lock exists to make safe, and the one the
    // pre-lock drift scan CANNOT cover: when that scan ran, the ledger row did not
    // exist yet.
    //
    // Two runners start from an empty ledger holding different contents for version 1
    // — a mid-rollout deploy with two instances on different commits. A version-only
    // recheck under the lock would report the loser's migration as a clean `skipped`
    // while the database actually holds the winner's contents.
    //
    // Made deterministic the same way as completePacket's FOR UPDATE control: hold the
    // advisory lock from a reserved connection, let runner B block on it, insert
    // runner A's ledger row from the lock holder, then release.
    await withScratchSchema("wf_migtest_race", async (opts) => {
      const runnerA = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int);`,
      );
      const runnerB = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int, extra text);`,
      );
      assert(runnerA.checksum !== runnerB.checksum);

      // Create the schema and ledger up front so the lock holder can insert into it.
      await applyMigrations([], opts);

      const holder = await sql.reserve();
      let released = false;
      try {
        await holder.unsafe("BEGIN");
        await holder.unsafe(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);

        // Runner B: passes its pre-lock drift scan (ledger is empty), then blocks.
        const b = applyMigrations([runnerB], opts).then(
          () => null,
          (err: Error) => err,
        );

        // NON-VACUITY GUARD. A green result means nothing unless B genuinely waited:
        // if it raced past before the insert, the test would prove something else
        // entirely (or fail confusingly on a primary-key violation). Require the
        // waiter to be visible in pg_locks before proceeding.
        let blocked = false;
        for (let i = 0; i < 100 && !blocked; i++) {
          const [{ n }] = await sql<{ n: string }[]>`
            SELECT count(*) AS n FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted
              AND objid = ${MIGRATION_LOCK_KEY}
          `;
          if (Number(n) > 0) blocked = true;
          else await new Promise((r) => setTimeout(r, 20));
        }
        assert(blocked, "runner B never blocked on the advisory lock — test is vacuous");

        // Runner A wins: its contents are applied and recorded.
        await holder.unsafe(
          `INSERT INTO ${opts.ledgerTable} (version, filename, checksum) VALUES ($1,$2,$3)`,
          [runnerA.version, runnerA.filename, runnerA.checksum],
        );
        await holder.unsafe("COMMIT");
        released = true;

        const err = await b;
        assert(
          err instanceof MigrationDriftError,
          `runner B must be refused, got ${err === null ? "a clean skip" : err.name}`,
        );
        assertEquals((err as MigrationDriftError).appliedChecksum, runnerA.checksum);
        assertEquals((err as MigrationDriftError).currentChecksum, runnerB.checksum);

        // And it must NOT have been reported as a successful skip.
        const ledger = await ledgerRows(opts.ledgerTable);
        assertEquals(ledger.length, 1);
        assertEquals(ledger[0].checksum, runnerA.checksum, "runner A's contents stand");
      } finally {
        if (!released) await holder.unsafe("ROLLBACK").catch(() => {});
        holder.release();
      }
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: a concurrent runner with the SAME bytes skips cleanly",
  fn: async () => {
    // Green control for the test above: identical contents arriving through the same
    // race must be an ordinary skip, not drift. Without this, a recheck that raised
    // unconditionally would look identical to one that compares correctly.
    await withScratchSchema("wf_migtest_race_ok", async (opts) => {
      const m = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int);`,
      );
      await applyMigrations([], opts);
      await sql.unsafe(
        `INSERT INTO ${opts.ledgerTable} (version, filename, checksum) VALUES ($1,$2,$3)`,
        [m.version, m.filename, m.checksum],
      );
      const report = await applyMigrations([m], opts);
      assertEquals(report.applied, []);
      assertEquals(report.skipped.map((s) => s.version), [1]);
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: a failing migration REPORTS a typed error and does not exit",
  fn: async () => {
    // "A product module reports failure; it does not own process termination."
    // The shared runner (migrate.ts:56) calls Deno.exit(1) here. If this module did
    // the same, this test would kill the test process rather than fail.
    await withScratchSchema("wf_migtest_failure", async (opts) => {
      const good = await migration(
        1,
        "001_alpha.sql",
        `CREATE TABLE ${opts.schemaName}.alpha (id int);`,
      );
      const broken = await migration(
        2,
        "002_broken.sql",
        `CREATE TABLE ${opts.schemaName}.beta (id int) WITH (bogus_option = 1);`,
      );

      const err = await assertRejects(
        () => applyMigrations([good, broken], opts),
        MigrationApplyError,
      );
      assertEquals((err as MigrationApplyError).version, 2);
      assertEquals((err as MigrationApplyError).filename, "002_broken.sql");
      assert(err.cause instanceof Error, "the underlying database error is preserved");

      // Per-migration transactions: 001 stays applied and recorded, and 002 left
      // nothing half-written behind.
      const ledger = await ledgerRows(opts.ledgerTable);
      assertEquals(ledger.map((r) => r.version), [1], "the successful migration stands");
      assert(!(await tableExists(opts.schemaName, "beta")), "the failed migration rolled back");

      // The process is manifestly still alive to make these assertions.
      assert(true, "reached — the failure did not terminate the process");
    });
  },
});

Deno.test({
  ...T,
  name: "migrations: ordering sorts by version and refuses duplicates",
  fn: () => {
    assertEquals(
      orderMigrationVersions([
        { version: 10, filename: "010_j.sql" },
        { version: 2, filename: "002_b.sql" },
        { version: 1, filename: "001_a.sql" },
      ]).map((f) => f.version),
      [1, 2, 10],
      "numeric order, not lexicographic — 010 must sort after 002",
    );

    assertThrows(
      () =>
        orderMigrationVersions([
          { version: 2, filename: "002_first.sql" },
          { version: 2, filename: "002_second.sql" },
        ]),
      MigrationDiscoveryError,
      "duplicate migration version 2",
    );
  },
});

Deno.test({
  ...T,
  name: "migrations: unreadable, empty and unsafely-named targets are refused",
  fn: async () => {
    await assertRejects(
      () => discoverMigrations(new URL("file:///nonexistent-workflow-migrations-dir/")),
      MigrationDiscoveryError,
    );
    // A directory with no NNN_*.sql is an error, not an empty success — otherwise a
    // mistyped path would silently "apply zero migrations" and report ok.
    await assertRejects(
      () => discoverMigrations(new URL("../src/workflow/", import.meta.url)),
      MigrationDiscoveryError,
    );
    // An unsafe ledger identifier must not reach the database as SQL.
    await assertRejects(
      () => applyMigrations([], { ledgerTable: 'workflow.x"; DROP TABLE y; --' }),
      MigrationDiscoveryError,
    );
  },
});

Deno.test({
  ...T,
  name: "migrations: the REAL workflow directory discovers 001 and 002 in order",
  fn: async () => {
    // Discovery against the actual tree — the half the hermetic tests deliberately
    // do not cover. Enumeration is directory-driven, so a new NNN_*.sql file is
    // picked up without editing any code.
    const found = await discoverMigrations();
    assertEquals(found.map((m) => m.version), [1, 2], "versions in ascending order");
    assertEquals(found[0].filename, "001_workflow_schema.sql");
    assertEquals(found[1].filename, "002_decision_run_packet_integrity.sql");
    for (const m of found) {
      assert(m.checksum.length === 64, "SHA-256 hex");
      assert(m.statements.length > 0, `${m.filename} is empty`);
    }
  },
});

Deno.test({
  ...T,
  name: "migrations: the real workflow migrations apply and are idempotent",
  fn: async () => {
    // Non-destructive against the shared dev database: whatever is already applied is
    // skipped, and a second run must be a complete no-op.
    await runWorkflowMigrations();
    const report = await runWorkflowMigrations();
    assertEquals(report.applied, [], "a second run must apply nothing");
    assertEquals(report.skipped.map((s) => s.version), [1, 2]);

    const ledger = await ledgerRows("workflow.schema_migrations");
    assertEquals(ledger.map((r) => r.version), [1, 2]);
    assertEquals(ledger.map((r) => r.filename), [
      "001_workflow_schema.sql",
      "002_decision_run_packet_integrity.sql",
    ]);
  },
});
