import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import { mcpCall } from "./_helpers/mcpClient.ts";
import { extractThoughtId } from "./_helpers/thoughts.ts";

interface ToolCallResult {
  content?: Array<{ text?: string }>;
  isError?: boolean;
}

interface ToolCallResponse {
  result?: ToolCallResult;
}

function responseText(response: ToolCallResponse): string {
  return response.result?.content?.[0]?.text ?? "";
}

function responseIsError(response: ToolCallResponse): boolean | undefined {
  return response.result?.isError;
}

async function cleanupCapturedThought(response: ToolCallResponse): Promise<void> {
  if (responseIsError(response)) return;
  const id = extractThoughtId(responseText(response));
  if (!id) return;
  await sql`DELETE FROM thoughts WHERE id = ${id}::uuid`;
}

Deno.test({
  name: "capture_thought rejects content exceeding 32KB",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const bigContent = "x".repeat(64 * 1024); // 64 KB
    const result = await mcpCall("capture_thought", {
      content: bigContent,
      memory_type: "shard",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("32KB"), true, "Error message should mention 32KB limit");

    const rows = await sql<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM thoughts WHERE content = ${bigContent}
    `;
    assertEquals(rows[0]?.cnt ?? 0, 0, "Oversized content must be rejected before INSERT");
  },
});

Deno.test({
  name: "capture_thought accepts content at exactly 32768 bytes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const boundaryContent = "a".repeat(32_768);
    const result = await mcpCall("capture_thought", {
      content: boundaryContent,
      memory_type: "shard",
    }) as ToolCallResponse;

    try {
      assertEquals(responseIsError(result), undefined);
      assertEquals(
        responseText(result).includes("Captured as"),
        true,
        "Content at exactly 32768 bytes should be accepted",
      );
    } finally {
      await cleanupCapturedThought(result);
    }
  },
});

Deno.test({
  name: "capture_thought rejects content at 32769 bytes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const overByOne = "a".repeat(32_769);
    const result = await mcpCall("capture_thought", {
      content: overByOne,
      memory_type: "shard",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("32KB"), true, "Error message should mention 32KB limit");
  },
});

Deno.test({
  name: "capture_thought accepts multibyte UTF-8 content at exactly 32768 bytes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const emoji = "😀";
    const exactBytes = emoji.repeat(8_192); // 8192 * 4 UTF-8 bytes = 32768
    const result = await mcpCall("capture_thought", {
      content: exactBytes,
      memory_type: "shard",
    }) as ToolCallResponse;

    try {
      assertEquals(responseIsError(result), undefined);
      assertEquals(responseText(result).includes("Captured as"), true);
    } finally {
      await cleanupCapturedThought(result);
    }
  },
});

Deno.test({
  name: "capture_thought rejects multibyte UTF-8 content over 32768 bytes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const emoji = "😀";
    const overLimitBytes = emoji.repeat(8_193); // 8193 * 4 UTF-8 bytes = 32772
    const result = await mcpCall("capture_thought", {
      content: overLimitBytes,
      memory_type: "shard",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("32KB"), true, "Error message should mention 32KB limit");
  },
});

Deno.test({
  name: "capture_thought accepts content under 32KB",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const okContent = "This is a normal-sized thought for testing size limits.";
    const result = await mcpCall("capture_thought", {
      content: okContent,
      memory_type: "shard",
    }) as ToolCallResponse;

    try {
      assertEquals(responseIsError(result), undefined);
      assertEquals(responseText(result).includes("Captured as"), true);
    } finally {
      await cleanupCapturedThought(result);
    }
  },
});
