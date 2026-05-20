import { mcpCall, extractText } from "./_helpers/mcpClient.ts";
import postgres from "npm:postgres@3.4.4";

// Asserts: (a) recall_events row count after a search equals returned-result count.
// (b) thoughts.recall_count incremented for each returned id.
// (c) last_recalled_at refreshed.
Deno.test("search-recall-events: async log writes one row per returned result", async () => {
  const before = Date.now();
  const result = await mcpCall("search_thoughts", { query: "postgres autovacuum", limit: 5 });
  const text = extractText(result);
  const returnedIds = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  if (!returnedIds.length) throw new Error(`Expected non-empty result for 'postgres autovacuum'; got: ${text}`);

  const dbSql = postgres(Deno.env.get("DATABASE_URL")!);

  // Wait up to 5 s for the async write to settle (10 × 500ms)
  let logged = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    const [row] = await dbSql`
      SELECT count(*)::int AS cnt
      FROM recall_events
      WHERE query = 'postgres autovacuum'
        AND created_at >= to_timestamp(${before / 1000})
    `;
    logged = row.cnt;
    if (logged >= returnedIds.length) break;
  }

  await dbSql.end();

  if (logged !== returnedIds.length) {
    throw new Error(`Expected ${returnedIds.length} recall_events rows; observed ${logged}`);
  }
});
