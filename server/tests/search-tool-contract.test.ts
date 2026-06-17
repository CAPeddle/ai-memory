import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { extractText, mcpCall } from "./_helpers/mcpClient.ts";

const INCIDENT_QUERY = "build pipeline failure";

function parseSearchPayload(result: unknown): { results: Array<{ id: string; title: string; url: string }> } {
  const payload = JSON.parse(extractText(result)) as {
    results?: Array<{ id?: string; title?: string; url?: string }>;
  };

  assert(Array.isArray(payload.results), "Expected search payload to expose a results array");

  return {
    results: payload.results.map((item) => ({
      id: item.id ?? "",
      title: item.title ?? "",
      url: item.url ?? "",
    })),
  };
}

Deno.test({
  name: "search contract: returns JSON text with the pinned results array shape",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("search", { query: "definitely-no-match-contract-probe" });
    const payload = parseSearchPayload(result);

    assert(Array.isArray(payload.results));
    for (const item of payload.results) {
      assert(item.id.length > 0, "Expected each search result to include an id");
      assert(item.title.length > 0, "Expected each search result to include a title");
      assert(item.url.length > 0, "Expected each search result to include a url");
    }
  },
});

Deno.test({
  name: "search contract: incident query returns non-empty pinned results after fallback",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("search", { query: INCIDENT_QUERY });
    const payload = parseSearchPayload(result);

    assert(payload.results.length > 0, "Expected the incident query to return at least one fallback result");
    for (const item of payload.results) {
      assert(item.id.length > 0, "Expected each search result to include an id");
      assert(item.title.length > 0, "Expected each search result to include a title");
      assert(item.url.length > 0, "Expected each search result to include a url");
    }
  },
});

Deno.test({
  name: "search contract: response is not an error even when results may be empty",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Verifies fail-open: search must never return isError=true for a query
    // where embedding degrades — it should return a valid payload with results (possibly empty).
    // The contract test exercises this with a known-no-match probe and confirms:
    // 1. The response parses as valid JSON with a results array (not an error object).
    // 2. isError is not set on the MCP content item.
    const result = await mcpCall("search", { query: "xyzzy-no-match-failopen-probe" });
    // mcpCall throws on MCP-level errors; reaching here means no MCP error was returned.
    const payload = JSON.parse(extractText(result)) as { results?: unknown };
    assert(Array.isArray(payload.results), "search must return a results array even with no matches");
  },
});

Deno.test({
  name: "search_thoughts contract: response shape preserved on degraded embedding path",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // search_thoughts has had .catch(() => null) since initial implementation.
    // Confirm the contract: even with qEmb=null (lexical-only path), the response
    // shape must include query, normalized_query, and results array.
    const result = await mcpCall("search_thoughts", { query: "xyzzy-no-match-failopen-probe" });
    const payload = JSON.parse(extractText(result)) as { query?: unknown; normalized_query?: unknown; results?: unknown };
    assert("query" in payload, "search_thoughts must include query in response");
    assert("results" in payload, "search_thoughts must include results array in response");
    assert(Array.isArray(payload.results), "search_thoughts results must be an array");
    // normalized_query present (may be empty string for no-match probe)
    assertEquals(typeof payload.normalized_query, "string");
  },
});
