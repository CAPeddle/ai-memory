import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "npm:@modelcontextprotocol/sdk@1.24.3/client/index.js";
import { StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/sdk@1.24.3/client/streamableHttp.js";

import { API_KEY, MCP_BASE, extractText, mcpCall, mcpRequest } from "./_helpers/mcpClient.ts";

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

function errorCode(response: unknown): number | undefined {
  return (response as { error?: { code?: number } }).error?.code;
}

function resultOf<T>(response: unknown): T {
  const result = (response as JsonRpcResponse).result;
  assertExists(result);
  return result as T;
}

Deno.test("initialize advertises tools prompts and resources", async () => {
  const response = await mcpRequest("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "st-057-test", version: "0.1" },
  });

  const result = resultOf<{ capabilities?: { tools?: unknown; prompts?: unknown; resources?: unknown } }>(response);
  assertExists(result.capabilities?.tools);
  assertExists(result.capabilities?.prompts);
  assertExists(result.capabilities?.resources);
});

Deno.test("prompts/list and prompts/get are compatible", async () => {
  const listResponse = await mcpRequest("prompts/list");
  assertNotEquals(errorCode(listResponse), -32601);

  const listResult = resultOf<{ prompts?: Array<{ name?: string }> }>(listResponse);
  const promptNames = listResult.prompts?.map((prompt) => prompt.name ?? "") ?? [];
  assertArrayIncludes(promptNames, ["memory_search_guidance"]);

  const getResponse = await mcpRequest("prompts/get", { name: "memory_search_guidance" });
  const getResult = resultOf<{ messages?: Array<{ content?: { text?: string } }> }>(getResponse);
  const messageText = getResult.messages?.map((message) => message.content?.text ?? "").join("\n") ?? "";
  assertStringIncludes(messageText, "search_thoughts");

  const missingResponse = await mcpRequest("prompts/get", { name: "does_not_exist" }) as JsonRpcResponse;
  assertExists(missingResponse.error);
  assertNotEquals(missingResponse.error.code, -32601);
});

Deno.test("resources/list templates and read are compatible", async () => {
  const listResponse = await mcpRequest("resources/list");
  assertNotEquals(errorCode(listResponse), -32601);

  const listResult = resultOf<{ resources?: Array<{ uri?: string }> }>(listResponse);
  assert(listResult.resources?.some((resource) => resource.uri === "ai-memory://server-info"));

  const templatesResponse = await mcpRequest("resources/templates/list");
  assertNotEquals(errorCode(templatesResponse), -32601);
  const templatesResult = resultOf<{ resourceTemplates?: unknown[] }>(templatesResponse);
  assert(Array.isArray(templatesResult.resourceTemplates));

  const readResponse = await mcpRequest("resources/read", { uri: "ai-memory://server-info" });
  const readResult = resultOf<{ contents?: Array<{ mimeType?: string; text?: string }> }>(readResponse);
  const content = readResult.contents?.[0];
  assertEquals(content?.mimeType, "application/json");
  const rawText = content?.text ?? "";
  const parsedJson = JSON.parse(rawText) as { name?: string; promptNames?: string[] };
  assertEquals(parsedJson.name, "ai-memory");
  assertArrayIncludes(parsedJson.promptNames ?? [], ["memory_search_guidance"]);
  assertEquals(Object.keys(parsedJson).sort(), [
    "name",
    "promptNames",
    "protocolSurfaces",
    "resourceUris",
    "toolNames",
    "version",
  ]);
  for (const forbidden of [
    "MEMORY_API_KEY",
    "OPENROUTER_API_KEY",
    "DB_PASSWORD",
    "DATABASE_URL",
    "localhost",
    ".local",
    "OPENROUTER",
  ]) {
    assert(!rawText.includes(forbidden), `server-info must not include ${forbidden}`);
  }

  const missingResponse = await mcpRequest("resources/read", { uri: "ai-memory://missing" }) as JsonRpcResponse;
  assertExists(missingResponse.error);
  assertNotEquals(missingResponse.error.code, -32601);
});

Deno.test("ping and existing tools remain compatible", async () => {
  const pingResponse = await mcpRequest("ping") as JsonRpcResponse;
  assertEquals(pingResponse.error, undefined);

  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: Array<{ name?: string }> }>(toolsResponse);
  const toolNames = toolsResult.tools?.map((tool) => tool.name ?? "") ?? [];
  assertArrayIncludes(toolNames, ["thought_stats", "search_thoughts"]);

  const statsResponse = await mcpCall("thought_stats", {});
  assertStringIncludes(extractText(statsResponse), "Total active thoughts:");
});

Deno.test("SDK client can list prompts/resources and ping", async () => {
  const client = new Client({ name: "st-057-sdk-client-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${MCP_BASE}/mcp`), {
    requestInit: {
      headers: { Authorization: `Bearer ${API_KEY}` },
    },
  });

  try {
    await client.connect(transport);
    await client.ping();

    const prompts = await client.listPrompts();
    assert(prompts.prompts.some((p) => p.name === "memory_search_guidance"));

    const resources = await client.listResources();
    assert(resources.resources.some((r) => r.uri === "ai-memory://server-info"));
  } finally {
    await client.close();
  }
});