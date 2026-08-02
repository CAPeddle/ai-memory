/**
 * ST-086 defect closure — `MODEL_PROVIDER_ENABLED=false` is documented as an egress
 * switch ("this process makes no model-provider request"), but until this change it
 * was read in exactly ONE place (`probeEmbeddingApi` in server/src/healthCheck.ts).
 * `getEmbedding()` still fired ungated from three MCP tool handlers, so a
 * workflow-only deployment that promised provider-free operation still POSTed user
 * queries and captured content to the provider on any authenticated `/mcp` tool call.
 *
 * The PO's decision (implemented in server/src/embeddings.ts and server/index.ts):
 * refuse the tool call. A tool whose contract requires the provider must fail loudly
 * rather than silently degrade to lexical-only results.
 *
 * This file is the real control for that fail-closed boundary, in three layers:
 *
 *   1. Unit: `getEmbedding()` throws `ModelProviderDisabledError` when the switch is
 *      off, and makes literally zero network requests while doing so.
 *   2. Discrimination control: the SAME call, with the switch unset, DOES reach the
 *      sentinel — proving layer 1's "zero hits" is a real negative, not a test that
 *      never exercised the network path at all.
 *   3. Process boundary: a real server process, booted with the exact ST-086
 *      workflow-only environment, receives a REAL authenticated `/mcp` `search_thoughts`
 *      call and (a) reports the refusal to the caller rather than degraded results,
 *      and (b) the sentinel it was pointed at recorded zero hits. This is the test a
 *      security reviewer flagged as missing: the existing suite proved zero provider
 *      calls only because it never issued a tool call.
 *
 * **Module-scope import ordering, and why layers 1-2 use a dynamic import.**
 * `server/src/embeddings.ts` reads `OPENROUTER_BASE_URL` at module scope (its line 6).
 * A static `import` is hoisted ahead of every other statement in a file, so writing
 * `Deno.env.set("OPENROUTER_BASE_URL", ...)` above a static `import ... from
 * "../src/embeddings.ts"` would NOT work — the import already ran before that line's
 * position in source order matters. ES modules are also singletons per resolved
 * specifier within a process: once evaluated, re-importing (even dynamically) returns
 * the same cached instance without re-running top-level code. So this file has no
 * static import of embeddings.ts. It sets `OPENROUTER_BASE_URL` and
 * `OPENROUTER_API_KEY` first, then reaches the module through a dynamic `import()`,
 * which evaluates lazily at the call site — guaranteeing the module's first
 * evaluation happens with those env vars already pointed at the sentinel. This only
 * matters within THIS file/process: layer 3 spawns a separate child process via
 * `Deno.Command`, which has its own independent module graph regardless of what this
 * file already imported.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  apiCall as _apiCall,
  startProviderSentinel,
  startServerProcess,
  type ProviderSentinel,
  type ServerProcess,
} from "./_helpers/serverProcess.ts";

const MEMORY_API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";
const DATABASE_URL = Deno.env.get("DATABASE_URL")!;

/** High, uncommon port: workflow-mvp-e2e.test.ts already claims 3142/3143. */
const PROCESS_PORT = 3160;

// ---------------------------------------------------------------------------
// Layers 1-2 setup: point OPENROUTER_BASE_URL at a sentinel BEFORE embeddings.ts
// is first evaluated (see the module-doc comment above for why this must be a
// dynamic import that runs after these env vars are set).
// ---------------------------------------------------------------------------

const unitSentinel = await startProviderSentinel();
Deno.env.set("OPENROUTER_BASE_URL", unitSentinel.baseUrl);
Deno.env.set("OPENROUTER_API_KEY", "sentinel-test-key");

