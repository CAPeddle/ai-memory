import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sql } from "../src/db.ts";
import { runBackfillSweep } from "../src/embeddingBackfill.ts";

// Deterministic 512-dim stub vector (matches the vector(512) column width).
const STUB_VECTOR = Array.from({ length: 512 }, () => 0.01);
const succeedEmbed = (_text: string) => Promise.resolve(STUB_VECTOR);
const failEmbed = (_text: string) => Promise.reject(new Error("stub embed failure"));

async function insertNeedyRow(opts: { attempts?: number } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO thoughts (id, content, content_fingerprint, source, memory_type, embedding_attempts)
    VALUES (${id}, ${"ST-039 test row " + id}, ${id}, 'user-taught', 'shard', ${opts.attempts ?? 0})
  `;
  return id; // needs_embedding defaults true, embedding NULL by default
}

async function readRow(id: string) {
  const [row] = await sql<{
    has_emb: boolean; needs_embedding: boolean; embedding_model: string | null;
    embedding_attempts: number; embedding_error: string | null;
  }[]>`
    SELECT (embedding IS NOT NULL) AS has_emb, needs_embedding, embedding_model,
           embedding_attempts, embedding_error
    FROM thoughts WHERE id = ${id}
  `;
  return row;
}

const cleanup = (id: string) => sql`DELETE FROM thoughts WHERE id = ${id}`;

// Deterministic alternate vector for simulating a concurrent writer.
const CONCURRENT_VECTOR = Array.from({ length: 512 }, () => 0.02);

Deno.test({
  name: "AC-2 recovery: NULL-embedding row is populated after a successful sweep",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow();
    try {
      await runBackfillSweep({ embed: succeedEmbed });
      const row = await readRow(id);
      assertEquals(row.has_emb, true, "embedding should be populated");
      assertEquals(row.needs_embedding, false, "needs_embedding should be cleared");
      assertEquals(row.embedding_error, null, "embedding_error should be cleared on success");
    } finally {
      await cleanup(id);
    }
  },
});

Deno.test({
  name: "AC-2 failure: a failing embed increments attempts and stays recoverable",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow();
    try {
      await runBackfillSweep({ embed: failEmbed });
      const row = await readRow(id);
      assertEquals(row.embedding_attempts, 1, "one failed attempt recorded");
      assertEquals(row.has_emb, false, "embedding still NULL");
      assertEquals(row.needs_embedding, true, "row remains selectable for a future sweep");
      assertEquals(row.embedding_error, "stub embed failure", "error message recorded");
    } finally {
      await cleanup(id);
    }
  },
});

Deno.test({
  name: "AC-2 cap: a row at MAX_ATTEMPTS is skipped by the sweep",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow({ attempts: 5 });
    try {
      await runBackfillSweep({ embed: failEmbed });
      const row = await readRow(id);
      assertEquals(row.embedding_attempts, 5, "capped row not processed (would be 6 if selected)");
      assertEquals(row.has_emb, false, "embedding still NULL");
    } finally {
      await cleanup(id);
    }
  },
});

Deno.test({
  name: "AC-17: successful backfill records embedding_model",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow();
    try {
      await runBackfillSweep({ embed: succeedEmbed });
      const row = await readRow(id);
      assertEquals(row.embedding_model, "openai/text-embedding-3-small");
    } finally {
      await cleanup(id);
    }
  },
});

Deno.test({
  name: "ST-039 regression: backfill success does not overwrite a concurrently-written embedding",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow();
    try {
      const embed = async (_text: string) => {
        // Simulate another worker successfully writing an embedding after the sweep SELECT
        // but before this sweep executes its success UPDATE.
        await sql`
          UPDATE thoughts
          SET embedding       = ${sql.unsafe(`'[${CONCURRENT_VECTOR.join(",")}]'`)}::vector,
              needs_embedding = false,
              embedding_model = ${"concurrent/test"},
              embedding_error = NULL
          WHERE id = ${id}
        `;
        return STUB_VECTOR;
      };

      await runBackfillSweep({ embed });
      const row = await readRow(id);
      assertEquals(row.has_emb, true, "embedding remains populated");
      assertEquals(row.needs_embedding, false, "concurrent writer cleared needs_embedding");
      assertEquals(row.embedding_model, "concurrent/test", "backfill must not overwrite embedding_model");
    } finally {
      await cleanup(id);
    }
  },
});

Deno.test({
  name: "ST-039 regression: backfill failure does not mark an already-succeeded row as failed",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const id = await insertNeedyRow();
    try {
      const embed = async (_text: string) => {
        // Simulate another worker successfully writing an embedding, then this sweep's
        // embed call failing (e.g., transient client error). The failure UPDATE must not
        // increment attempts or write an error once needs_embedding=false.
        await sql`
          UPDATE thoughts
          SET embedding       = ${sql.unsafe(`'[${CONCURRENT_VECTOR.join(",")}]'`)}::vector,
              needs_embedding = false,
              embedding_model = ${"concurrent/test2"},
              embedding_error = NULL
          WHERE id = ${id}
        `;
        throw new Error("stub embed failure after concurrent success");
      };

      await runBackfillSweep({ embed });
      const row = await readRow(id);
      assertEquals(row.has_emb, true, "embedding remains populated");
      assertEquals(row.needs_embedding, false, "row stays marked complete");
      assertEquals(row.embedding_attempts, 0, "attempts must not increment after concurrent success");
      assertEquals(row.embedding_error, null, "error must not be written after concurrent success");
      assertEquals(row.embedding_model, "concurrent/test2", "embedding_model must remain from concurrent writer");
    } finally {
      await cleanup(id);
    }
  },
});
