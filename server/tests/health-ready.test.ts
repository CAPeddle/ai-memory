import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const mcpBase = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const baseUrl = mcpBase.replace(/\/mcp$/, "").replace(/\/$/, "");

Deno.test("/ready returns 200 (not 503) with correct response shape", async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assertEquals(r.status, 200);
  const body = await r.json();
  assertExists(body.status);
  assertExists(body.checks);
});

Deno.test("/ready reports healthy postgres, pgvector, age, and embedding_api", async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.checks.postgres.status, "ok");
  assertEquals(body.checks.pgvector.status, "ok");
  assertEquals(body.checks.age.status, "ok");
  assertEquals(body.checks.embedding_api.status, "ok");
});

Deno.test("/ready reports embedding_backlog as n/a (backfill disabled in test env)", async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.checks.embedding_backlog.status, "n/a");
});

Deno.test("/ready returns JSON content-type", async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assertEquals(r.status, 200);
  assertStringIncludes(r.headers.get("content-type") ?? "", "application/json");
  await r.body?.cancel();
});

Deno.test("/ready has all seven check fields", async () => {
  const r = await fetch(`${baseUrl}/ready`);
  assertEquals(r.status, 200);
  const body = await r.json();
  const checkNames = Object.keys(body.checks).sort();
  assertEquals(checkNames, [
    "age",
    "consolidation_worker",
    "embedding_api",
    "embedding_backlog",
    "entity_worker",
    "pgvector",
    "postgres",
  ]);
});
