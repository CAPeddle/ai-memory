/**
 * ST-084 spike — the workflow module's OWN ordered migration mechanism.
 *
 * **Architectural rule this file exists to honour: a product module reports
 * failure; it does not own process termination.**
 *
 * The original spike put its DDL in `server/db/007_workflow_schema.sql`, where the
 * shared runner picked it up. That runner calls `Deno.exit(1)` on any failure
 * (`migrate.ts:56`) and is awaited before `Deno.serve` — so a malformed *workflow*
 * migration would have taken down the entire server, memory domain included. That
 * is precisely the coupling this spike claims not to have, in the opposite
 * direction from the one it was testing.
 *
 * The DDL now lives in `server/db/workflow/`, which the shared runner cannot
 * discover (its regex matches `^(\d+)_.*\.sql$` against entries directly in
 * `server/db/`, non-recursively). This module applies it and *reports* the outcome.
 * The composition root decides what a failure means: fail startup, run degraded, or
 * disable the workflow product.
 *
 * **Why this is a migration runner and not a single `IF NOT EXISTS` file.** It used
 * to be the latter, and that made the module structurally unable to evolve its own
 * schema — the delivery blocker this spike surfaced, which mattered more than any of
 * the schema's contents:
 *
 *   - editing a `CREATE TABLE` body in `001` was a silent NO-OP against any database
 *     that already had the table, so the file and the database diverged with nothing
 *     reporting it;
 *   - adding `002_*.sql` did nothing at all, because the filename was hardcoded here;
 *   - and no test caught either, so "the workflow module owns its schema" was true
 *     only for the single act of creating it once.
 *
 * What replaces it: ordered discovery of `server/db/workflow/NNN_*.sql`, a ledger at
 * `workflow.schema_migrations` recording version / filename / checksum / applied
 * timestamp, one transaction per migration, and typed failures.
 *
 * **The ledger lives INSIDE the workflow schema, deliberately.** Writing to the
 * memory domain's `public.schema_migrations` would reintroduce exactly the shared
 * mutable state this separation exists to avoid, and would break the teardown claim:
 * `DROP SCHEMA workflow CASCADE` must leave nothing behind, ledger included.
 *
 * **Checksums hash raw file BYTES.** A line-ending change therefore reads as drift.
 * That is intentional here (a `.sql` file whose bytes changed is a file that may no
 * longer apply identically) but it is a real trap in this repo specifically, where
 * `.gitattributes` normalises EOLs — see CLAUDE.md's line-endings section. If a
 * migration trips {@link MigrationDriftError} after nothing but a checkout, suspect
 * EOLs before suspecting a bad edit.
 *
 * **This file now carries a SECOND, unrelated responsibility: the zod half of the
 * ADR-017 WorkItem contract, at the bottom.** That is a collision of two senses of
 * the word "schema" and it is recorded rather than tidied away — ADR-017's
 * Consequences name `types.ts` and `schema.ts` as the two files the versioned
 * WorkItem contract lands in, and this is the `schema.ts` it means. Nothing in
 * that section touches the migration runner above it, or the database at all.
 *
 * PROVISIONAL — not a throwaway spike; an extraction donor. See types.ts.
 */

import { z } from "npm:zod@4.1.13";

import { sql } from "../db.ts";
import {
  MigrationApplyError,
  MigrationDiscoveryError,
  MigrationDriftError,
  SOURCE_SYSTEMS,
  WorkflowSchemaError,
} from "./types.ts";
import type { SourceSystem } from "./types.ts";

const WORKFLOW_MIGRATIONS_DIR = new URL("../../db/workflow/", import.meta.url);
const DEFAULT_LEDGER_TABLE = "workflow.schema_migrations";
const DEFAULT_SCHEMA_NAME = "workflow";

/**
 * Advisory lock key, so two runners (two test files, or a server and a test) cannot
 * both decide the same migration is pending and race to apply it. Arbitrary but
 * stable; derived from the story number.
 */
export const MIGRATION_LOCK_KEY = 840_084;

