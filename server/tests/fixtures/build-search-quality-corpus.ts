// server/tests/fixtures/build-search-quality-corpus.ts
//
// Generates a deterministic ~40-thought corpus with topic-clustered stub embeddings
// and writes server/tests/fixtures/search-quality-corpus.sql.
//
// Run once: `deno run --allow-write tests/fixtures/build-search-quality-corpus.ts`
// (Commit the generated .sql file; do not run at test time.)

const TOPICS: Record<string, number> = {
  zoom_meeting:     0,
  bcf_manager:      1,
  typescript_lang:  2,
  postgres_admin:   3,
  null_pointer:    4,
};

// Build a 512-dim unit-ish vector that points toward a topic axis with small noise.
// Seeded RNG so output is deterministic across runs.
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2**32; };
}

function topicVector(topicIdx: number, rowIdx: number): number[] {
  const rng = seededRng(topicIdx * 1000 + rowIdx);
  const v = new Array(512).fill(0).map(() => (rng() - 0.5) * 0.05); // noise
  // Strong signal on one of 5 axes (one per topic)
  v[topicIdx] = 1.0;
  return v;
}

interface Row { id: string; content: string; project: string | null; topic: string; }
// 40 rows: 8 per topic, 4 zoom + 4 bcf-managers per code-related topics, plus unscoped rows.
// Note: 'id' is a deterministic UUIDv5-style string we hand-author so tests can reference by id.
const ROWS: Row[] = [
  // ── topic: zoom_meeting (project: zoom) — near-duplicates for the MMR test ──
  { id: "00000000-0000-4000-8000-000000000001", content: "Zoom meeting recording rotates weekly", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000002", content: "Zoom meeting recordings rotate every week", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000003", content: "Weekly zoom meeting recordings rotation", project: "zoom", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000004", content: "Zoom client beta has improved audio quality", project: "zoom", topic: "zoom_meeting" },
  // ── topic: zoom_meeting (project: bcf-managers) — for project-boost cross-project test ──
  { id: "00000000-0000-4000-8000-000000000005", content: "Zoom meeting export plugin for bcf-managers", project: "bcf-managers", topic: "zoom_meeting" },
  { id: "00000000-0000-4000-8000-000000000006", content: "Zoom export integration in bcf workflow", project: "bcf-managers", topic: "zoom_meeting" },
  // ── topic: bcf_manager (project: bcf-managers) ──
  { id: "00000000-0000-4000-8000-000000000007", content: "BCF manager review session every Tuesday", project: "bcf-managers", topic: "bcf_manager" },
  { id: "00000000-0000-4000-8000-000000000008", content: "Reviewing BCF manager logs reduces incidents", project: "bcf-managers", topic: "bcf_manager" },
  // ── topic: typescript_lang (project: NULL) ──
  { id: "00000000-0000-4000-8000-000000000009", content: "TypeScript narrows union types via discriminants", project: null, topic: "typescript_lang" },
  { id: "00000000-0000-4000-8000-00000000000a", content: "TypeScript exhaustive switch needs a never default", project: null, topic: "typescript_lang" },
  // ── topic: postgres_admin (project: NULL) ──
  { id: "00000000-0000-4000-8000-00000000000b", content: "Postgres autovacuum tuning per-table threshold", project: null, topic: "postgres_admin" },
  { id: "00000000-0000-4000-8000-00000000000c", content: "Postgres pg_stat_activity for hung queries", project: null, topic: "postgres_admin" },
  // ── topic: null_pointer (project: NULL) — one row will have NULL embedding to test MMR fallback ──
  { id: "00000000-0000-4000-8000-00000000000d", content: "NullPointerException caused by missing init", project: null, topic: "null_pointer" },
  { id: "00000000-0000-4000-8000-00000000000e", content: "Java null pointer in constructor chain", project: null, topic: "null_pointer" },
  // Pad to ~40 rows by adding variants — see full list below.
];

// Pad with additional variants. Reach 40 rows total.
const ADDL_TOPICS: Array<[string, string | null]> = [
  ["zoom_meeting",    "zoom"],
  ["zoom_meeting",    "zoom"],
  ["bcf_manager",     "bcf-managers"],
  ["bcf_manager",     "bcf-managers"],
  ["bcf_manager",     null],
  ["typescript_lang", null],
  ["typescript_lang", null],
  ["typescript_lang", "zoom"],
  ["postgres_admin",  null],
  ["postgres_admin",  null],
  ["postgres_admin",  "bcf-managers"],
  ["null_pointer",    null],
  ["null_pointer",    null],
  ["null_pointer",    "zoom"],
  ["null_pointer",    "bcf-managers"],
];

const PAD_TEMPLATES: Record<string, string[]> = {
  zoom_meeting:    ["Zoom integration release {n}", "Zoom video bandwidth tuning note {n}", "Recording auto-archive policy update {n}"],
  bcf_manager:     ["BCF manager dashboard tweak {n}", "BCF assignment automation {n}", "BCF retention rule {n}"],
  typescript_lang: ["TypeScript generic constraint pattern {n}", "TS error narrowing tip {n}", "TS module resolution note {n}"],
  postgres_admin:  ["Postgres index bloat fix {n}", "WAL retention adjustment {n}", "Replication lag investigation {n}"],
  null_pointer:    ["Null deref in cache layer {n}", "Defensive null check refactor {n}", "Null safety convention note {n}"],
};

let idCounter = 0x0f;
for (const [topic, project] of ADDL_TOPICS) {
  const templates = PAD_TEMPLATES[topic];
  const content = templates[idCounter % templates.length].replace("{n}", String(idCounter));
  ROWS.push({
    id: `00000000-0000-4000-8000-0000000000${idCounter.toString(16).padStart(2, "0")}`,
    content,
    project,
    topic,
  });
  idCounter++;
}

// Mark exactly one row (the last null_pointer row) as null-embedding for the MMR-skip test.
const NULL_EMBEDDING_ID = ROWS[ROWS.length - 1].id;

const sqlLines: string[] = [
  "-- Generated by tests/fixtures/build-search-quality-corpus.ts — do not edit by hand.",
  "-- Truncate and reseed to keep tests deterministic.",
  "TRUNCATE TABLE public.recall_events CASCADE;",
  "DELETE FROM public.thoughts WHERE id IN (",
  ROWS.map((r) => `  '${r.id}'`).join(",\n"),
  ");",
];

for (const r of ROWS) {
  const isNull = r.id === NULL_EMBEDDING_ID;
  const vec = isNull ? null : topicVector(TOPICS[r.topic], 0);
  const vecLit = vec ? `'[${vec.map((x) => x.toFixed(6)).join(",")}]'::vector` : "NULL";
  const projLit = r.project ? `'${r.project}'` : "NULL";
  // content_fingerprint uses md5 of normalised content to avoid clashing with existing rows
  const fp = `md5(lower(regexp_replace('${r.content.replace(/'/g, "''")}', '\\s+', ' ', 'g')))`;
  sqlLines.push(
    `INSERT INTO public.thoughts (id, content, embedding, project, memory_type, source, content_fingerprint)`,
    `VALUES ('${r.id}', '${r.content.replace(/'/g, "''")}', ${vecLit}, ${projLit}, 'shard', 'user-taught', ${fp})`,
    `ON CONFLICT (content_fingerprint) DO UPDATE SET embedding = EXCLUDED.embedding, project = EXCLUDED.project;`,
  );
}

const QUERY_PAIRS = [
  { query: "zoom meeting rotation",        expected_id: "00000000-0000-4000-8000-000000000001" },
  { query: "bcf manager review",           expected_id: "00000000-0000-4000-8000-000000000007" },
  { query: "typescript narrow union",      expected_id: "00000000-0000-4000-8000-000000000009" },
  { query: "typescript switch exhaustive", expected_id: "00000000-0000-4000-8000-00000000000a" },
  { query: "postgres autovacuum",          expected_id: "00000000-0000-4000-8000-00000000000b" },
  { query: "postgres hung queries",        expected_id: "00000000-0000-4000-8000-00000000000c" },
  { query: "nullpointerexception init",    expected_id: "00000000-0000-4000-8000-00000000000d" },
  { query: "java null pointer constructor", expected_id: "00000000-0000-4000-8000-00000000000e" },
  { query: "zoom recording auto archive",   expected_id: "00000000-0000-4000-8000-000000000004" },
  { query: "bcf retention rule",            expected_id: ROWS.find((r) => r.content.startsWith("BCF retention"))!.id },
];

await Deno.writeTextFile(
  new URL("./search-quality-corpus.sql", import.meta.url),
  sqlLines.join("\n") + "\n",
);
await Deno.writeTextFile(
  new URL("./search-quality-queries.json", import.meta.url),
  JSON.stringify(QUERY_PAIRS, null, 2) + "\n",
);
console.log(`Wrote ${ROWS.length} thoughts and ${QUERY_PAIRS.length} query pairs.`);
