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
