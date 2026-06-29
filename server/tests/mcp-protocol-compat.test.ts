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

const SERVER_SOURCE_PATH = new URL("../index.ts", import.meta.url).pathname;

async function getRegisteredToolNamesFromSource(): Promise<string[]> {
  const source = await Deno.readTextFile(SERVER_SOURCE_PATH);
  const stripped = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const matches = [...stripped.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g)];
  return matches.map((m) => m[1]);
}

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

interface ToolListItem {
  name?: string;
  title?: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, { description?: string }>;
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

function assertToolDescription(tool: ToolListItem): void {
  const name = tool.name ?? "<unnamed>";
  const description = tool.description ?? "";
  assert(description.trim().length > 0, `${name} must have a description`);

  const metadataSignals = [
    { label: "usage guidance", pattern: /\b(use when|when to use|use for)\b/i },
    { label: "parameter guidance", pattern: /\b(parameters?|inputs?|arguments?)\b/i },
    { label: "example usage", pattern: /\b(example|e\.g\.)\b/i },
    { label: "return expectations", pattern: /\b(returns?|response|outputs?)\b/i },
    { label: "errors or edge cases", pattern: /\b(errors?|edge cases?|validation|not found|no matches)\b/i },
  ];

  for (const signal of metadataSignals) {
    assert(signal.pattern.test(description), `${name} description must include ${signal.label}`);
  }

  const properties = tool.inputSchema?.properties ?? {};
  const propertyEntries = Object.entries(properties);
  if (!propertyEntries.length) {
    assert(/\b(no parameters|no arguments)\b|\bcall with \{\}/i.test(description), `${name} must explicitly document that it has no parameters`);
    return;
  }

  for (const [propertyName, propertySchema] of propertyEntries) {
    assert(new RegExp(`\\b${propertyName}\\b`).test(description), `${name} description must mention ${propertyName}`);
    assert((propertySchema.description ?? "").trim().length > 0, `${name}.${propertyName} must have a schema description`);
  }
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
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const toolNames = toolsResult.tools?.map((tool) => tool.name ?? "") ?? [];
  assertArrayIncludes(toolNames, ["thought_stats", "search_thoughts"]);

  const serverInfoResponse = await mcpRequest("resources/read", { uri: "ai-memory://server-info" });
  const serverInfoResult = resultOf<{ contents?: Array<{ text?: string }> }>(serverInfoResponse);
  const serverInfo = JSON.parse(serverInfoResult.contents?.[0]?.text ?? "{}") as { toolNames?: string[] };
  assertEquals([...toolNames].sort(), [...(serverInfo.toolNames ?? [])].sort(), "tools/list should match server-info toolNames");

  const sourceToolNames = await getRegisteredToolNamesFromSource();
  const sourceSet = new Set(sourceToolNames);
  for (const name of toolNames) {
    assert(sourceSet.has(name), `${name} from tools/list not found in server/index.ts registerTool calls`);
  }
  for (const name of sourceToolNames) {
    assert(toolNames.includes(name), `${name} from server/index.ts registerTool calls not found in tools/list`);
  }

  for (const tool of toolsResult.tools ?? []) {
    assertToolDescription(tool);
  }

  const statsResponse = await mcpCall("thought_stats", {});
  assertStringIncludes(extractText(statsResponse), "Total active thoughts:");
});

Deno.test("search metadata describes fallback behavior accurately", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const searchTool = toolsResult.tools?.find((t) => t.name === "search");
  assertExists(searchTool, "search tool must exist in tools/list");
  const desc = searchTool?.description ?? "";

  assert(!/\b(empty matches|no-match|no matches)\b.*\b(return|yield|produce)\b.*\bempty\b/i.test(desc), "search description must not claim that no-match queries return empty results — the runtime has lexical and nearest-neighbor fallbacks");
  assert(/\b(nearest-neighbor|fallback|recall)\b/i.test(desc), "search description must mention fallback or nearest-neighbor behavior");
});

Deno.test("search_thoughts metadata describes project scoping accurately", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const searchThoughts = toolsResult.tools?.find((t) => t.name === "search_thoughts");
  assertExists(searchThoughts, "search_thoughts tool must exist in tools/list");
  const desc = searchThoughts?.description ?? "";

  assert(!/\bprofile.*(filter|isolate|restrict|scope)\b/i.test(desc), "search_thoughts description must not claim profile-based filtering or isolation — runtime filters and boosts by project only");
  assert(/\bproject\b/i.test(desc), "search_thoughts description must mention project scoping");
  assert(/\bstrict\b/i.test(desc), "search_thoughts description must mention strict mode");

  const contextSchemaDesc = searchThoughts?.inputSchema?.properties?.context?.description ?? "";
  assert(!/\bprofile:professional\b/i.test(contextSchemaDesc), "search_thoughts context schema description must not use profile:professional as an example — profile is not a search filter");
});

Deno.test("list_thoughts metadata describes project scoping accurately", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const listThoughts = toolsResult.tools?.find((t) => t.name === "list_thoughts");
  assertExists(listThoughts, "list_thoughts tool must exist in tools/list");
  const desc = listThoughts?.description ?? "";

  assert(!/\bprofile.*(filter|isolate|restrict|scope)\b/i.test(desc), "list_thoughts description must not claim profile-based filtering or isolation — runtime filters by project only");
  assert(!/\bprofile\b/i.test(desc), "list_thoughts must omit removed profile vocabulary");

  const contextSchemaDesc = listThoughts?.inputSchema?.properties?.context?.description ?? "";
  assert(!/\bprofile:professional\b/i.test(contextSchemaDesc), "list_thoughts context schema description must not use profile:professional as an example — the SQL WHERE clause filters by project, not profile");
});

