import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { mcpCall } from "./_helpers/mcpClient.ts";

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

const MUTATION_QUERIES = [
  { query: "MATCH (n) DELETE n", keyword: "DELETE" },
  { query: "MATCH (n) SET n.name = 'pwned'", keyword: "SET" },
  { query: "MATCH (n) DETACH DELETE n", keyword: "DETACH" },
  { query: "MATCH (n) REMOVE n.name", keyword: "REMOVE" },
  { query: "MATCH (a), (b) CREATE (a)-[:OWNS]->(b)", keyword: "CREATE" },
  { query: "MATCH (a), (b) MERGE (a)-[:OWNS]->(b)", keyword: "MERGE" },
  { query: "MATCH (n) CALL apoc.do.something()", keyword: "CALL" },
  { query: "MATCH (n) WITH n LOAD CSV FROM 'http://evil.com' AS row RETURN row", keyword: "LOAD" },
  { query: "match (n) drop constraint IF EXISTS", keyword: "drop" },
] as const;

for (const { query, keyword } of MUTATION_QUERIES) {
  Deno.test({
    name: `graph_traverse rejects executable keyword: ${keyword}`,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
      const result = await mcpCall("graph_traverse", { cypher: query }) as ToolCallResponse;
      assertEquals(responseIsError(result), true, `Should reject query with ${keyword}`);
      assertEquals(responseText(result).toLowerCase().includes("disallowed"), true);
    },
  });
}

Deno.test({
  name: "graph_traverse rejects non-MATCH start",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "CREATE (n:Test {name: 'evil'})",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("must start with MATCH"), true);
  },
});

Deno.test({
  name: "graph_traverse rejects when MATCH is not the leading executable token",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "WITH 1 AS ignored MATCH (n) RETURN n",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("must start with MATCH"), true);
  },
});

Deno.test({
  name: "graph_traverse rejects queries exceeding 4096 chars",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const longQuery = "MATCH (n) " + "WHERE n.name = 'x' ".repeat(300) + "RETURN n";
    const result = await mcpCall("graph_traverse", { cypher: longQuery }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("maximum length"), true);
  },
});

Deno.test({
  name: "graph_traverse accepts valid MATCH...RETURN query",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) RETURN n LIMIT 5",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});

Deno.test({
  name: "graph_traverse allows keyword inside string literal",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) WHERE n.status = 'DELETE' RETURN n",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});

Deno.test({
  name: "graph_traverse allows keyword inside line comment",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) -- DELETE should be ignored\nRETURN n LIMIT 1",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});

Deno.test({
  name: "graph_traverse allows keyword inside block comment",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) /* DELETE should be ignored */ RETURN n LIMIT 1",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});

Deno.test({
  name: "graph_traverse allows leading comment when executable query starts with MATCH",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "-- comment\nMATCH (n) RETURN n LIMIT 1",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});

Deno.test({
  name: "graph_traverse rejects unterminated string literal",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) WHERE n.status = 'DELETE RETURN n",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("Unterminated string literal"), true);
  },
});

Deno.test({
  name: "graph_traverse rejects unterminated block comment",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) /* DELETE should not parse RETURN n",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), true);
    assertEquals(responseText(result).includes("Unterminated block comment"), true);
  },
});

Deno.test({
  name: "graph_traverse preserves wrapper safety when $$ appears in a literal",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const result = await mcpCall("graph_traverse", {
      cypher: "MATCH (n) WHERE n.note = '$$ DELETE $$' RETURN n LIMIT 1",
    }) as ToolCallResponse;

    assertEquals(responseIsError(result), undefined);
  },
});
