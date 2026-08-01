import { sql as defaultSql } from "./db.ts";

const DEFAULT_PG_LATENCY_MS = 500;
const DEFAULT_EMBEDDING_BACKLOG = 100;
const DEFAULT_WORKER_STALE_S = 90;
const DEFAULT_EMBEDDING_CACHE_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;

interface CheckResult {
  status: "ok" | "error" | "n/a";
  [key: string]: unknown;
}

export interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, CheckResult>;
}

export interface HealthDeps {
  sql?: typeof defaultSql;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  env?: (name: string) => string | undefined;
}

const embeddingCache = new Map<string, { status: "ok" | "error"; ts: number }>();
const inflightProbes = new Map<string, Promise<CheckResult>>();

export function __resetHealthCheckCache(): void {
  embeddingCache.clear();
  inflightProbes.clear();
}

function sanitizeError(err: unknown, context: string): string {
  if (err instanceof Error) {
    return `${context}: ${err.name}`;
  }
  return context;
}

/**
 * Bound a postgres.js query with a real timeout. `PendingQuery` has no `.timeout()`
 * method (it exposes only `execute()`/`cancel()`), so we race the query against a
 * timer that cancels the in-flight query and rejects if it overruns.
 */
function withQueryTimeout<T>(pending: Promise<T> & { cancel: () => void }, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      pending.cancel();
      reject(new Error("query timed out"));
    }, ms);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

function resolveEnv(name: string, env?: (name: string) => string | undefined): string | undefined {
  return env ? env(name) : Deno.env.get(name);
}

function resolveThreshold(name: string, defaultVal: number, env?: (name: string) => string | undefined): number {
  const raw = resolveEnv(name, env);
  if (raw === undefined || raw === null) return defaultVal;
  const trimmed = raw.trim();
  if (trimmed === "") return defaultVal;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultVal;
}

async function probePostgres(sql: typeof defaultSql): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withQueryTimeout(sql`SELECT 1`, PROBE_TIMEOUT_MS);
    return { status: "ok", latency_ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { status: "error", error: sanitizeError(err, "postgres probe failed") };
  }
}

async function probeExtension(sql: typeof defaultSql, extname: string): Promise<CheckResult> {
  try {
    const rows = await withQueryTimeout(sql`SELECT extversion FROM pg_extension WHERE extname = ${extname}`, PROBE_TIMEOUT_MS);
    if (rows.length === 0) return { status: "error", error: `extension ${extname} not found` };
    return { status: "ok", version: rows[0].extversion };
  } catch (err) {
    return { status: "error", error: sanitizeError(err, `${extname} probe failed`) };
  }
}

function getEmbeddingCacheKey(env?: (name: string) => string | undefined): string {
  const baseUrl = resolveEnv("OPENROUTER_BASE_URL", env) ?? "https://openrouter.ai/api/v1";
  const apiKey = resolveEnv("OPENROUTER_API_KEY", env) ?? "";
  return `${baseUrl}|${apiKey}`;
}

async function probeEmbeddingApi(fetch: typeof globalThis.fetch, now: () => number, env?: (name: string) => string | undefined): Promise<CheckResult> {
  // Capability gate, and the ONLY reason a "this process makes no model-provider
  // request" claim can be true.
  //
  // This probe used to run unconditionally, so merely polling /ready issued an
  // outbound GET to the provider — while every other probe here already honoured its
  // capability flag. A deployment running with the provider switched off (ST-086's
  // workflow-only mode) would therefore have contacted it anyway, on a schedule, and
  // any test asserting zero provider requests would have been measuring a claim the
  // health check itself falsified.
  if (resolveEnv("MODEL_PROVIDER_ENABLED", env) === "false") {
    return { status: "n/a", reason: "model provider disabled" };
  }

  const baseUrl = resolveEnv("OPENROUTER_BASE_URL", env) ?? "https://openrouter.ai/api/v1";
  const cacheTtlMs = resolveThreshold("HEALTH_EMBEDDING_CACHE_TTL_MS", DEFAULT_EMBEDDING_CACHE_TTL_MS, env);
  const cacheKey = getEmbeddingCacheKey(env);

  const cached = embeddingCache.get(cacheKey);
  if (cached && now() - cached.ts < cacheTtlMs) {
    return { status: cached.status, cached: true };
  }

  if (inflightProbes.has(cacheKey)) return inflightProbes.get(cacheKey)!;

  const probe: Promise<CheckResult> = (async () => {
    try {
      const apiKey = resolveEnv("OPENROUTER_API_KEY", env) ?? "";
      const r = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      const status = r.ok ? "ok" : "error";
      embeddingCache.set(cacheKey, { status, ts: now() });
      return { status, status_code: r.status, cached: false };
    } catch (err) {
      embeddingCache.set(cacheKey, { status: "error", ts: now() });
      return { status: "error", error: sanitizeError(err, "embedding API probe failed"), cached: false };
    } finally {
      inflightProbes.delete(cacheKey);
    }
  })();

  inflightProbes.set(cacheKey, probe);
  return probe;
}

