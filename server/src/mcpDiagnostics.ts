/**
 * MCP request boundary diagnostics.
 *
 * Emits one structured JSON log line per /mcp request:
 *   { ts, request_id, method, status, duration_ms, embedding_lane, error_class? }
 *
 * Correlation ID policy:
 *   - Honor inbound X-Correlation-ID if it matches the safe-characters regex.
 *   - Generate a UUID v4 server-side otherwise (header absent, empty, or invalid).
 *
 * Body logging (ENABLE_BODY_LOGGING=true):
 *   - Logs structural fields only (method, id) from the JSON-RPC body.
 *   - Never logs params.content, params.query, or any user-supplied memory content.
 *
 * The embedding_lane field is set by search tools and surfaced here so operators
 * can distinguish full (BM25+vector) from degraded (BM25-only) responses.
 */

/** Regex for acceptable correlation ID characters. Max 128 chars. */
const CORRELATION_ID_RE = /^[A-Za-z0-9\-_.]{1,128}$/;

export type EmbeddingLane = "full" | "bm25_only" | "n/a";

/**
 * Parse and sanitize the X-Correlation-ID header. Returns a server-generated
 * UUID v4 when the header is absent, empty, or contains unsafe characters.
 */
export function resolveCorrelationId(request: Request): string {
  const incoming = request.headers.get("X-Correlation-ID") ?? "";
  if (incoming && CORRELATION_ID_RE.test(incoming)) {
    return incoming;
  }
  return crypto.randomUUID();
}

/**
 * Extract safe structural fields from the JSON-RPC body for logging.
 * Uses a cloned body read so the original stream is not exhausted.
 * Returns a safe sentinel string on any parse error.
 */
export async function extractSafeBodyFields(
  request: Request,
): Promise<{ method?: string; id?: string | number } | string> {
  try {
    const cloned = request.clone();
    const body = await cloned.json() as Record<string, unknown>;
    const result: { method?: string; id?: string | number } = {};
    if (typeof body.method === "string") result.method = body.method;
    if (typeof body.id === "string" || typeof body.id === "number") result.id = body.id;
    return result;
  } catch {
    return "<parse-error>";
  }
}

/**
 * Module-level last-write cell for embedding lane.
 *
 * Search tool handlers call setActiveEmbeddingLane() as they complete.
 * The route handler calls takeActiveEmbeddingLane() in the finally block to
 * include the lane in the log entry. This is safe for the sequential
 * per-request MCP model (one JSON-RPC call per HTTP request lifecycle).
 */
let _activeEmbeddingLane: EmbeddingLane = "n/a";

export function setActiveEmbeddingLane(lane: EmbeddingLane): void {
  _activeEmbeddingLane = lane;
}

/** Read and reset the active embedding lane. Returns "n/a" if not set. */
export function takeActiveEmbeddingLane(): EmbeddingLane {
  const lane = _activeEmbeddingLane;
  _activeEmbeddingLane = "n/a";
  return lane;
}

export interface McpRequestLog {
  ts: string;
  request_id: string;
  method?: string;
  status: number;
  duration_ms: number;
  embedding_lane: EmbeddingLane;
  error_class?: string;
}

export function emitRequestLog(entry: McpRequestLog): void {
  console.log("[mcp]", JSON.stringify(entry));
}

/**
 * Whether optional body logging is enabled. Off by default.
 * Set ENABLE_BODY_LOGGING=true in the environment to enable.
 */
export function isBodyLoggingEnabled(): boolean {
  return Deno.env.get("ENABLE_BODY_LOGGING") === "true";
}
