import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

Deno.test("search-strict-flag: strict:true returns only in-project rows", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting", context: "project:zoom,strict:true", limit: 10 });
  const text = extractText(result);
  // Assert no row with a non-zoom project label appears (we look for "/ <non-zoom>" markers)
  // The output format is `--- Result N (rrf: …) [shard / <project>] ---`
  const projectLabels = [...text.matchAll(/\[\w+ \/ ([^\]]+)\]/g)].map((m) => m[1].trim());
  const nonZoom = projectLabels.filter((p) => p !== "zoom");
  if (nonZoom.length > 0) {
    throw new Error(`Expected all results with project = zoom under strict:true; found non-zoom: ${nonZoom.join(", ")}`);
  }
});
