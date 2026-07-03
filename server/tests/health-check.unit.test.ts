import { assertEquals, assertNotEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deepHealthCheck, __resetHealthCheckCache, type HealthDeps } from "../src/healthCheck.ts";

function mockFetchReturn(status: number): NonNullable<HealthDeps["fetch"]> {
  return (() => Promise.resolve(new Response(null, { status }))) as unknown as NonNullable<HealthDeps["fetch"]>;
}

function mockFetchReject(): NonNullable<HealthDeps["fetch"]> {
  return (() => Promise.reject(new Error("network failure"))) as unknown as NonNullable<HealthDeps["fetch"]>;
}

function recentRun(now: number, secondsAgo: number): string {
  return new Date(now - secondsAgo * 1000).toISOString();
}

function queryResult<T>(result: T[]): T[] & { cancel: () => void } {
  return Object.assign(result, { cancel: () => {} });
}

function baseSql(now: number, recent: string) {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("#");
    if (q.includes("SELECT 1") || q.includes("SELECT 2")) {
      return queryResult([]);
    }
    if (q.includes("extname = #")) {
      return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
    }
    if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
    if (q.includes("worker_runs")) return queryResult([{ ended_at: recent, errors: 0 }]);
    return queryResult([]);
  }) as unknown as NonNullable<HealthDeps["sql"]>;
}

// Postgres `SELECT 1` probe resolves after a real delay so probePostgres measures
// a deterministic, above-threshold latency via performance.now().
function slowQueryResult<T>(result: T[], delayMs: number): Promise<T[]> & { cancel: () => void } {
  const p = new Promise<T[]>((resolve) => {
    setTimeout(() => resolve(Object.assign(result, { cancel: () => {} })), delayMs);
  }) as Promise<T[]> & { cancel: () => void };
  p.cancel = () => {};
  return p;
}

function slowPostgresSql(recent: string, pgDelayMs: number) {
  return ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const q = strings.join("#");
    if (q.includes("SELECT 1") || q.includes("SELECT 2")) return slowQueryResult([], pgDelayMs);
    if (q.includes("extname = #")) return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
    if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
    if (q.includes("worker_runs")) return queryResult([{ ended_at: recent, errors: 0 }]);
    return queryResult([]);
  }) as unknown as NonNullable<HealthDeps["sql"]>;
}

const SLOW_PG_DELAY_MS = 120;

Deno.test("deepHealthCheck: all probes pass → healthy", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: baseSql(now, recent),
    fetch: mockFetchReturn(200),
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
    sql: ((() => { throw new Error("connection refused"); }) as unknown) as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1") || q.includes("SELECT 2")) return queryResult([]);
      if (q.includes("extname = #")) {
        if (values[0] === "age") return queryResult([{ extversion: "1.6.0" }]);
        return queryResult([]);
      }
      if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
      if (q.includes("worker_runs")) return queryResult([{ ended_at: recentRun(now, 10), errors: 0 }]);
      return queryResult([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1") || q.includes("SELECT 2")) return queryResult([]);
      if (q.includes("extname = #")) {
        if (values[0] === "vector") return queryResult([{ extversion: "0.7.0" }]);
        if (values[0] === "age") return queryResult([]);
        return queryResult([]);
      }
      if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
      if (q.includes("worker_runs")) return queryResult([{ ended_at: recentRun(now, 10), errors: 0 }]);
      return queryResult([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
    sql: baseSql(now, recent),
    fetch: mockFetchReturn(500),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.embedding_api.status, "error");
  assertEquals(result.checks.embedding_api.status_code, 500);
});

Deno.test("deepHealthCheck: embedding API network error → degraded with error field", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: baseSql(now, recent),
    fetch: mockFetchReject(),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.embedding_api.status, "error");
  assert(typeof result.checks.embedding_api.error === "string");
  assertEquals(result.checks.embedding_api.status_code, undefined);
});

