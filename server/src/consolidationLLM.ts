/**
 * consolidationLLM.ts — ST-008
 *
 * Calls OpenRouter to produce a normalised wiki summary from a raw shard.
 * Throws on any failure — the caller (consolidationWorker) owns the
 * llm_error / retry_after handling.
 *
 * Test stub: if shardContent starts with "__TEST_LLM_FAIL__" the function
 * throws immediately (no network call). Allows integration tests to exercise
 * the fail-hard path without an invalid API key.
 */

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

const NORMALISE_SYSTEM_PROMPT =
  "You are normalising an episodic memory shard into a durable semantic fact for a personal knowledge base. " +
  "Return a JSON object with exactly one key:\n" +
  '- "normalised_content": a single string, at most 600 characters, written as a self-contained factual statement.\n\n' +
  "Rules:\n" +
  "- Strip first-person narrative (\"I noticed that...\", \"today I learned...\") and rewrite as a third-person factual statement.\n" +
  "- Preserve all proper nouns, identifiers, version numbers, file paths, and code symbols verbatim.\n" +
  "- Do not add information not present in the input.\n" +
  "- If the input is already a clean factual statement, return it unchanged.\n" +
  '- Output must be valid JSON; the "normalised_content" value must not contain unescaped quotes or newlines.';

export async function normaliseContent(shardContent: string): Promise<string> {
  // Test stub: caller inserts content with this prefix to exercise the fail-hard path.
  if (shardContent.startsWith("__TEST_LLM_FAIL__")) {
    throw new Error("LLM failure simulated by __TEST_LLM_FAIL__ content prefix");
  }

  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const truncated = shardContent.slice(0, 16_000);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NORMALISE_SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  let parsed: { normalised_content?: string };
  try {
    parsed = JSON.parse(text) as { normalised_content?: string };
  } catch {
    throw new Error(`LLM returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (typeof parsed.normalised_content !== "string" || parsed.normalised_content.length === 0) {
    throw new Error(`LLM returned invalid normalised_content: ${text.slice(0, 200)}`);
  }

  return parsed.normalised_content;
}
