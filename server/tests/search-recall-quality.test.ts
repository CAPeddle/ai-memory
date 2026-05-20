import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

const queries: Array<{ query: string; expected_id: string }> = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/search-quality-queries.json", import.meta.url)),
);

Deno.test("search-recall-quality: ≥8/10 expected ids in top-10", async () => {
  let passed = 0;
  const failures: string[] = [];
  for (const pair of queries) {
    const result = await mcpCall("search_thoughts", { query: pair.query, limit: 10 });
    const text = extractText(result);
    const ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
    if (ids.includes(pair.expected_id)) {
      passed++;
    } else {
      failures.push(`query='${pair.query}' expected=${pair.expected_id} got=[${ids.slice(0, 3).join(", ")}…]`);
    }
  }
  if (passed < 8) {
    throw new Error(`Recall < 80%: ${passed}/${queries.length}. Failures:\n  ${failures.join("\n  ")}`);
  }
});