Deno.test("deepHealthCheck: embedding backlog exceeds threshold → degraded", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1") || q.includes("SELECT 2")) return queryResult([]);
      if (q.includes("extname = #")) return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return queryResult([{ pending: 150 }]);
      if (q.includes("worker_runs")) return queryResult([{ ended_at: recentRun(now, 10), errors: 0 }]);
      return queryResult([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
  const staleRun = new Date(now - 180_000).toISOString();
  const deps: HealthDeps = {
    sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("#");
      if (q.includes("SELECT 1") || q.includes("SELECT 2")) return queryResult([]);
      if (q.includes("extname = #")) return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
      if (q.includes("worker_runs")) return queryResult([{ ended_at: staleRun, errors: 0 }]);
      return queryResult([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
  const deps: HealthDeps = {
    sql: baseSql(now, recentRun(now, 10)),
    fetch: mockFetchReturn(200),
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
  const deps: HealthDeps = {
    sql: baseSql(now, recentRun(now, 10)),
    fetch: mockFetchReturn(200),
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
      if (q.includes("SELECT 1") || q.includes("SELECT 2")) return queryResult([]);
      if (q.includes("extname = #")) return queryResult([{ extversion: "0.7.0" }, { extversion: "1.6.0" }]);
      if (q.includes("needs_embedding")) return queryResult([{ pending: 0 }]);
      if (q.includes("worker_runs")) return queryResult([]);
      return queryResult([]);
    }) as unknown as NonNullable<HealthDeps["sql"]>,
    fetch: mockFetchReturn(200),
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
  let callCount = 0;
  const failingFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    return Promise.resolve(new Response(null, { status: 500 }));
  }) as unknown as NonNullable<HealthDeps["fetch"]>;

  const deps1: HealthDeps = { sql: baseSql(now, recentRun(now, 10)), fetch: failingFetch, now: () => now, env: () => undefined };
  const result1 = await deepHealthCheck(deps1);
  assertEquals(result1.checks.embedding_api.status, "error");
  assertEquals(callCount, 1);

  const deps2: HealthDeps = { sql: baseSql(now, recentRun(now, 10)), fetch: failingFetch, now: () => now + 30_000, env: () => undefined };
  const result2 = await deepHealthCheck(deps2);
  assertEquals(result2.checks.embedding_api.cached, true);
  assertEquals(callCount, 1);
});

Deno.test("deepHealthCheck: embedding API cache scoped by config key", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  let callCount = 0;
  const flipFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    const status = callCount === 1 ? 500 : 200;
    return Promise.resolve(new Response(null, { status }));
  }) as unknown as NonNullable<HealthDeps["fetch"]>;

  const baseSqlFn = baseSql(now, recentRun(now, 10));

  const baseDeps: HealthDeps = { sql: baseSqlFn, fetch: flipFetch, now: () => now, env: () => undefined };

  const result1 = await deepHealthCheck(baseDeps);
  assertEquals(result1.checks.embedding_api.status, "error");
  assertEquals(callCount, 1);

  const depsDiffKey: HealthDeps = {
    sql: baseSqlFn,
    fetch: flipFetch,
    now: () => now + 30_000,
    env: (name: string) => {
      if (name === "OPENROUTER_BASE_URL") return "https://different-openrouter.example.com/api/v1";
      return undefined;
    },
  };
  const result2 = await deepHealthCheck(depsDiffKey);
  assertEquals(result2.checks.embedding_api.status, "ok");
  assert(!result2.checks.embedding_api.cached);
  assertEquals(callCount, 2);
});

Deno.test("deepHealthCheck: embedding API cache expires and refreshes", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  let callCount = 0;
  const flipFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    const status = callCount === 1 ? 500 : 200;
    return Promise.resolve(new Response(null, { status }));
  }) as unknown as NonNullable<HealthDeps["fetch"]>;

  const deps1: HealthDeps = { sql: baseSql(now, recentRun(now, 10)), fetch: flipFetch, now: () => now, env: () => undefined };
  const result1 = await deepHealthCheck(deps1);
  assertEquals(result1.checks.embedding_api.status, "error");
  assertEquals(callCount, 1);

  const deps2: HealthDeps = { sql: baseSql(now, recentRun(now, 10)), fetch: flipFetch, now: () => now + 120_000, env: () => undefined };
  const result2 = await deepHealthCheck(deps2);
  assertEquals(result2.checks.embedding_api.status, "ok");
  assertEquals(callCount, 2);
});

Deno.test("deepHealthCheck: fast Postgres includes latency_ms and reports healthy", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: baseSql(now, recent),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: () => undefined,
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "healthy");
  assertEquals(result.checks.postgres.status, "ok");
  assertNotEquals(result.checks.postgres.latency_ms, undefined);
});

Deno.test("deepHealthCheck: low Postgres latency threshold triggers degraded via env override", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const deps: HealthDeps = {
    sql: slowPostgresSql(recentRun(now, 10), SLOW_PG_DELAY_MS),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: (name: string) => {
      if (name === "HEALTH_POSTGRES_LATENCY_MS") return "1";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.postgres.status, "ok");
  assert(typeof result.checks.postgres.latency_ms === "number");
});

Deno.test("deepHealthCheck: env override for HEALTH_POSTGRES_LATENCY_MS is respected", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);

  const deps: HealthDeps = {
    sql: slowPostgresSql(recent, SLOW_PG_DELAY_MS),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: (name: string) => {
      if (name === "HEALTH_POSTGRES_LATENCY_MS") return "50";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
});

Deno.test("deepHealthCheck: env set to 0 for thresholds is accepted (zero-tolerance)", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: slowPostgresSql(recent, SLOW_PG_DELAY_MS),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: (name: string) => {
      if (name === "HEALTH_POSTGRES_LATENCY_MS") return "0";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "degraded");
  assertEquals(result.checks.postgres.status, "ok");
});

Deno.test("deepHealthCheck: env set to negative number uses default threshold", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  const recent = recentRun(now, 10);
  const deps: HealthDeps = {
    sql: baseSql(now, recent),
    fetch: mockFetchReturn(200),
    now: () => now,
    env: (name: string) => {
      if (name === "HEALTH_POSTGRES_LATENCY_MS") return "-1";
      return undefined;
    },
  };
  const result = await deepHealthCheck(deps);
  assertEquals(result.status, "healthy");
});

Deno.test("deepHealthCheck: concurrent calls with different config use separate cache keys", async () => {
  __resetHealthCheckCache();
  const now = 1_000_000_000_000;
  let callCount = 0;
  const countingFetch: NonNullable<HealthDeps["fetch"]> = (() => {
    callCount++;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as unknown as NonNullable<HealthDeps["fetch"]>;

  const baseSqlFn = baseSql(now, recentRun(now, 10));

  const results = await Promise.all([
    deepHealthCheck({ sql: baseSqlFn, fetch: countingFetch, now: () => now, env: () => undefined }),
    deepHealthCheck({
      sql: baseSqlFn,
      fetch: countingFetch,
      now: () => now,
      env: (name) => name === "OPENROUTER_BASE_URL" ? "https://other.example.com/api/v1" : undefined,
    }),
  ]);

  assertEquals(results[0].checks.embedding_api.status, "ok");
  assertEquals(results[1].checks.embedding_api.status, "ok");
  assertEquals(callCount, 2);
});
