import { AgentRuntimeError } from "../../runtime/agent.ts";
import { AnthropicStructuredRuntime } from "../../runtime/providers/anthropic.ts";

const request = {
  systemPrompt: "Return structured data.",
  userPrompt: "Extract contact facts.",
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  },
  toolName: "emit_contact_extraction",
};

Deno.test("AnthropicStructuredRuntime returns forced tool-use input", async () => {
  const runtime = new AnthropicStructuredRuntime({
    apiKey: "test-key",
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.tool_choice?.name !== request.toolName) {
        throw new Error("Expected forced tool choice");
      }
      return jsonResponse({
        content: [
          { type: "text", text: "ignored" },
          { type: "tool_use", name: request.toolName, input: { ok: true } },
        ],
      });
    },
  });

  const result = await runtime.generateStructured(request);
  if (JSON.stringify(result) !== JSON.stringify({ ok: true })) {
    throw new Error(`Unexpected structured result: ${JSON.stringify(result)}`);
  }
});

Deno.test("AnthropicStructuredRuntime requires API key before network call", async () => {
  let called = false;
  const runtime = new AnthropicStructuredRuntime({
    apiKey: "",
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch,
  });

  const error = await captureError(() => runtime.generateStructured(request));
  if (!(error instanceof AgentRuntimeError)) {
    throw new Error("Expected runtime error");
  }
  if (error.category !== "provider_config") {
    throw new Error(`Unexpected category: ${error.category}`);
  }
  if (called) throw new Error("Expected config failure before network call");
});

Deno.test("AnthropicStructuredRuntime reports missing tool-use payload", async () => {
  const runtime = new AnthropicStructuredRuntime({
    apiKey: "test-key",
    fetchImpl: async () => jsonResponse({ content: [{ type: "text" }] }),
  });

  const error = await captureError(() => runtime.generateStructured(request));
  if (!(error instanceof AgentRuntimeError)) {
    throw new Error("Expected runtime error");
  }
  if (error.category !== "structured_output") {
    throw new Error(`Unexpected category: ${error.category}`);
  }
});

Deno.test("AnthropicStructuredRuntime redacts provider failure body", async () => {
  const leaked = "secret transcript body should not leak";
  const runtime = new AnthropicStructuredRuntime({
    apiKey: "test-key",
    fetchImpl: async () => new Response(leaked, { status: 500 }),
  });

  const error = await captureError(() => runtime.generateStructured(request));
  if (!(error instanceof AgentRuntimeError)) {
    throw new Error("Expected runtime error");
  }
  if (error.category !== "provider_request") {
    throw new Error(`Unexpected category: ${error.category}`);
  }
  if (String(error.message).includes(leaked)) {
    throw new Error("Provider body leaked into error message");
  }
});

Deno.test("runtime boundary keeps Anthropic symbols out of consumers", async () => {
  const staticImportPattern = /^\s*import\b.*anthropic\.ts/m;

  // agent.ts and extractor.ts must carry zero Anthropic coupling, static or
  // dynamic -- they define/consume the generic AgentRuntime interface only.
  for (const file of ["runtime/agent.ts", "parser/extractor.ts"]) {
    const text = await readOptional(`./${file}`);
    if (text.includes("AnthropicStructuredRuntime") || staticImportPattern.test(text)) {
      throw new Error(`${file} imports Anthropic provider symbols`);
    }
  }

  // cli/index.ts is the one place allowed to wire a concrete provider (it is
  // the composition root), but only via a deferred dynamic import -- a static
  // import would recreate the same compile-time coupling this test guards
  // against for the other consumers.
  const cliText = await readOptional("./cli/index.ts");
  if (staticImportPattern.test(cliText)) {
    throw new Error("cli/index.ts statically imports the Anthropic provider");
  }
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected action to fail");
}

async function readOptional(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return "";
    throw error;
  }
}
