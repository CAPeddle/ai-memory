// Reusable recall@k helper for the search-quality eval harness (ST-046; reused by ST-054).
import { extractText, mcpCall } from "./mcpClient.ts";

const ID_RE = /ID:\s*([0-9a-f-]{36})/gi;

/** Extract thought ids (in result order) from a search_thoughts text response. */
export function parseIds(text: string): string[] {
  try {
    const payload = JSON.parse(text) as { results?: Array<{ id?: string }> };
    if (Array.isArray(payload.results)) {
      return payload.results
        .map((result) => result.id ?? "")
        .filter((id) => id.length > 0);
    }
  } catch {
    // Keep the legacy parser path for tests not yet migrated.
  }

  return [...text.matchAll(ID_RE)].map((m) => m[1]);
}

/** Run search_thoughts and return the returned thought ids in rank order. */
export async function searchThoughtIds(
  query: string,
  limit: number,
  context?: string,
): Promise<string[]> {
  const args: Record<string, unknown> = { query, limit };
  if (context) args.context = context;
  const result = await mcpCall("search_thoughts", args);
  return parseIds(extractText(result));
}

/** recall@k = |relevant ∩ top-k| / |relevant|. Empty relevant set ⇒ 0. */
export function recallAtK(
  returnedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0) return 0;
  const topK = new Set(returnedIds.slice(0, k));
  const hit = relevantIds.filter((id) => topK.has(id)).length;
  return hit / relevantIds.length;
}