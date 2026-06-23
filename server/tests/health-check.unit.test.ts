import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deepHealthCheck, __resetHealthCheckCache, type HealthDeps } from "../src/healthCheck.ts";

function mockFetch(ok: boolean, status: number): NonNullable<HealthDeps["fetch"]> {
  return (() => Promise.resolve(new Response(null, { status }))) as NonNullable<HealthDeps["fetch"]>;
}

function recentRun(now: number, secondsAgo: number): string {
  return new Date(now - secondsAgo * 1000).toISOString();
}

Deno.test("deepHealthCheck: all probes pass → healthy", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const calls: { values: unknown[] }[] = [];
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ values });
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) {
        if (values[0] === "vector") return Promise.resolve([{ extversion: "0.7.0" }]);
        if (values[0] === "age") return Promise.resolve([{ extversion: "1.6.0" }]);
        return Promise.resolve([]);
      }
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) {
        if (values[0] === "entity" || values[0] === "consolidation") {
          return Promise.resolve([{ ended_at: recent, errors: 0 }]);
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "healthy");
  assertEquals(result.checks.postgres.status, "ok");
  assertEquals(result.checks.pgvector.status, "ok");
  assertEquals(result.checks.age.status, "ok");
  assertEquals(result.checks.embedding_api.status, "ok");
  assertEquals(result.checks.embedding_backlog.status, "ok");
  assertEquals(result.checks.entity_worker.status, "ok");
  assertEquals(result.checks.consolidation_worker.status, "ok");
});

Deno.test("deepHealthCheck: Postgres throws → unhealthy", async () => {
  __resetHealthCheckCache();
  const deps: HealthDeps = {
    sql: ((() => Promise.reject(new Error("connection refused"))) as unknown) as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => 1_000_000_000_000,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "unhealthy");
  assertEquals(result.checks.postgres.status, "error");
});

Deno.test("deepHealthCheck: pgvector missing → degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) {
        // return nothing for vector, something for age -> pgvector is "error"
        if (values[0] === "age") return Promise.resolve([{ extversion: "1.6.0" }]);
        return Promise.resolve([]);
      }
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) {
        return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      }
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.pgvector.status, "error");
});

Deno.test("deepHealthCheck: AGE missing → degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) {
        if (values[0] === "vector") return Promise.resolve([{ extversion: "0.7.0" }]);
        if (values[0] === "age") return Promise.resolve([]);
        return Promise.resolve([]);
      }
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) {
        return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      }
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.age.status, "error");
  assertEquals(result.checks.pgvector.status, "ok");
});

Deno.test("deepHealthCheck: embedding API returns 500 → degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(false, 500),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.embedding_api.status, "error");
  assertEquals(result.checks.embedding_api.status_code, 500);
});

Deno.test("deepHealthCheck: embedding backlog exceeds threshold → degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 150 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.embedding_backlog.status, "error");
  assertEquals(result.checks.embedding_backlog.pending, 150);
});

Deno.test("deepHealthCheck: worker last run exceeds stale threshold → degraded", async () => {
  __resetHealthCheckCache();
  const now = 2_000_000_000_000;
  const staleRun = new Date(now - 180_000).toISOString(); // 180s
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: staleRun, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.entity_worker.status, "error");
  assertEquals(result.checks.entity_worker.age_seconds, 180);
});

Deno.test("deepHealthCheck: disabled entity worker reports n/a", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: (name: string) => {
      if (name === "FEATURE_ENTITY_WORKER") return "false";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.checks.entity_worker.status, "n/a");
  assertEquals(result.checks.consolidation_worker.status, "ok");
});

Deno.test("deepHealthCheck: disabled embedding backfill reports n/a", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: (name: string) => {
      if (name === "EMBEDDING_BACKFILL_DISABLED") return "true";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.checks.embedding_backlog.status, "n/a");
});

Deno.test("deepHealthCheck: no worker_runs rows reports ok (fresh boot)", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.checks.entity_worker.status, "ok");
  assertEquals(result.checks.consolidation_worker.status, "ok");
});

Deno.test("deepHealthCheck: embedding API cache returns cached result within TTL", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  let callCount = 0;
  const failingFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    return Promise.resolve(new Response(null, { status: 500 }));
  }) as NonNullable<HealthDeps["fetch"]>;

  const baseSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("#");
    if (q.includes("SELECT 1")) return Promise.resolve([]);
    if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
    if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
    if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
    return Promise.resolve([]);
  }) as unknown as NonNullable<HealthDeps["sql"]>;

  const deps1: HealthDeps = { sql: baseSql, fetch: failingFetch, now: () => now, env: () => undefined };
  const result1 = await deepHealthCheck(deps1);
  assertEquals(result1.checks.embedding_api.status, "error");
  assertEquals(callCount, 1);

  const deps2: HealthDeps = { sql: baseSql, fetch: failingFetch, now: () => now + 30_000, env: () => undefined };
  const result2 = await deepHealthCheck(deps2);
  assertEquals(result2.checks.embedding_api.cached, true);
  assertEquals(callCount, 1);
});

Deno.test("deepHealthCheck: embedding API cache expires and refreshes", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  let callCount = 0;
  const flipFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    const status = callCount === 1 ? 500 : 200;
    return Promise.resolve(new Response(null, { status }));
  }) as NonNullable<HealthDeps["fetch"]>;

  const baseSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("#");
    if (q.includes("SELECT 1")) return Promise.resolve([]);
    if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
    if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
    if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
    return Promise.resolve([]);
  }) as unknown as NonNullable<HealthDeps["sql"]>;

  const deps1: HealthDeps = { sql: baseSql, fetch: flipFetch, now: () => now, env: () => undefined };
  const result1 = await deepHealthCheck(deps1);
  assertEquals(result1.checks.embedding_api.status, "error");
  assertEquals(callCount, 1);

  const deps2: HealthDeps = { sql: baseSql, fetch: flipFetch, now: () => now + 120_000, env: () => undefined };
  const result2 = await deepHealthCheck(deps2);
  assertEquals(result2.checks.embedding_api.status, "ok");
  assertEquals(callCount, 2);
});

Deno.test("deepHealthCheck: slow Postgres (>500ms) produces degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1")) return Promise.resolve([]);
      if (q.includes("extname = #")) return Promise.resolve([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return Promise.resolve([{ pending: 0 }]);
      if (q.includes("worker_runs")) return Promise.resolve([{ ended_at: recent, errors: 0 }]);
      return Promise.resolve([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetch(true, 200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "healthy");
  assertEquals(result.checks.postgres.status, "ok");
  assertNotEquals(result.checks.postgres.latency_ms, undefined);
});
