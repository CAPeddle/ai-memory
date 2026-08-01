/**
 * Startup configuration validation.
 *
 * `MEMORY_API_KEY` is unconditionally required — the server authenticates every
 * request and `requireApiKey` throws rather than accepting `Bearer undefined`, so a
 * deployment without it cannot serve anything.
 *
 * `OPENROUTER_API_KEY` is required only when a capability that actually calls the
 * model provider is enabled. Demanding it unconditionally made a provider-free
 * deployment impossible: Workflow Operations (ST-086) issues no model request at all,
 * yet could not start without a credential for a provider it never contacts. The
 * distinction is capability-driven rather than product-driven, so it stays correct as
 * capabilities are added.
 */

/** Every capability whose code path reaches the model provider. */
const PROVIDER_DEPENDENT_CAPABILITIES = [
  { flag: "FEATURE_ENTITY_WORKER", label: "entity extraction worker" },
  { flag: "FEATURE_CONSOLIDATION_WORKER", label: "consolidation worker" },
  { flag: "FEATURE_EMBEDDING_BACKFILL", label: "embedding backfill worker" },
] as const;

export type EnvReader = (name: string) => string | undefined;

const defaultEnv: EnvReader = (name) => Deno.env.get(name);

/**
 * These default to ENABLED — absent means on, `"false"` means off. That polarity is
 * inherited from the existing flags and must not be quietly inverted: a deployment
 * that never set them expects the memory domain's workers running.
 */
function capabilityEnabled(flag: string, readEnv: EnvReader): boolean {
  return readEnv(flag) !== "false";
}

/**
 * Whether this deployment may contact the model provider at all.
 *
 * A master switch above the per-capability flags. `MODEL_PROVIDER_ENABLED=false` is a
 * statement about egress, not about features, which is why it is checked separately:
 * the operator asserting "this process makes no model-provider request" needs one
 * place to say so, and one place for a check to read.
 */
export function modelProviderEnabled(readEnv: EnvReader = defaultEnv): boolean {
  return readEnv("MODEL_PROVIDER_ENABLED") !== "false";
}

/** Provider-dependent capabilities that are currently switched on. */
export function enabledProviderCapabilities(readEnv: EnvReader = defaultEnv): string[] {
  return PROVIDER_DEPENDENT_CAPABILITIES
    .filter((c) => capabilityEnabled(c.flag, readEnv))
    .map((c) => c.label);
}

/**
 * A configuration that cannot be satisfied: provider access is off, but a capability
 * that needs it is on.
 *
 * Reported rather than silently resolved, in either direction. Turning the capability
 * off for the operator would disable work they asked for; letting it run would issue
 * the very requests `MODEL_PROVIDER_ENABLED=false` promises are not made. Refusing to
 * start is the only answer that keeps the promise, and it fails closed at deploy time
 * instead of at the first request.
 */
export function findCapabilityConflicts(readEnv: EnvReader = defaultEnv): string[] {
  if (modelProviderEnabled(readEnv)) return [];
  return enabledProviderCapabilities(readEnv);
}

interface EnsureRequiredEnvOptions {
  readEnv?: EnvReader;
  logFatal?: (message: string) => void;
  exit?: (code: number) => unknown;
}

export function findMissingRequiredEnv(readEnv: EnvReader = defaultEnv): string[] {
  const missing: string[] = [];
  // Order is stable and OPENROUTER_API_KEY comes first — `ensureRequiredEnv` reports
  // `missing[0]`, and operational checks (ST-038) match that message.
  const needsProvider = modelProviderEnabled(readEnv) &&
    enabledProviderCapabilities(readEnv).length > 0;
  if (needsProvider && !readEnv("OPENROUTER_API_KEY")) missing.push("OPENROUTER_API_KEY");
  if (!readEnv("MEMORY_API_KEY")) missing.push("MEMORY_API_KEY");
  return missing;
}

export function ensureRequiredEnv(options: EnsureRequiredEnvOptions = {}): void {
  const readEnv = options.readEnv ?? defaultEnv;
  const logFatal = options.logFatal ?? console.error;
  const exit = options.exit ?? Deno.exit;

  const conflicts = findCapabilityConflicts(readEnv);
  if (conflicts.length) {
    logFatal(
      `FATAL: MODEL_PROVIDER_ENABLED=false but these capabilities require the model ` +
        `provider: ${conflicts.join(", ")}. Disable them or re-enable the provider. Exiting.`,
    );
    exit(1);
    return;
  }

  const missing = findMissingRequiredEnv(readEnv);
  if (!missing.length) return;

  // Keep message format stable for operational checks in ST-038.
  logFatal(`FATAL: Required environment variable ${missing[0]} is not set. Exiting.`);
  exit(1);
}
