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
 * **What this actually gates today — stated precisely, because an earlier version of
 * this comment claimed more than the code does, and a false comment here has
 * previously caused a bug report against the code.** Two things read this switch:
 * the `/ready` provider probe (`healthCheck.ts`'s `probeEmbeddingApi`, which reports
 * `n/a` instead of polling the provider when this is `false`), and
 * `findCapabilityConflicts` below, which refuses to start a deployment that sets
 * this `false` while a provider-dependent background worker (entity extraction,
 * consolidation, embedding backfill) is enabled.
 *
 * **What it does NOT gate: the request path.** `getEmbedding` is called directly,
 * with no flag check, from three MCP tool handlers — server/index.ts:179 (`search`),
 * :305 (`search_thoughts`), and :538 (`capture_thought`). Setting
 * `MODEL_PROVIDER_ENABLED=false` does not stop those calls; it stops only the two
 * things named above. An operator reading "this process makes no model-provider
 * request" into this flag is wrong for any deployment that also serves those three
 * tools. Closing that gap — actually gating the request path — is an outstanding
 * design decision the PO has not made, deliberately out of scope here.
 * `MEMORY_TOOLS_REACH_PROVIDER` below is the boot-time acknowledgement that the gap
 * exists (it keeps `OPENROUTER_API_KEY` required whenever the provider is enabled at
 * all), not a fix for it.
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

/**
 * The MCP tools reach the model provider on the REQUEST path, unconditionally — see
 * `getEmbedding` at server/index.ts:179 (`search`), :305 (`search_thoughts`), and
 * :538 (`capture_thought`). None of those three call sites is gated by a
 * `FEATURE_*` flag, so turning off the three background-worker flags alone does NOT
 * make the provider optional: those tools still need a credential to answer a
 * request. Without this, disabling the three worker flags let a deployment start
 * with no `OPENROUTER_API_KEY` while `search`/`search_thoughts`/`capture_thought`
 * still needed one — the previously unconditional fail-fast moved from boot time to
 * the first request. This constant makes that always-on reach explicit rather than
 * leaving it implicit in `enabledProviderCapabilities`'s three-worker list.
 */
const MEMORY_TOOLS_REACH_PROVIDER = true;

export function findMissingRequiredEnv(readEnv: EnvReader = defaultEnv): string[] {
  const missing: string[] = [];
  // Order is stable and OPENROUTER_API_KEY comes first — `ensureRequiredEnv` reports
  // `missing[0]`, and operational checks (ST-038) match that message.
  //
  // `MEMORY_TOOLS_REACH_PROVIDER` is unconditional, so this reduces to
  // `modelProviderEnabled(readEnv)` today — the `enabledProviderCapabilities(...)`
  // check is kept alongside it rather than deleted, so the boot-time worker
  // conflicts and the always-on request-path reach both stay independently visible
  // here instead of collapsing into one term whose reason a future edit could lose.
  const needsProvider = modelProviderEnabled(readEnv) &&
    (enabledProviderCapabilities(readEnv).length > 0 || MEMORY_TOOLS_REACH_PROVIDER);
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