/** Migration filenames: `001_something.sql`. */
const MIGRATION_FILE = /^(\d+)_.*\.sql$/;

/** A bare SQL identifier. Used to validate the caller-supplied ledger/schema names. */
const BARE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export interface DiscoveredMigration {
  version: number;
  filename: string;
  statements: string;
  checksum: string;
}

export interface MigrationRunOptions {
  /** Directory to enumerate. Defaults to `server/db/workflow/`. */
  dir?: URL;
  /** Fully-qualified ledger table. Defaults to `workflow.schema_migrations`. */
  ledgerTable?: string;
  /** Schema to create if absent. Defaults to `workflow`. */
  schemaName?: string;
}

export interface MigrationReport {
  applied: { version: number; filename: string }[];
  skipped: { version: number; filename: string }[];
}

/** SHA-256 of the raw bytes, hex-encoded. No dependency — `crypto.subtle` is built in. */
async function checksumOf(bytes: Uint8Array): Promise<string> {
  // `.slice()` copies into a plain ArrayBuffer. Deno types `Uint8Array` as
  // `Uint8Array<ArrayBufferLike>`, which `crypto.subtle.digest` will not accept
  // because the buffer could in principle be a SharedArrayBuffer.
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Checksum of migration text, by the same rule the runner uses on file bytes.
 *
 * Exported so a test can derive a synthetic migration's checksum from its content
 * rather than inventing an opaque string. That distinction is what makes the drift
 * test mean something: it proves *changed contents produce a different checksum and
 * are then detected*, rather than merely proving that two unequal strings compare
 * unequal.
 */
export function checksumOfText(text: string): Promise<string> {
  return checksumOf(new TextEncoder().encode(text));
}

/**
 * Sort by version and refuse duplicates.
 *
 * Pure and separately exported so the duplicate rule is actually PROVABLE. Creating
 * two same-version files on disk needs write permission, which CI does not grant, so
 * a test routed only through {@link discoverMigrations} could assert this rule's
 * existence but never trigger it — a check nothing exercises is a check nobody knows
 * works.
 *
 * Why duplicates are fatal rather than tolerated: the ledger is keyed on version, so
 * two `002_*.sql` files mean whichever sorts first is recorded as "version 2 applied"
 * and the other is silently skipped forever, with the ledger showing a clean run.
 */
export function orderMigrationVersions<T extends { version: number; filename: string }>(
  files: T[],
): T[] {
  const ordered = [...files].sort((a, b) =>
    a.version - b.version || a.filename.localeCompare(b.filename)
  );
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].version === ordered[i - 1].version) {
      throw new MigrationDiscoveryError(
        `duplicate migration version ${ordered[i].version}: ` +
          `${ordered[i - 1].filename} and ${ordered[i].filename}`,
      );
    }
  }
  return ordered;
}

/**
 * Enumerate and order the migration files.
 *
 * Note what is rejected rather than tolerated: an unreadable directory, an empty
 * directory, and (via {@link orderMigrationVersions}) two files claiming the same
 * version.
 */
export async function discoverMigrations(
  dir: URL = WORKFLOW_MIGRATIONS_DIR,
): Promise<DiscoveredMigration[]> {
  const found: { version: number; filename: string }[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile) continue;
      const match = entry.name.match(MIGRATION_FILE);
      if (!match) continue;
      found.push({ version: parseInt(match[1], 10), filename: entry.name });
    }
  } catch (err) {
    throw new MigrationDiscoveryError(
      `could not read the workflow migration directory at ${dir.pathname}`,
      err as Error,
    );
  }

  if (found.length === 0) {
    throw new MigrationDiscoveryError(
      `no migrations matching NNN_*.sql in ${dir.pathname}`,
    );
  }

  const ordered = orderMigrationVersions(found);

  return await Promise.all(ordered.map(async (file) => {
    const bytes = await Deno.readFile(new URL(file.filename, dir));
    return {
      ...file,
      statements: new TextDecoder().decode(bytes),
      checksum: await checksumOf(bytes),
    };
  }));
}

