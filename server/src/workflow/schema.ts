/**
 * ST-084 spike — workflow schema application.
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
 * SPIKE / DISPOSABLE.
 */

import { sql } from "../db.ts";
import { WorkflowSchemaError } from "./types.ts";

const WORKFLOW_DDL = new URL("../../db/workflow/001_workflow_schema.sql", import.meta.url);

/**
 * Apply the workflow schema. Idempotent — every statement is `IF NOT EXISTS`.
 *
 * Throws {@link WorkflowSchemaError} on any failure. It never calls `Deno.exit`,
 * never touches `schema_migrations`, and never applies memory-domain DDL. A caller
 * that wants startup to fail must decide that for itself.
 */
export async function ensureWorkflowSchema(): Promise<void> {
  let ddl: string;
  try {
    ddl = await Deno.readTextFile(WORKFLOW_DDL);
  } catch (err) {
    throw new WorkflowSchemaError(
      `could not read workflow DDL at ${WORKFLOW_DDL.pathname}`,
      err as Error,
    );
  }

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
    });
  } catch (err) {
    throw new WorkflowSchemaError("workflow schema application failed", err as Error);
  }
}

/**
 * Apply the schema and report the outcome without throwing — the shape a
 * composition root wants when workflow is an optional product whose absence
 * should degrade rather than abort.
 */
export async function tryEnsureWorkflowSchema(): Promise<
  { ok: true } | { ok: false; error: WorkflowSchemaError }
> {
  try {
    await ensureWorkflowSchema();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err as WorkflowSchemaError };
  }
}
