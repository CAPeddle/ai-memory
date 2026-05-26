import { mcpCall, extractText } from "./_helpers/mcpClient.ts";
import { sql } from "../src/db.ts";

// Search-quality assertions depend on a known corpus. Other test files (entity-worker,
// entity-mentions) create thoughts during the same test run that can displace expected
// corpus rows from top-N results. Filter to corpus-only before search assertions.
await sql`DELETE FROM thoughts WHERE id::text NOT LIKE '00000000-0000-4000-8000-%'`;

// With context: "project:zoom" (no strict), cross-project results MUST still
// appear, but in-project results should outrank otherwise-comparable cross-project ones.
Deno.test("search-project-boost: cross-project results present by default", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom export integration", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  // The corpus has cross-project rows ("bcf-managers / zoom") for this query.
  // Assert at least one non-zoom project label appears.
  if (!/\/ bcf-managers/.test(text)) {
    throw new Error(`Expected at least one bcf-managers cross-project result, got: ${text.slice(0, 400)}`);
  }
});

// PO-confirmed 2026-05-19: unscoped general-knowledge thoughts (project = NULL —
// e.g. captured by ChatGPT/Cursor/Gemini without a project context) MUST remain
// visible in a project-scoped non-strict search. They are ranked by raw RRF (no boost),
// but must not be filtered out.
Deno.test("search-project-boost: NULL-project rows surface in project-scoped non-strict search", async () => {
  const result = await mcpCall("search_thoughts", { query: "typescript narrow union types", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  // Corpus row ...009 is "TypeScript narrows union types via discriminants" with project = NULL.
  if (!ids.includes("00000000-0000-4000-8000-000000000009")) {
    throw new Error(`Expected NULL-project row ...009 to appear in project:zoom non-strict result; got: ${ids.join(", ")}`);
  }
  // Also assert the output format does NOT show a "/ <project>" suffix for that result
  // (NULL projects render with no slash — see existing format string in index.ts).
  const lineRe = /--- Result \d+ \(rrf: [^)]+\) \[(\w+)([^\]]*)\] ---\nID: 00000000-0000-4000-8000-000000000009/;
  const m = text.match(lineRe);
  if (m && m[2].trim().length > 0) {
    throw new Error(`Expected row ...009 to render with NULL project (no '/ project' suffix); got '[${m[1]}${m[2]}]'`);
  }
});

Deno.test("search-project-boost: in-project outranks cross-project for the same query", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting", context: "project:zoom", limit: 10 });
  const text = extractText(result);
  const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  // Find the first zoom-project (...001..004) and first bcf-managers (...005..006)
  const zoomIds = new Set([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
  ]);
  const bcfIds = new Set([
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
  ]);
  const firstZoom = ids.findIndex((id) => zoomIds.has(id));
  const firstBcf  = ids.findIndex((id) => bcfIds.has(id));
  if (firstZoom === -1 || firstBcf === -1) {
    throw new Error(`Expected both zoom and bcf-managers rows in result. ids: ${ids.join(", ")}`);
  }
  if (firstZoom > firstBcf) {
    throw new Error(`Expected first zoom (idx ${firstZoom}) to outrank first bcf (idx ${firstBcf}); ids: ${ids.join(", ")}`);
  }
});
