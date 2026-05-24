/**
 * Integration tests for entity_mentions back-link table.
 * Spec: docs/design/specs/2026-05-22-entity-thought-provenance.md
 *
 * Run:
 *   docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
 */

import { sql } from "../src/db.ts";

const MCP_BASE = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
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
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    return dataLine.slice(5).trim();
  }
  return await res.text();
}

async function captureThought(content: string, context?: string): Promise<string> {
  const body = await mcpCall("capture_thought", { content, ...(context ? { context } : {}) });
  const match = body.match(/id:\s*([0-9a-f-]{36})/i);
  if (!match) throw new Error(`Could not extract thought id from response: ${body.slice(0, 300)}`);
  return match[1];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForExtraction(thoughtId: string, maxSec = 40): Promise<void> {
  for (let i = 0; i < maxSec; i++) {
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM entity_extraction_queue WHERE thought_id = ${thoughtId}
    `;
    if (row?.status === "done") return;
    if (row?.status === "failed") throw new Error(`Entity extraction failed for thought ${thoughtId}`);
    await sleep(1_000);
  }
  throw new Error(`Entity extraction did not complete within ${maxSec}s for thought ${thoughtId}`);
}

Deno.test({
  name: "entity_mentions: capture writes mentions for extracted entities",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const thoughtId = await captureThought(
    "Alice uses TypeScript for the Zoom project and it was caused by a NullReferenceError",
    "project:test-entity-mentions",
  );

  await waitForExtraction(thoughtId);

  const rows = await sql<{ entity_label: string; entity_name: string }[]>`
    SELECT entity_label, entity_name
    FROM entity_mentions
    WHERE thought_id = ${thoughtId}
  `;

  if (rows.length === 0) {
    throw new Error(
      `Expected entity_mentions rows for thought ${thoughtId}, got none. ` +
      `Worker may not be writing mentions yet.`
    );
  }

  const names = rows.map((r) => r.entity_name);
  const expectedAny = ["Alice", "TypeScript", "Zoom", "NullReferenceError"];
  const found = expectedAny.some((e) => names.some((n) => n.includes(e)));
  if (!found) {
    throw new Error(
      `Expected at least one of ${expectedAny.join(", ")} in mentions. Got: ${names.join(", ")}`
    );
  }
},
});
