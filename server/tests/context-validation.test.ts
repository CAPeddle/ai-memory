import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mcpCall } from "./_helpers/mcpClient.ts";

Deno.test("search_thoughts rejects malformed context", async () => {
  const result = await mcpCall("search_thoughts", {
    query: "test",
    context: "garbage!!!",
  });
  const r = result as { result?: { content?: Array<{ type?: string; text?: string }> } };
  const text = r.result?.content?.[0]?.text ?? "";
  if (!text.includes("Context validation error")) {
    throw new Error(`Expected "Context validation error" in response, got: ${text.slice(0, 200)}`);
  }
});

Deno.test("search_thoughts accepts valid context", async () => {
  const result = await mcpCall("search_thoughts", {
    query: "test",
    context: "project:zoom,profile:professional",
  });
  const r = result as { result?: { content?: Array<{ type?: string; text?: string; isError?: boolean }> } };
  const isError = r.result?.content?.[0]?.text?.startsWith("Error:") ?? false;
  if (isError) {
    throw new Error(`Expected no error for valid context, got: ${r.result?.content?.[0]?.text?.slice(0, 200)}`);
  }
});

Deno.test("capture_thought rejects malformed context", async () => {
  const result = await mcpCall("capture_thought", {
    content: "test content for context validation",
    context: "garbage:value",
  });
  const r = result as { result?: { content?: Array<{ type?: string; text?: string }> } };
  const text = r.result?.content?.[0]?.text ?? "";
  if (!text.includes("Context validation error")) {
    throw new Error(`Expected "Context validation error" in response, got: ${text.slice(0, 200)}`);
  }
});

Deno.test("list_thoughts rejects malformed context", async () => {
  const result = await mcpCall("list_thoughts", {
    context: "randomstring",
  });
  const r = result as { result?: { content?: Array<{ type?: string; text?: string }> } };
  const text = r.result?.content?.[0]?.text ?? "";
  if (!text.includes("Context validation error")) {
    throw new Error(`Expected "Context validation error" in response, got: ${text.slice(0, 200)}`);
  }
});