function assertSafeIdentifiers(ledgerTable: string, schemaName: string): void {
  if (!BARE_IDENTIFIER.test(schemaName)) {
    throw new MigrationDiscoveryError(`unsafe schema name: ${JSON.stringify(schemaName)}`);
  }
  const parts = ledgerTable.split(".");
  if (parts.length !== 2 || !parts.every((p) => BARE_IDENTIFIER.test(p))) {
    throw new MigrationDiscoveryError(
      `ledger table must be a qualified bare identifier like "workflow.schema_migrations", ` +
        `got ${JSON.stringify(ledgerTable)}`,
    );
  }
}

/**
 * Apply an ALREADY-DISCOVERED, version-ordered migration set, and report what
 * happened.
 *
 * Split from {@link discoverMigrations} on purpose. Enumeration is filesystem work
 * and application is database work; separating them lets the ordering, idempotency
 * and drift rules be proven against synthetic migrations held in memory, with no
 * temp files, no write permission, and no dependence on what happens to be on disk.
 * That matters concretely here: CI runs `deno test` without `--allow-write`
 * (.github/workflows/ci.yml), so a test that needed to write fixture files would
 * pass locally and fail in CI. Discovery is proven separately against the real
 * directory.
 *
 * Ordering of the checks is the design, not incidental:
 *
 *   1. drift is detected BEFORE anything is applied, and aborts the whole run. A
 *      database whose applied migrations no longer match their files is in an unknown
 *      state; layering another migration on top of it makes the divergence worse and
 *      harder to unpick.
 *   2. each pending migration gets its OWN transaction, so a failure at `003` leaves
 *      `002` applied and recorded rather than silently rolling back work that
 *      succeeded.
 *   3. the ledger insert is inside that same transaction as the DDL. If they could
 *      separate, a crash between them would leave a migration applied but unrecorded
 *      — which the next run would try to apply again.
 *
 * Throws a {@link WorkflowSchemaError} subclass on failure. It never calls
 * `Deno.exit`, never touches `public.schema_migrations`, and never applies
 * memory-domain DDL.
 */
