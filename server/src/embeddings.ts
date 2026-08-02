// Shared OpenRouter embedding client. Side-effect-free so workers and the
// server can both import it (index.ts has top-level Deno.serve + worker starts;
// importing FROM index.ts would boot the server and create a circular import).

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE = Deno.env.get("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";

/** Default embedding timeout in milliseconds. Overridable via EMBEDDING_TIMEOUT_MS env var. */
const DEFAULT_EMBEDDING_TIMEOUT_MS = 10_000;

function resolveTimeoutMs(): number {
  const raw = Deno.env.get("EMBEDDING_TIMEOUT_MS");
  if (!raw) return DEFAULT_EMBEDDING_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EMBEDDING_TIMEOUT_MS;
}

/** The exact model id sent to OpenRouter. Recorded per-thought as embedding_model (AC-17). */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export interface GetEmbeddingOptions {
  /** Milliseconds before the request is aborted. Defaults to EMBEDDING_TIMEOUT_MS env or 10 000. */
  timeoutMs?: number;
}

/**
 * Thrown when `MODEL_PROVIDER_ENABLED=false` and something still calls `getEmbedding`.
 * Named and exported so callers can `instanceof`-check it and choose to let it
 * propagate — a caller whose contract requires the provider (e.g. a semantic search
 * tool) must fail loudly rather than silently degrade, whereas every OTHER
 * `getEmbedding` failure (timeout, 5xx, network) keeps being swallowed into a lexical
 * fallback exactly as before. The message names the switch so an operator reading a
 * log knows precisely which setting caused it.
 */
export class ModelProviderDisabledError extends Error {
  constructor() {
    super(
      "MODEL_PROVIDER_ENABLED=false: the model provider is disabled for this " +
        "deployment; getEmbedding() refuses to make a request.",
    );
    this.name = "ModelProviderDisabledError";
  }
}

/**
 * 512-dim embedding via text-embedding-3-small truncation. Throws on non-2xx or timeout.
 * The AbortController ensures a hanging provider cannot stall the caller indefinitely.
 */
export async function getEmbedding(text: string, opts: GetEmbeddingOptions = {}): Promise<number[]> {
  // Read INSIDE the function, not at module scope. A module-scope read (like
  // OPENROUTER_API_KEY above) freezes at import time — before any test or deployment
  // has a chance to set the flag — and would make this guard untestable without
  // re-importing the module. Checked first, before constructing any Request or
  // touching fetch, so a disabled provider results in zero network activity.
  if (Deno.env.get("MODEL_PROVIDER_ENABLED") === "false") {
    throw new ModelProviderDisabledError();
  }

  const timeoutMs = opts.timeoutMs ?? resolveTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: 512,
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
    }
    const d = await r.json();
    return d.data[0].embedding;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`OpenRouter embeddings timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
