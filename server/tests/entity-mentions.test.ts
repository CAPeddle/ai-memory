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

Deno.test({
  name: "entity_mentions: re-extraction removes stale and inserts new",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const thoughtId = await captureThought(
      "Alice uses TypeScript on the Apollo project",
      "project:test-entity-mentions",
    );
    await waitForExtraction(thoughtId);

    const before = await sql<{ entity_name: string }[]>`
      SELECT entity_name FROM entity_mentions WHERE thought_id = ${thoughtId}
    `;
    const beforeNames = before.map((r) => r.entity_name);
    if (!beforeNames.some((n) => n.includes("Alice"))) {
      throw new Error(`Expected initial mentions to include Alice. Got: ${beforeNames.join(", ")}`);
    }

    // Force re-extraction: change content AND fingerprint so the trigger
    // re-queues (server/db/graph.sql lines 60-78 guard on fingerprint).
    const newFingerprint = `forced-${crypto.randomUUID()}`;
    await sql`
      UPDATE thoughts
      SET content = 'Quincy debugs the InvoiceService bug',
          content_fingerprint = ${newFingerprint}
      WHERE id = ${thoughtId}
    `;

    await waitForExtraction(thoughtId);

    const after = await sql<{ entity_name: string }[]>`
      SELECT entity_name FROM entity_mentions WHERE thought_id = ${thoughtId}
    `;
    const afterNames = after.map((r) => r.entity_name);

    if (afterNames.some((n) => n.includes("Alice") || n.includes("Apollo"))) {
      throw new Error(
        `Expected stale entities removed after re-extraction. Got: ${afterNames.join(", ")}`
      );
    }
    if (!afterNames.some((n) => n.includes("Quincy") || n.includes("InvoiceService"))) {
      throw new Error(
        `Expected new entities after re-extraction. Got: ${afterNames.join(", ")}`
      );
    }
  },
});

Deno.test({
  name: "entity_mentions: CHECK constraint rejects unknown label",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const thoughtId = await captureThought(
      "Anchor thought for the CHECK constraint test",
      "project:test-entity-mentions",
    );
    await waitForExtraction(thoughtId);

    let threw = false;
    try {
      await sql`
        INSERT INTO entity_mentions (thought_id, entity_label, entity_name)
        VALUES (${thoughtId}, 'Animal', 'Cat')
      `;
    } catch (err) {
      threw = true;
      const msg = (err as Error).message.toLowerCase();
      if (!msg.includes("check") && !msg.includes("constraint")) {
        throw new Error(`Expected CHECK-constraint error, got: ${(err as Error).message}`);
      }
    }
    if (!threw) {
      throw new Error("Expected INSERT with label 'Animal' to be rejected, but it succeeded.");
    }
  },
});

Deno.test({
  name: "entity_mentions: FK cascade removes mentions when thought is deleted",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const thoughtId = await captureThought(
      "Bob maintains the PaymentService component",
      "project:test-entity-mentions",
    );
    await waitForExtraction(thoughtId);

    const [{ c: before }] = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM entity_mentions WHERE thought_id = ${thoughtId}
    `;
    if (before === 0) {
      throw new Error("Setup precondition failed: no mentions written before delete.");
    }

    await sql`DELETE FROM thoughts WHERE id = ${thoughtId}`;

    const [{ c: after }] = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM entity_mentions WHERE thought_id = ${thoughtId}
    `;
    if (after !== 0) {
      throw new Error(`Expected mentions to cascade-delete, got ${after} surviving rows.`);
    }
  },
});