Deno.test("fetch metadata accurately describes UUID lookup and not-found behavior", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const fetchTool = toolsResult.tools?.find((t) => t.name === "fetch");
  assertExists(fetchTool, "fetch tool must exist in tools/list");
  const desc = fetchTool?.description ?? "";

  assert(/\bUUID\b/i.test(desc), "fetch description must mention UUID as the identifier type");
  assert(/\bnot found\b/i.test(desc) || /\bmissing\b/i.test(desc), "fetch description must mention what happens when a thought is not found");
  assert(!/\bsearch\b/i.test(desc) || /\bsearch returned\b/i.test(desc), "fetch description must not claim it can search — it retrieves by ID only");
});

Deno.test("capture_thought metadata accurately describes content limits and dedup", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const captureTool = toolsResult.tools?.find((t) => t.name === "capture_thought");
  assertExists(captureTool, "capture_thought tool must exist in tools/list");
  const desc = captureTool?.description ?? "";
  const properties = captureTool?.inputSchema?.properties ?? {};

  assert(/\b32\s*KB\b/i.test(desc) || /\b32\s*kilobyte/i.test(desc), "capture_thought description must mention the 32KB content limit");
  assert(/\bduplic\w*\b/i.test(desc), "capture_thought description must mention duplicate/upsert behavior");
  assert(/\bstored?\b/i.test(desc) && /\btags\b/i.test(desc), "capture_thought description must clarify that tags are stored with the thought");
  assert(!/\bprofile\b/i.test(desc), "capture_thought description must omit removed profile vocabulary");
  assert(!("tags" in properties), "capture_thought must not expose a raw tags parameter; tags enter through context only");

  const ann = captureTool?.annotations;
  assertEquals(ann?.readOnlyHint, false, "capture_thought must have readOnlyHint: false");
});

Deno.test("thought_stats and stats metadata describe no-parameter invocation and scope correctly", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);

  const thoughtStats = toolsResult.tools?.find((t) => t.name === "thought_stats");
  assertExists(thoughtStats, "thought_stats tool must exist in tools/list");
  const tsDesc = thoughtStats?.description ?? "";
  assert(/\bno parameters\b/i.test(tsDesc) || /\bcall with \{\}/i.test(tsDesc) || /\bNo parameters/i.test(tsDesc), "thought_stats must document that it has no parameters");
  assert(/\bactive\b/i.test(tsDesc), "thought_stats description must mention active thoughts (not all thoughts)");

  const stats = toolsResult.tools?.find((t) => t.name === "stats");
  assertExists(stats, "stats tool must exist in tools/list");
  const sDesc = stats?.description ?? "";
  assert(/\bno parameters\b/i.test(sDesc) || /\bcall with \{\}/i.test(sDesc) || /\bNo parameters/i.test(sDesc), "stats must document that it has no parameters");
  assert(/\bworker/i.test(sDesc), "stats description must mention worker health signals");
  assert(/\bqueue/i.test(sDesc), "stats description must mention queue depths");
});

Deno.test("graph tools metadata accurately describe read-only constraints and scope", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);

  const traverse = toolsResult.tools?.find((t) => t.name === "graph_traverse");
  assertExists(traverse, "graph_traverse tool must exist in tools/list");
  const tDesc = traverse?.description ?? "";
  assert(/\bMATCH\b/i.test(tDesc), "graph_traverse description must specify MATCH-only queries");
  assert(/\bmutation\b/i.test(tDesc) || /\bmutation|CREATE|SET|DELETE|MERGE\b/i.test(tDesc), "graph_traverse description must mention that mutation keywords are rejected");
  assert(/\b4096\b/i.test(tDesc) || /\bmax.*length\b/i.test(tDesc) || /\blength cap\b/i.test(tDesc), "graph_traverse description must mention the query length limit");

  const search = toolsResult.tools?.find((t) => t.name === "graph_search");
  assertExists(search, "graph_search tool must exist in tools/list");
  const sDesc = search?.description ?? "";
  assert(/\bstart_node\b/i.test(sDesc), "graph_search description must mention start_node parameter");
  assert(/\b(CAUSED_BY|LIKES|WORKS_ON|USES|RELATED_TO)\b/i.test(sDesc) || /\ballow/i.test(sDesc), "graph_search description must document the relationship filter allow-list");
  assert(/\bread[\s-]?only\b/i.test(tDesc), "graph_traverse must be marked read-only in its description");
});

Deno.test("consolidate metadata describes dry_run behavior accurately", async () => {
  const toolsResponse = await mcpRequest("tools/list");
  const toolsResult = resultOf<{ tools?: ToolListItem[] }>(toolsResponse);
  const consolidate = toolsResult.tools?.find((t) => t.name === "consolidate");
  assertExists(consolidate, "consolidate tool must exist in tools/list");
  const desc = consolidate?.description ?? "";

  assert(/\bdry.?run\b/i.test(desc), "consolidate description must mention dry_run parameter");
  assert(/\b50\b/.test(desc) && /\b500\b/.test(desc), "consolidate description must mention default and max limit (50/500)");
  assert(/consolidation_log|log rows/i.test(desc), "consolidate description must mention that dry_run still writes consolidation_log rows");
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

Deno.test("X-Correlation-ID header is accepted and does not break the request", async () => {
  // Requests with a valid X-Correlation-ID header should process identically to those without.
  const correlationId = "test-trace-2025-06-14";
  const response = await mcpRequest("ping", undefined, {
    headers: { "X-Correlation-ID": correlationId },
  }) as JsonRpcResponse;
  assertEquals(response.error, undefined);
});

Deno.test("requests without X-Correlation-ID still succeed", async () => {
  // Absence of the header must not cause errors — server generates a UUID.
  const response = await mcpRequest("ping") as JsonRpcResponse;
  assertEquals(response.error, undefined);
});