const { getEmbedding, ModelProviderDisabledError } = await import("../src/embeddings.ts");

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "layer 1: getEmbedding() throws ModelProviderDisabledError and makes zero requests when MODEL_PROVIDER_ENABLED=false",
  fn: async () => {
    Deno.env.set("MODEL_PROVIDER_ENABLED", "false");
    const hitsBefore = unitSentinel.hits.length;
    try {
      await assertRejects(
        () => getEmbedding("does this reach the provider"),
        ModelProviderDisabledError,
      );
      assertEquals(
        unitSentinel.hits.length,
        hitsBefore,
        `expected zero sentinel hits while MODEL_PROVIDER_ENABLED=false, got ` +
          `${unitSentinel.hits.length - hitsBefore} new hit(s): ${JSON.stringify(unitSentinel.hits)}`,
      );
    } finally {
      Deno.env.delete("MODEL_PROVIDER_ENABLED");
    }
  },
});

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "layer 2 (discrimination control): the SAME call with MODEL_PROVIDER_ENABLED unset DOES reach the sentinel",
  fn: async () => {
    // Without this control, layer 1's "zero hits" could just mean the test never
    // exercised the network path at all — same sentinel, same call, same code path,
    // only the switch differs.
    //
    // The sentinel answers every request with a `/models`-shaped body (see its doc
    // comment in serverProcess.ts), not an embeddings-shaped one, so `getEmbedding`
    // reaching it does not itself resolve to a valid 512-dim vector — the point here
    // is only that the network call was made, not what came back. Swallow whatever
    // `getEmbedding` does with that mismatched body and assert on the sentinel's hit
    // count, which is the actual thing this control exists to prove.
    Deno.env.delete("MODEL_PROVIDER_ENABLED");
    const hitsBefore = unitSentinel.hits.length;
    await getEmbedding("does this reach the provider").catch(() => {});
    assert(
      unitSentinel.hits.length > hitsBefore,
      "expected the sentinel to record at least one hit when the provider is not " +
        "disabled — otherwise layer 1's zero-hit assertion proves nothing",
    );
  },
});

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name: "layer 1/2 cleanup: close the unit-level sentinel",
  fn: async () => {
    await unitSentinel.close();
  },
});

// ---------------------------------------------------------------------------
// Layer 3: process boundary. A separate child process, independent module graph —
// module-scope import ordering above does not apply here.
// ---------------------------------------------------------------------------

/**
 * The exact ST-086 workflow-only environment (mirrors `workflowOnlyEnv` in
 * workflow-mvp-e2e.test.ts), pointed at its own dedicated sentinel so this test's
 * zero-hit assertion cannot be muddied by layer 1/2 traffic on the shared unit
 * sentinel above.
 */
function workflowOnlyEnv(sentinel: ProviderSentinel): Record<string, string> {
  return {
    DATABASE_URL,
    MEMORY_API_KEY,
    FEATURE_WORKFLOW: "true",
    FEATURE_ENTITY_WORKER: "false",
    FEATURE_CONSOLIDATION_WORKER: "false",
    FEATURE_EMBEDDING_BACKFILL: "false",
    MODEL_PROVIDER_ENABLED: "false",
    // Any provider call the server makes lands on this sentinel and is counted.
    OPENROUTER_BASE_URL: sentinel.baseUrl,
  };
}

/**
 * Issue a real authenticated `/mcp` `tools/call` request against a running server
 * process and return the parsed JSON-RPC payload.
 *
 * Deliberately not `mcpCall`/`mcpRequest` from `./_helpers/mcpClient.ts` — those read
 * `MCP_BASE_URL` at module scope, fixed at this file's own import time, but this test
 * needs to target a dynamically-allocated child process's `baseUrl`. The request/
 * response shape (the required `Accept: application/json, text/event-stream` header,
 * and the SSE `data:` line framing) is copied from that helper as the reference
 * implementation.
 */
async function mcpToolCall(
  baseUrl: string,
  apiKey: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ result?: { isError?: boolean; content?: Array<{ text?: string }> } }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
  if (!res.ok) {
    throw new Error(`MCP call failed: ${res.status} ${await res.text()}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    return JSON.parse(dataLine.slice(5).trim());
  }
  return await res.json();
}

Deno.test({
  sanitizeResources: false,
  sanitizeOps: false,
  name:
    "layer 3 (process boundary): search_thoughts refuses under MODEL_PROVIDER_ENABLED=false and the sentinel records zero hits",
  fn: async () => {
    const sentinel = await startProviderSentinel();
    let server: ServerProcess | null = null;
    try {
      server = await startServerProcess(workflowOnlyEnv(sentinel), PROCESS_PORT);

      const response = await mcpToolCall(
        server.baseUrl,
        MEMORY_API_KEY,
        "search_thoughts",
        { query: "does this reach the provider" },
      );

      // Assert the egress evidence FIRST. This is the actual defect being closed —
      // "the tool call POSTs the user's query to the provider" — not the shape of the
      // response. Asserting it before the isError check means a red run (guard
      // removed) fails here with the sentinel's recorded hit(s) in the message, not on
      // the isError check below, which would only prove degraded results without ever
      // showing the request reached the provider.
      assertEquals(
        sentinel.hits,
        [],
        `expected zero provider requests, but the sentinel recorded ` +
          `${sentinel.hits.length}: ${JSON.stringify(sentinel.hits)}`,
      );

      assertEquals(
        response.result?.isError,
        true,
        `expected search_thoughts to refuse (isError: true) rather than return ` +
          `degraded results; got: ${JSON.stringify(response)}`,
      );
      const text = response.result?.content?.[0]?.text ?? "";
      assertStringIncludes(text, "MODEL_PROVIDER_ENABLED=false");
    } finally {
      if (server) await server.stop();
      await sentinel.close();
    }
  },
});