export async function applyMigrations(
  migrations: DiscoveredMigration[],
  options: Omit<MigrationRunOptions, "dir"> = {},
): Promise<MigrationReport> {
  const ledgerTable = options.ledgerTable ?? DEFAULT_LEDGER_TABLE;
  const schemaName = options.schemaName ?? DEFAULT_SCHEMA_NAME;
  assertSafeIdentifiers(ledgerTable, schemaName);

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${ledgerTable} (
      version     integer     PRIMARY KEY,
      filename    text        NOT NULL,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const ledgerRows = await sql.unsafe<
    { version: number; filename: string; checksum: string }[]
  >(`SELECT version, filename, checksum FROM ${ledgerTable} ORDER BY version`);
  const ledger = new Map(ledgerRows.map((r) => [r.version, r]));

  // 1. Drift, before anything is applied.
  for (const migration of migrations) {
    const recorded = ledger.get(migration.version);
    if (recorded === undefined) continue;
    if (recorded.checksum !== migration.checksum) {
      throw new MigrationDriftError(
        migration.version,
        migration.filename,
        recorded.checksum,
        migration.checksum,
      );
    }
  }

  const report: MigrationReport = { applied: [], skipped: [] };

  // 2. Apply pending, one transaction each.
  for (const migration of migrations) {
    if (ledger.has(migration.version)) {
      report.skipped.push({ version: migration.version, filename: migration.filename });
      continue;
    }

    try {
      const didApply = await sql.begin(async (tx) => {
        // Serialise concurrent runners. Released when this transaction ends.
        await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;

        // Re-check under the lock: another runner may have applied this version
        // between our ledger read and here. Without this the loser's DDL would run a
        // second time and its ledger INSERT would fail on the primary key.
        //
        // **Read the checksum too, not just the version.** The pre-lock drift scan
        // cannot cover this window by construction: at the time it ran the ledger row
        // did not exist yet. If two runners start from an empty ledger holding
        // DIFFERENT bytes for the same version — a mid-rollout deploy with two
        // instances on different commits — both pre-scans see nothing, the winner
        // applies its file, and a version-only recheck would report the loser's
        // migration as a clean `skipped`. The database would then hold the winner's
        // contents while the loser reported success for a file that never ran, which
        // is precisely the divergence the checksum exists to detect. This is the
        // deployment race the advisory lock is here to make safe, so the comparison
        // belongs inside the lock.
        const already = await tx.unsafe<{ filename: string; checksum: string }[]>(
          `SELECT filename, checksum FROM ${ledgerTable} WHERE version = $1`,
          [migration.version],
        );
        const recorded = already[0];
        if (recorded !== undefined) {
          if (recorded.checksum !== migration.checksum) {
            throw new MigrationDriftError(
              migration.version,
              migration.filename,
              recorded.checksum,
              migration.checksum,
              recorded.filename,
            );
          }
          return false;
        }

        await tx.unsafe(migration.statements);
        await tx.unsafe(
          `INSERT INTO ${ledgerTable} (version, filename, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, migration.checksum],
        );
        return true;
      });

      const entry = { version: migration.version, filename: migration.filename };
      if (didApply) report.applied.push(entry);
      else report.skipped.push(entry);
    } catch (err) {
      // Drift is not an apply failure and must keep its own type. Wrapping it would
      // collapse "this database was migrated with different contents" into "this
      // migration would not run", destroying the distinction the subclasses exist for.
      if (err instanceof MigrationDriftError) throw err;
      throw new MigrationApplyError(migration.version, migration.filename, err as Error);
    }
  }

  return report;
}

/**
 * Discover `server/db/workflow/NNN_*.sql` and apply whatever is pending.
 *
 * This is the composition of {@link discoverMigrations} and {@link applyMigrations},
 * and the only form production code uses.
 */
export async function runWorkflowMigrations(
  options: MigrationRunOptions = {},
): Promise<MigrationReport> {
  const { dir, ...applyOptions } = options;
  const migrations = await discoverMigrations(dir ?? WORKFLOW_MIGRATIONS_DIR);
  return await applyMigrations(migrations, applyOptions);
}

/**
 * Bring the workflow schema up to date. Idempotent.
 *
 * Retained as the module's public entry point — every existing caller uses this
 * name — but it is now an ordered migration run rather than a single-file apply.
 *
 * Throws {@link WorkflowSchemaError} (or a subclass) on any failure. It never calls
 * `Deno.exit`. A caller that wants startup to fail must decide that for itself.
 */
export async function ensureWorkflowSchema(): Promise<void> {
  await runWorkflowMigrations();
}

/**
 * Apply the schema and report the outcome without throwing — the shape a
 * composition root wants when workflow is an optional product whose absence
 * should degrade rather than abort.
 */
export async function tryEnsureWorkflowSchema(): Promise<
  { ok: true; report: MigrationReport } | { ok: false; error: WorkflowSchemaError }
> {
  try {
    return { ok: true, report: await runWorkflowMigrations() };
  } catch (err) {
    return { ok: false, error: err as WorkflowSchemaError };
  }
}


// ---------------------------------------------------------------------------
// ADR-017 — the WorkItem contract, zod half
// ---------------------------------------------------------------------------
//
// **No DDL here, and none anywhere yet.** ADR-017 authorises types and zod only;
// the table these schemas describe arrives in its own migration under its own
// decision against ADR-016 §1, which this file's runner above will then apply like
// any other. Contract-first is the whole shape of the unit: the vocabulary lands
// before the storage, so the storage cannot quietly settle the vocabulary.
//
// Where the TYPES live is types.ts, beside `WorkPacket` and the rest. This file
// takes the zod because ADR-017 names it; types.ts was the alternative and is
// deliberately the module's only import-free leaf, so putting zod there would make
// it a transitive dependency of every file that merely wants a type.

/**
 * The WorkItem contract's version.
 *
 * **The workflow module had no contract-versioning convention when this landed** —
 * the only "version" it knew was a migration's ordinal in the ledger above — so
 * this constant is new rather than an existing pattern being followed. It tracks
 * ADR-017's own Revision History (1.0 → 1), because that document is the only thing
 * that can actually change the contract; bumping it without a matching ADR revision
 * would be a version number with nothing behind it.
 */
export const WORK_ITEM_CONTRACT_VERSION = 1;

/**
 * The closed provenance set, by the same rule `api.ts` applies to policy scope: a
 * `z.enum` over the identical vocabulary the eventual CHECK constraint will hold,
 * so an unknown `source_system` is rejected at the edge rather than deeper in.
 */
export const sourceSystemSchema = z.enum(
  SOURCE_SYSTEMS as unknown as [SourceSystem, ...SourceSystem[]],
);

/**
 * The `AW-NNN` label's FORMAT — and nothing else (ADR-017 §4).
 *
 * **Validating a shape is not allocating one.** `AW-NNN` is minted by AWCP's own
 * persistence, where a database enforces uniqueness directly; never here, never by
 * a caller, and never from the `story-ids.md` registry that governs `ST-NNN`. Those
 * are two allocators by design. This contract mints no value at all, which is why
 * the label appears on the row schema and not on the creation input.
 */
export const awLabelSchema = z.string().regex(
  /^AW-\d+$/,
  "an AW label is the literal prefix AW- followed by digits, e.g. AW-1",
);

/**
 * The provenance pair's internal rule, applied wherever the pair is supplied.
 *
 * `awcp-native` names no foreign namespace, so it carries no `sourceRef`. Every
 * other member names one, and a reference to it is what makes the pair a reference
 * at all — a `jira` item with no ref is provenance pointing nowhere.
 *
 * **Both directions are enforced, which is a reading of §2 rather than a quotation
 * of it.** §2 states the native half declaratively and B2a's create route takes
 * *"a `(source_system, source_ref)` pair"*; the `UNIQUE (source_system,
 * source_ref)` wording's "where both are present" is about how Postgres treats
 * NULLs in a unique index, not permission to omit the ref. A contract that starts
 * loose is harder to tighten once rows exist than one that starts tight.
 */
function checkProvenancePair(
  value: { sourceSystem: SourceSystem; sourceRef?: string | null },
  ctx: z.RefinementCtx,
): void {
  const ref = value.sourceRef ?? null;
  if (value.sourceSystem === "awcp-native") {
    if (ref !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceRef"],
        message: "awcp-native work names no foreign namespace: sourceRef must be absent",
      });
    }
    return;
  }
  if (ref === null) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceRef"],
      message:
        `source system "${value.sourceSystem}" identifies work in its own namespace: ` +
        "sourceRef is required",
    });
  }
}

/**
 * What a caller may supply to create a WorkItem — the runtime half of
 * `CreateWorkItemInput`.
 *
 * **There is no `awLabel` field, deliberately.** A plain `z.object` strips unknown
 * keys, so an input that tries to carry a minted label parses to one that does not
 * — the "mint no identifiers" rule made structural rather than remembered. There is
 * likewise no `policyScope` (§3: the packet is the only scope authority), no
 * `status` (§6), and no `title` (§2: the source keeps that authority).
 */
export const createWorkItemSchema = z.object({
  sourceSystem: sourceSystemSchema,
  sourceRef: z.string().min(1).nullish(),
}).superRefine(checkProvenancePair);

/**
 * A stored WorkItem row, mirroring the columns ADR-017 §1-§4 enumerates and no
 * others. Snake-cased because a row schema describes the row.
 *
 * Kept as a plain object schema on purpose: the absences listed on `WorkItem` are
 * checkable through `.shape`, so "a WorkItem has no status" is provable rather than
 * merely asserted in a comment.
 */
export const workItemSchema = z.object({
  id: z.uuid(),
  source_system: sourceSystemSchema,
  source_ref: z.string().min(1).nullable(),
  aw_label: awLabelSchema.nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
