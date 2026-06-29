import { extractText, mcpCall } from "./_helpers/mcpClient.ts";

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
    context: "project:zoom,tags:developer;contact",
  });
  const r = result as { result?: { content?: Array<{ type?: string; text?: string; isError?: boolean }> } };
  const text = r.result?.content?.[0]?.text ?? "";
  if (text.includes("Context validation error")) {
    throw new Error(`Valid context should not produce validation error, got: ${text.slice(0, 200)}`);
  }
  if (text.startsWith("Error:")) {
    throw new Error(`Expected successful response for valid context, got: ${text.slice(0, 200)}`);
  }
});

Deno.test("capture_thought rejects profile context", async () => {
  const result = await mcpCall("capture_thought", {
    content: "test content for rejected profile context",
    context: "profile:professional",
  });
  const text = extractText(result);
  if (!text.includes("Context validation error")) {
    throw new Error(`Expected context validation error, got: ${text.slice(0, 200)}`);
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
