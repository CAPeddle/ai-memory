import { sql as defaultSql } from "./db.ts";

const OPENROUTER_BASE = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";

const DEFAULT_PG_LATENCY_MS = 500;
const DEFAULT_EMBEDDING_BACKLOG = 100;
const DEFAULT_WORKER_STALE_S = 90;

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

let cachedResult: { status: "ok" | "error"; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;
let inflightPromise: Promise<CheckResult> | null = null;

export function __resetHealthCheckCache(): void {
  cachedResult = null;
  inflightPromise = null;
}

function resolveEnv(name: string, env?: (name: string) => string | undefined): string | undefined {
  return env ? env(name) : Deno.env.get(name);
}

function resolveThreshold(name: string, defaultVal: number, env?: (name: string) => string | undefined): number {
  const raw = resolveEnv(name, env);
  if (!raw) return defaultVal;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultVal;
}

async function probePostgres(sql: typeof defaultSql): Promise<CheckResult> {
  const start = performance.now();
  try {
    await sql`SELECT 1`;
    return { status: "ok", latency_ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

async function probeExtension(sql: typeof defaultSql, extname: string): Promise<CheckResult> {
  try {
    const rows = await sql`SELECT extversion FROM pg_extension WHERE extname = ${extname}`;
    if (rows.length === 0) return { status: "error", error: `extension ${extname} not found` };
    return { status: "ok", version: rows[0].extversion };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

async function probeEmbeddingApi(fetch: typeof globalThis.fetch, now: () => number): Promise<CheckResult> {
  if (cachedResult && now() - cachedResult.ts < CACHE_TTL_MS) {
    return { status: cachedResult.status, cached: true };
  }

  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const apiKey = resolveEnv("OPENROUTER_API_KEY") ?? "";
      const r = await fetch(`${OPENROUTER_BASE}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      const status = r.ok ? "ok" : "error";
      cachedResult = { status, ts: now() };
      return { status, status_code: r.status, cached: false };
    } catch (err) {
      cachedResult = { status: "error", ts: now() };
      return { status: "error", error: String(err), cached: false };
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

async function probeEmbeddingBacklog(sql: typeof defaultSql, env?: (name: string) => string | undefined): Promise<CheckResult> {
  if (resolveEnv("FEATURE_EMBEDDING_BACKFILL", env) === "false" || resolveEnv("EMBEDDING_BACKFILL_DISABLED", env) === "true") {
    return { status: "n/a", reason: "embedding backfill disabled" };
  }
  try {
    const rows = await sql`SELECT COUNT(*)::int AS pending FROM thoughts WHERE needs_embedding = true`;
    const pending = rows[0].pending;
    const threshold = resolveThreshold("HEALTH_EMBEDDING_BACKLOG", DEFAULT_EMBEDDING_BACKLOG, env);
    return { status: pending > threshold ? "error" : "ok", pending, threshold };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

async function probeWorker(sql: typeof defaultSql, workerName: string, featureFlag: string, now: () => number, env?: (name: string) => string | undefined): Promise<CheckResult> {
  if (resolveEnv(featureFlag, env) === "false") {
    return { status: "n/a", reason: `${workerName} worker disabled` };
  }
  try {
    const rows = await sql`SELECT ended_at, errors FROM worker_runs WHERE worker = ${workerName} AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`;
    if (rows.length === 0) return { status: "ok", reason: "no completed runs yet (fresh boot)" };
    const endedAt = new Date(rows[0].ended_at).getTime();
    const ageSec = Math.round((now() - endedAt) / 1000);
    const threshold = resolveThreshold("HEALTH_WORKER_STALE_S", DEFAULT_WORKER_STALE_S, env);
    return { status: ageSec > threshold ? "error" : "ok", last_run_at: rows[0].ended_at, age_seconds: ageSec, errors: rows[0].errors, threshold };
  } catch (err) {
    return { status: "error", error: String(err) };
  }
}

export async function deepHealthCheck(deps?: HealthDeps): Promise<HealthResult> {
  const sql = deps?.sql ?? defaultSql;
  const fetch = deps?.fetch ?? globalThis.fetch;
  const now = deps?.now ?? (() => Date.now());
  const env = deps?.env;

  const checks: Record<string, CheckResult> = {};

  checks.postgres = await probePostgres(sql);
  checks.pgvector = await probeExtension(sql, "vector");
  checks.age = await probeExtension(sql, "age");
  checks.embedding_api = await probeEmbeddingApi(fetch, now);
  checks.embedding_backlog = await probeEmbeddingBacklog(sql, env);
  checks.entity_worker = await probeWorker(sql, "entity", "FEATURE_ENTITY_WORKER", now, env);
  checks.consolidation_worker = await probeWorker(sql, "consolidation", "FEATURE_CONSOLIDATION_WORKER", now, env);

  let status: HealthResult["status"] = "healthy";

  if (checks.postgres.status === "error") {
    status = "unhealthy";
  } else {
    const latencyThreshold = resolveThreshold("HEALTH_POSTGRES_LATENCY_MS", DEFAULT_PG_LATENCY_MS, env);
    if (typeof checks.postgres.latency_ms === "number" && checks.postgres.latency_ms > latencyThreshold) {
      status = "degraded";
    }
    for (const [key, check] of Object.entries(checks)) {
      if (key === "postgres") continue;
      if (check.status === "error") {
        status = "degraded";
        break;
      }
    }
  }

  return { status, checks };
}
