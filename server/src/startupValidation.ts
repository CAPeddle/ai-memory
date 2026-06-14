const REQUIRED_ENV = ["OPENROUTER_API_KEY", "MEMORY_API_KEY"] as const;

interface EnsureRequiredEnvOptions {
  readEnv?: (name: string) => string | undefined;
  logFatal?: (message: string) => void;
  exit?: (code: number) => unknown;
}

export function findMissingRequiredEnv(
  readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): string[] {
  return REQUIRED_ENV.filter((name) => !readEnv(name));
}

export function ensureRequiredEnv(options: EnsureRequiredEnvOptions = {}): void {
  const readEnv = options.readEnv ?? ((name: string) => Deno.env.get(name));
  const logFatal = options.logFatal ?? console.error;
  const exit = options.exit ?? Deno.exit;

  const missing = findMissingRequiredEnv(readEnv);
  if (!missing.length) return;

  // Keep message format stable for operational checks in ST-038.
  logFatal(`FATAL: Required environment variable ${missing[0]} is not set. Exiting.`);
  exit(1);
}

/**
 * Idempotent startup repair: ensure the recall_queries table and its index exist.
 *
 * The table is declared in schema.sql but was absent from the Docker init scripts
 * on running instances. This probe runs on every startup and is safe for both
 * fresh databases (schema.sql already creates it) and existing databases that
 * pre-date the migration.
 */
export async function ensureRecallQueriesTable(
  execSql: (query: string) => Promise<unknown>,
  log: (msg: string) => void = console.log,
): Promise<void> {
  try {
    await execSql(`
      CREATE TABLE IF NOT EXISTS public.recall_queries (
        id               bigserial   PRIMARY KEY,
        tool             text        NOT NULL CHECK (tool IN ('search', 'search_thoughts')),
        query            text        NOT NULL,
        normalized_query text        NOT NULL,
        project          text,
        profile          text,
        result_count     int         NOT NULL CHECK (result_count >= 0),
        top_result_ids   uuid[]      NOT NULL DEFAULT '{}'::uuid[],
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await execSql(`
      CREATE INDEX IF NOT EXISTS idx_recall_queries_tool_created
        ON public.recall_queries(tool, created_at DESC)
    `);
    log("[startup] recall_queries table verified");
  } catch (err) {
    // Log the error but never crash the server — the table may already exist
    // in a form we cannot easily detect, or the database may be temporarily
    // unavailable. logRecallQuery() will continue to fail-safe.
    console.error("[startup] recall_queries repair failed:", (err as Error).message);
  }
}
