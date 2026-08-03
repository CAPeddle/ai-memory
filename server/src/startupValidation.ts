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

/**
 * Whether `AWCP_AGENT_API_KEY` is set AND equal to `MEMORY_API_KEY`.
 *
 * The agent/operator credential split (see `server/src/workflow/policy.ts`) exists
 * so that an agent key can authenticate to `/api/workflow` yet be refused on the
 * operator-only routes (resolve a decision, attach evidence, author a criterion,
 * complete a packet). If the two keys are equal, the composition root's middleware
 * classifies every presented credential as "operator" — the "agent" branch becomes
 * unreachable, and the split silently collapses into no split at all: whoever holds
 * the one shared value can complete a packet again, exactly the defect this split
 * closes. That is worse than never having offered the agent key, because it LOOKS
 * enforced (the docs, the code, the tests all describe a boundary) while granting
 * full operator access. An absent `AWCP_AGENT_API_KEY` is not a conflict — that is
 * the documented "operator key only" deployment shape and must keep starting.
 */
export function agentKeyCollidesWithOperatorKey(readEnv: EnvReader = defaultEnv): boolean {
  const agentKey = readEnv("AWCP_AGENT_API_KEY");
  if (!agentKey) return false;
  return agentKey === readEnv("MEMORY_API_KEY");
}

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
  if (missing.length) {
    // Keep message format stable for operational checks in ST-038.
    logFatal(`FATAL: Required environment variable ${missing[0]} is not set. Exiting.`);
    exit(1);
    return;
  }

  // Fail closed on misconfiguration: see agentKeyCollidesWithOperatorKey's docblock
  // for why an equal pair is not a usable "belt and braces" configuration but a
  // silent security regression that must never boot.
  if (agentKeyCollidesWithOperatorKey(readEnv)) {
    logFatal(
      `FATAL: AWCP_AGENT_API_KEY is set to the same value as MEMORY_API_KEY. This ` +
        `collapses the operator/agent credential split into no split at all — anyone ` +
        `holding that value would get full operator access on every /api/workflow ` +
        `route, including resolve/evidence/complete. Set AWCP_AGENT_API_KEY to a ` +
        `distinct value, or unset it to run with the operator key only. Exiting.`,
    );
    exit(1);
    return;
  }
}
