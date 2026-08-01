/**
 * ST-086 — the workflow module's composition-root seam.
 *
 * This file is the ONLY thing the composition root needs to know about in order to
 * turn Workflow Operations on: one predicate (`workflowFeatureEnabled`) and one
 * bootstrap call (`bootstrapWorkflow`).
 *
 * **It reports; it does not terminate.** That rule is inherited from schema.ts and is
 * the reason `bootstrapWorkflow` returns a discriminated result instead of throwing or
 * exiting. The composition root decides what a migration failure means. Because
 * ST-086's operator explicitly asked for workflow (`FEATURE_WORKFLOW=true`), the
 * composition root's chosen answer is "fail startup" — but that choice lives there,
 * where process lifetime is owned, not here.
 *
 * The distinction is not academic: an earlier version of this spike put workflow DDL
 * in the shared boot chain, whose runner calls `Deno.exit(1)`, so a malformed workflow
 * migration would have taken the memory domain down with it. Keeping the decision at
 * the composition root means a future deployment can choose to degrade instead, with
 * no edit to this module.
 */

import { type MigrationReport, tryEnsureWorkflowSchema } from "./schema.ts";
import type { WorkflowSchemaError } from "./types.ts";

/** Reads an environment variable. Injectable so the flag rules are testable. */
export type EnvReader = (name: string) => string | undefined;

const defaultEnv: EnvReader = (name) => Deno.env.get(name);

/**
 * Workflow Operations is OPT-IN — `FEATURE_WORKFLOW=true`, exactly.
 *
 * Opposite polarity to the memory domain's `FEATURE_*` flags, which default to on and
 * are disabled with `=false`. That asymmetry is deliberate: those capabilities are the
 * product this server has always been, whereas Workflow Operations is a separate
 * operational domain that no existing deployment asked for. Defaulting it on would
 * mean every current deployment silently starts applying migrations for a schema its
 * operator never requested.
 */
export function workflowFeatureEnabled(env: EnvReader = defaultEnv): boolean {
  return env("FEATURE_WORKFLOW") === "true";
}

export type WorkflowBootstrapResult =
  | { enabled: false }
  | { enabled: true; ok: true; report: MigrationReport }
  | { enabled: true; ok: false; error: WorkflowSchemaError };

/**
 * Bring Workflow Operations up, if it was asked for.
 *
 * Returns `{ enabled: false }` untouched when the flag is off — no schema is created,
 * no connection is used, and a deployment that does not want this product pays nothing
 * for its presence in the tree.
 *
 * Never throws. `tryEnsureWorkflowSchema` already converts every typed migration
 * failure into a value, and this preserves that shape rather than re-raising.
 */
export async function bootstrapWorkflow(
  env: EnvReader = defaultEnv,
): Promise<WorkflowBootstrapResult> {
  if (!workflowFeatureEnabled(env)) return { enabled: false };

  const outcome = await tryEnsureWorkflowSchema();
  if (outcome.ok) return { enabled: true, ok: true, report: outcome.report };
  return { enabled: true, ok: false, error: outcome.error };
}

/**
 * Render a bootstrap result as the `/ready` check body.
 *
 * Returns `null` when workflow is disabled, and the composition root then omits the
 * key entirely rather than reporting `n/a`. That is a deliberate difference from the
 * memory domain's probes, which do report `n/a` for disabled capabilities: those are
 * capabilities of a product that is always deployed, whereas an absent `workflow` key
 * means the product is not deployed here at all. It also keeps `/ready`'s existing
 * seven-key contract exactly as it was for every deployment that never opted in.
 */
export function workflowReadiness(
  result: WorkflowBootstrapResult,
): { status: "ok" | "error"; [key: string]: unknown } | null {
  if (!result.enabled) return null;
  if (result.ok) {
    return {
      status: "ok",
      applied: result.report.applied.map((m) => m.filename),
      skipped: result.report.skipped.map((m) => m.filename),
    };
  }
  return { status: "error", error: `${result.error.name}: ${result.error.message}` };
}
