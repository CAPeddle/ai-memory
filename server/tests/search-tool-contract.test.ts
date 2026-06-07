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
  name: "search contract: returns JSON text with a results array",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("search", { query: "definitely-no-match-contract-probe" });
    const payload = parseSearchPayload(result);

    assertEquals(payload.results, []);
  },
});

Deno.test({
  name: "search contract: incident query currently falls below the legacy floor",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("search", { query: INCIDENT_QUERY });
    const payload = parseSearchPayload(result);

    assertEquals(payload.results.length, 0);
  },
});