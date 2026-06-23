// Shared thought-related test helpers (ST-029).
// Reusable across test files to avoid duplicating extractThoughtId/captureThought/cleanupThought.
import { extractText, mcpCall } from "./mcpClient.ts";
import { sql } from "../../src/db.ts";

export function extractThoughtId(text: string): string | null {
  const match = text.match(/id:\s*([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export async function captureThought(content: string, memoryType = "shard"): Promise<string> {
  const result = await mcpCall("capture_thought", { content, memory_type: memoryType });
  const text = extractText(result);
  const id = extractThoughtId(text);
  if (!id) throw new Error(`Failed to capture thought: ${text.slice(0, 300)}`);
  return id;
}

export async function cleanupThought(id: string): Promise<void> {
  await sql`DELETE FROM feedback_events WHERE thought_id = ${id}::uuid`;
  await sql`DELETE FROM recall_events WHERE thought_id = ${id}::uuid`;
  await sql`DELETE FROM consolidation_queue WHERE thought_id = ${id}::uuid`;
  await sql`DELETE FROM consolidation_log WHERE thought_id = ${id}::uuid OR wiki_id = ${id}::uuid`;
  await sql`DELETE FROM entity_mentions WHERE thought_id = ${id}::uuid`;
  await sql`DELETE FROM entity_extraction_queue WHERE thought_id = ${id}::uuid`;
  await sql`DELETE FROM thoughts WHERE id = ${id}::uuid`;
}