async function probeEmbeddingBacklog(sql: typeof defaultSql, env?: (name: string) => string | undefined): Promise<CheckResult> {
  if (resolveEnv("FEATURE_EMBEDDING_BACKFILL", env) === "false" || resolveEnv("EMBEDDING_BACKFILL_DISABLED", env) === "true") {
    return { status: "n/a", reason: "embedding backfill disabled" };
  }
  try {
    const rows = await withQueryTimeout(sql`SELECT COUNT(*)::int AS pending FROM thoughts WHERE needs_embedding = true`, PROBE_TIMEOUT_MS);
    const pending = rows[0].pending;
    const threshold = resolveThreshold("HEALTH_EMBEDDING_BACKLOG", DEFAULT_EMBEDDING_BACKLOG, env);
    return { status: pending > threshold ? "error" : "ok", pending, threshold };
  } catch (err) {
    return { status: "error", error: sanitizeError(err, "embedding backlog probe failed") };
  }
}

async function probeWorker(sql: typeof defaultSql, workerName: string, featureFlag: string, now: () => number, env?: (name: string) => string | undefined): Promise<CheckResult> {
  if (resolveEnv(featureFlag, env) === "false") {
    return { status: "n/a", reason: `${workerName} worker disabled` };
  }
  try {
    const rows = await withQueryTimeout(sql`SELECT ended_at, errors FROM worker_runs WHERE worker = ${workerName} AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`, PROBE_TIMEOUT_MS);
    if (rows.length === 0) return { status: "ok", reason: "no completed runs yet (fresh boot)" };
    const endedAt = new Date(rows[0].ended_at).getTime();
    const ageSec = Math.round((now() - endedAt) / 1000);
    const threshold = resolveThreshold("HEALTH_WORKER_STALE_S", DEFAULT_WORKER_STALE_S, env);
    return { status: ageSec > threshold ? "error" : "ok", last_run_at: rows[0].ended_at, age_seconds: ageSec, errors: rows[0].errors, threshold };
  } catch (err) {
    return { status: "error", error: sanitizeError(err, `${workerName} worker probe failed`) };
  }
}

const AGGREGATE_TIMEOUT_MS = 15_000;

function timeoutResult(): HealthResult {
  return { status: "unhealthy", checks: { overall: { status: "error", error: "health check timed out" } } };
}

export async function deepHealthCheck(deps?: HealthDeps): Promise<HealthResult> {
  const sql = deps?.sql ?? defaultSql;
  const fetch = deps?.fetch ?? globalThis.fetch;
  const now = deps?.now ?? (() => Date.now());
  const env = deps?.env;

  const checks: Record<string, CheckResult> = {};

  const probeResults = await Promise.allSettled([
    probePostgres(sql),
    probeExtension(sql, "vector"),
    probeExtension(sql, "age"),
    probeEmbeddingApi(fetch, now, env),
    probeEmbeddingBacklog(sql, env),
    probeWorker(sql, "entity", "FEATURE_ENTITY_WORKER", now, env),
    probeWorker(sql, "consolidation", "FEATURE_CONSOLIDATION_WORKER", now, env),
  ]);

  const probeKeys = ["postgres", "pgvector", "age", "embedding_api", "embedding_backlog", "entity_worker", "consolidation_worker"];

  for (let i = 0; i < probeResults.length; i++) {
    const result = probeResults[i];
    if (result.status === "fulfilled") {
      checks[probeKeys[i]] = result.value;
    } else {
      checks[probeKeys[i]] = { status: "error", error: sanitizeError(result.reason, `${probeKeys[i]} probe crashed`) };
    }
  }

  let overallStatus: HealthResult["status"] = "healthy";

  if (checks.postgres.status === "error") {
    overallStatus = "unhealthy";
  } else {
    const latencyThreshold = resolveThreshold("HEALTH_POSTGRES_LATENCY_MS", DEFAULT_PG_LATENCY_MS, env);
    if (typeof checks.postgres.latency_ms === "number" && checks.postgres.latency_ms > latencyThreshold) {
      overallStatus = "degraded";
    }
    for (const [key, check] of Object.entries(checks)) {
      if (key === "postgres") continue;
      if (check.status === "error") {
        overallStatus = "degraded";
        break;
      }
    }
  }

  return { status: overallStatus, checks };
}

export async function deepHealthCheckWithTimeout(deps?: HealthDeps, timeoutMs: number = AGGREGATE_TIMEOUT_MS): Promise<HealthResult> {
  const result = await Promise.race([
    deepHealthCheck(deps),
    new Promise<HealthResult>((resolve) => setTimeout(() => resolve(timeoutResult()), timeoutMs)),
  ]);
  return result;
}
