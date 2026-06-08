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