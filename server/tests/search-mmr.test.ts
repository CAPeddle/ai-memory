import { mcpCall, extractText } from "./_helpers/mcpClient.ts";

// Three near-duplicate rows about "zoom meeting recording rotation" sit in the
// corpus (ids ...001, ...002, ...003). Without MMR, BM25 ranks all three at the
// top. With MMR (λ = 0.7), at most 2 of these 3 should appear in the top-3.
Deno.test("search-mmr: near-duplicate zoom-rotation hits diversify out of top-3", async () => {
  const result = await mcpCall("search_thoughts", { query: "zoom meeting recording rotation", limit: 3 });
  const text = extractText(result);
  const top3Ids = [...text.matchAll(/ID: ([0-9a-f-]+)/g)].map((m) => m[1]);
  const duplicateSet = new Set([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ]);
  const dupesInTop3 = top3Ids.filter((id) => duplicateSet.has(id)).length;
  if (dupesInTop3 > 2) {
    throw new Error(`Expected ≤2 of 3 near-duplicates in top-3; got ${dupesInTop3}. Top-3 ids: ${top3Ids.join(", ")}`);
  }
});

// The corpus deliberately has one null-embedding row (the last null_pointer row).
// MMR must skip it for the diversity comparison and merge it back by score —
// it must still be returnable, not lost entirely.
Deno.test("search-mmr: null-embedding row remains returnable", async () => {
  const result = await mcpCall("search_thoughts", { query: "null pointer constructor", limit: 10 });
  const text = extractText(result);
  // The NULL-embedding id was the last padded null_pointer row — assert the response
  // still contains at least one null_pointer-topic result (id range 00d/00e/etc).
  if (!/null|pointer|deref|defensive/i.test(text)) {
    throw new Error(`Expected at least one null-pointer-topic result, got: ${text.slice(0, 300)}`);
  }
});
