// Shared OpenRouter embedding client. Side-effect-free so workers and the
// server can both import it (index.ts has top-level Deno.serve + worker starts;
// importing FROM index.ts would boot the server and create a circular import).

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** The exact model id sent to OpenRouter. Recorded per-thought as embedding_model (AC-17). */
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** 512-dim embedding via text-embedding-3-small truncation. Throws on non-2xx. */
export async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: 512,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}
