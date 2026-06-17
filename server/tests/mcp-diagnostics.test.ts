import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type EmbeddingLane,
  extractSafeBodyFields,
  resolveCorrelationId,
  runWithMcpRequestContext,
  setActiveEmbeddingLane,
  takeActiveEmbeddingLane,
} from "../src/mcpDiagnostics.ts";

// ---------------------------------------------------------------------------
// resolveCorrelationId
// ---------------------------------------------------------------------------

Deno.test("resolveCorrelationId: honors valid inbound header", () => {
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "X-Correlation-ID": "my-trace-123" },
    body: "{}",
  });
  assertEquals(resolveCorrelationId(req), "my-trace-123");
});

Deno.test("resolveCorrelationId: generates UUID when header absent", () => {
  const req = new Request("http://localhost/mcp", { method: "POST", body: "{}" });
  const id = resolveCorrelationId(req);
  assertMatch(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

Deno.test("resolveCorrelationId: generates UUID when header contains unsafe characters", () => {
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "X-Correlation-ID": "<script>evil</script>" },
    body: "{}",
  });
  const id = resolveCorrelationId(req);
  // Should be a generated UUID, not the unsafe value
  assertNotEquals(id, "<script>evil</script>");
  assertMatch(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

Deno.test("resolveCorrelationId: generates UUID when header is empty", () => {
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "X-Correlation-ID": "" },
    body: "{}",
  });
  const id = resolveCorrelationId(req);
  assertMatch(id, /^[0-9a-f]{8}-/);
});

Deno.test("resolveCorrelationId: accepts dots, dashes, underscores", () => {
  const safe = "trace.2025-06-14_001";
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "X-Correlation-ID": safe },
    body: "{}",
  });
  assertEquals(resolveCorrelationId(req), safe);
});

Deno.test("resolveCorrelationId: rejects values over 128 chars", () => {
  const tooLong = "a".repeat(129);
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "X-Correlation-ID": tooLong },
    body: "{}",
  });
  const id = resolveCorrelationId(req);
  assertNotEquals(id, tooLong);
  assertMatch(id, /^[0-9a-f]{8}-/);
});

// ---------------------------------------------------------------------------
// extractSafeBodyFields
// ---------------------------------------------------------------------------

Deno.test("extractSafeBodyFields: extracts method tool and id from valid JSON-RPC body", async () => {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    id: 42,
    params: { name: "search_thoughts", arguments: { query: "secret content" } },
  });
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const fields = await extractSafeBodyFields(req);
  assertEquals(fields, { method: "tools/call", tool: "search_thoughts", id: 42 });
});

Deno.test("extractSafeBodyFields: never includes params or content fields", async () => {
  const body = JSON.stringify({ method: "tools/call", params: { content: "my secret" }, id: "req-1" });
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const fields = await extractSafeBodyFields(req);
  assertEquals(Object.keys(fields as object).sort(), ["id", "method"]);
});

Deno.test("extractSafeBodyFields: returns sentinel on non-JSON body", async () => {
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not json",
  });
  const fields = await extractSafeBodyFields(req);
  assertEquals(fields, "<parse-error>");
});

// ---------------------------------------------------------------------------
// setActiveEmbeddingLane / takeActiveEmbeddingLane
// ---------------------------------------------------------------------------

Deno.test("embedding lane cell: defaults to n/a when not set", () => {
  // Ensure clean state — take whatever is there
  takeActiveEmbeddingLane();
  assertEquals(takeActiveEmbeddingLane(), "n/a");
});

Deno.test("embedding lane cell: reflects value set by search tool", () => {
  return runWithMcpRequestContext(() => {
    setActiveEmbeddingLane("full");
    assertEquals(takeActiveEmbeddingLane(), "full");
    // After take, resets to n/a
    assertEquals(takeActiveEmbeddingLane(), "n/a");
  });
});

Deno.test("embedding lane cell: bm25_only is preserved through take", () => {
  return runWithMcpRequestContext(() => {
    setActiveEmbeddingLane("bm25_only");
    const lane: EmbeddingLane = takeActiveEmbeddingLane();
    assertEquals(lane, "bm25_only");
  });
});

Deno.test("embedding lane context: concurrent requests do not overwrite each other", async () => {
  let releaseFirst!: () => void;
  const firstReady = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  let allowFirstToFinish!: () => void;
  const allowFirst = new Promise<void>((resolve) => {
    allowFirstToFinish = resolve;
  });

  const first = runWithMcpRequestContext(async () => {
    setActiveEmbeddingLane("full");
    releaseFirst();
    await allowFirst;
    return takeActiveEmbeddingLane();
  });

  const second = runWithMcpRequestContext(async () => {
    await firstReady;
    setActiveEmbeddingLane("bm25_only");
    allowFirstToFinish();
    return takeActiveEmbeddingLane();
  });

  const [firstLane, secondLane] = await Promise.all([first, second]);
  assertEquals(firstLane, "full");
  assertEquals(secondLane, "bm25_only");
});
