/**
 * Integration test for ST-022: Entity Extraction Worker
 *
 * Prerequisites:
 *   docker compose up -d  (from repo root)
 *   Wait for mcp service to be healthy
 *
 * Run:
 *   deno test --allow-net --allow-env tests/entity-worker.test.ts
 */

const MCP_BASE = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP call failed: ${res.status} ${await res.text()}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    // Parse SSE: find first data: line and return its JSON
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    return JSON.parse(dataLine.slice(5).trim());
  }
  return await res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.test("entity extraction: capture_thought → queue → graph populated", async () => {
  // 1. Capture a thought with extractable entities
  const captureResult = await mcpCall("capture_thought", {
    content: "Alice uses TypeScript for the Zoom project and it was caused by a NullReferenceError",
    memory_type: "shard",
    context: "project:test-st022",
  });
  console.log("Capture result:", JSON.stringify(captureResult));

  // 2. Wait for worker to process (poll interval 10s + processing time)
  console.log("Waiting 20s for entity extraction worker...");
  await sleep(20_000);

  // 3. Verify graph contains expected nodes via graph_search
  const searchResult = await mcpCall("graph_search", {
    start_node: "Alice",
    max_hops: 2,
  });
  console.log("Graph search result:", JSON.stringify(searchResult));

  // The result should contain connected nodes (TypeScript, Zoom, NullReferenceError)
  const resultText = JSON.stringify(searchResult);
  const hasConnections = resultText.includes("TypeScript") ||
    resultText.includes("Zoom") ||
    resultText.includes("NullReferenceError");

  if (!hasConnections) {
    throw new Error(
      `Expected graph_search from 'Alice' to find connected entities. Got: ${resultText}`
    );
  }
});

Deno.test("entity extraction: graph_traverse raw cypher still works", async () => {
  // Verify the existing raw cypher tool is preserved and functional
  const result = await mcpCall("graph_traverse", {
    cypher: "MATCH (n:Person) RETURN n LIMIT 5",
  });
  console.log("graph_traverse result:", JSON.stringify(result));
  const resultText = JSON.stringify(result);
  // Should return at least Alice from the previous test
  if (!resultText.includes("Alice")) {
    throw new Error(`Expected graph_traverse to find Person nodes. Got: ${resultText}`);
  }
});

Deno.test("entity extraction: graph_search with relationship filter", async () => {
  const result = await mcpCall("graph_search", {
    start_node: "Alice",
    relationship_filter: "USES",
    max_hops: 1,
  });
  console.log("Filtered graph_search result:", JSON.stringify(result));
  // Should either find TypeScript via USES or return empty (LLM dependent)
  // This test verifies the tool doesn't error — exact results depend on LLM extraction
  const resultText = JSON.stringify(result);
  if (resultText.includes("Error") && resultText.includes("isError")) {
    throw new Error(`graph_search with filter should not error. Got: ${resultText}`);
  }
});

Deno.test("entity extraction: invalid relationship filter rejected", async () => {
  const result = await mcpCall("graph_search", {
    start_node: "Alice",
    relationship_filter: "INVALID_REL",
    max_hops: 1,
  }) as { result?: { content?: Array<{ text?: string }> } };
  console.log("Invalid filter result:", JSON.stringify(result));
  const resultText = JSON.stringify(result);
  // Should return an error about invalid relationship
  if (!resultText.includes("Invalid relationship_filter") && !resultText.includes("Allowed")) {
    throw new Error(`Expected validation error for invalid rel filter. Got: ${resultText}`);
  }
});
