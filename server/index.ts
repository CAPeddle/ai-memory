import { McpServer } from "npm:@modelcontextprotocol/sdk@1.24.3/server/mcp.js";
import { StreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.24.3/server/streamableHttp.js";
import { Hono } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import { requireApiKey } from "./src/auth.ts";
import { parseContext } from "./src/parseContext.ts";
import { sql } from "./src/db.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const CITATION_BASE_URL = Deno.env.get("AI_MEMORY_CITATION_BASE_URL") ?? "https://ai-memory.local/thoughts";

// ---------------------------------------------------------------------------
// Embedding via OpenRouter (512-dim via text-embedding-3-small truncation)
// ---------------------------------------------------------------------------

async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
      dimensions: 512,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "ai-memory", version: "0.1.0" });

// --- ChatGPT compatibility: search + fetch -----------------------------------

server.registerTool(
  "search",
  {
    title: "Search AI Memory",
    description: "Search memories by meaning (ChatGPT compatibility tool).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().describe("Search query"),
    },
  },
  async ({ query }) => {
    try {
      const qEmb = await getEmbedding(query);
      const rows = await sql`
        SELECT id, content, created_at,
               1 - (embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS similarity
        FROM thoughts
        WHERE active = true AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) >= 0.5
        ORDER BY similarity DESC
        LIMIT 10
      `;
      const results = rows.map((t) => ({
        id: t.id,
        title: (t.content as string).slice(0, 80),
        url: `${CITATION_BASE_URL.replace(/\/$/, "")}/${t.id}`,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify({ results }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

server.registerTool(
  "fetch",
  {
    title: "Fetch AI Memory Thought",
    description: "Fetch a thought by ID (ChatGPT compatibility tool).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      id: z.string().describe("Thought UUID"),
    },
  },
  async ({ id }) => {
    try {
      const rows = await sql`SELECT id, content, metadata, memory_type, project, created_at, updated_at FROM thoughts WHERE id = ${id}`;
      if (!rows.length) return { content: [{ type: "text" as const, text: "Not found." }], isError: true };
      const t = rows[0];
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            id: t.id,
            title: (t.content as string).slice(0, 80),
            text: t.content,
            url: `${CITATION_BASE_URL.replace(/\/$/, "")}/${t.id}`,
            metadata: { ...t.metadata as object, memory_type: t.memory_type, project: t.project, created_at: t.created_at, updated_at: t.updated_at },
          }),
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 1: search_thoughts (BM25 + vector hybrid) -------------------------

server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description: "Search captured thoughts by meaning and keyword. Combines BM25 and vector similarity, fused via Reciprocal Rank Fusion.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().describe("What to search for"),
      context: z.string().optional().describe("Scope: e.g. 'project:zoom,profile:professional'"),
      limit: z.number().optional().default(10),
    },
  },
  async ({ query, context, limit }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;

      const qEmb = await getEmbedding(query).catch(() => null);

      // BM25 lane
      const bm25 = await sql`
        SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS bm25_rank
        FROM thoughts, plainto_tsquery('english', ${query}) AS q
        WHERE search_vector @@ q AND active = true
          AND (${project}::text IS NULL OR project = ${project})
        LIMIT 60
      `;

      // Vector lane (skipped if no embedding)
      const vector = qEmb
        ? await sql`
            SELECT id, row_number() OVER (ORDER BY embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS vector_rank
            FROM thoughts
            WHERE active = true AND embedding IS NOT NULL
              AND (${project}::text IS NULL OR project = ${project})
            LIMIT 60
          `
        : [];

      // RRF fusion
      const scores = new Map<string, number>();
      for (const r of bm25) scores.set(r.id as string, (scores.get(r.id as string) ?? 0) + 1 / (60 + Number(r.bm25_rank)));
      for (const r of vector) scores.set(r.id as string, (scores.get(r.id as string) ?? 0) + 1 / (60 + Number(r.vector_rank)));

      const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit ?? 10);
      if (!ranked.length) return { content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }] };

      const ids = ranked.map(([id]) => id);
      const rows = await sql`SELECT id, content, memory_type, project, created_at FROM thoughts WHERE id = ANY(${ids}::uuid[])`;
      const rowMap = new Map(rows.map((r) => [r.id as string, r]));

      const lines = ranked.map(([id, score], i) => {
        const t = rowMap.get(id);
        if (!t) return "";
        return `--- Result ${i + 1} (rrf: ${score.toFixed(4)}) [${t.memory_type}${t.project ? " / " + t.project : ""}] ---\n${t.content}`;
      }).filter(Boolean);

      return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 2: capture_thought ------------------------------------------------

server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description: "Save a new thought to AI Memory. Generates a 512-dim embedding automatically. Supports memory_type (shard|wiki) and context scoping.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    inputSchema: {
      content: z.string().describe("The thought to capture — a clear, standalone statement"),
      memory_type: z.enum(["shard", "wiki"]).optional().default("shard"),
      context: z.string().optional().describe("Scope: e.g. 'project:zoom,profile:professional'"),
    },
  },
  async ({ content, memory_type, context }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const profile = scope?.profile ?? null;

      const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content.trim().toLowerCase().replace(/\s+/g, " ")))
        .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

      const [insertResult] = await sql`
        INSERT INTO thoughts (content, memory_type, project, profile, content_fingerprint, source)
        VALUES (${content}, ${memory_type ?? "shard"}, ${project}, ${profile}, ${fingerprint}, 'user-taught')
        ON CONFLICT (content_fingerprint) DO UPDATE
          SET updated_at = now()
        RETURNING id, memory_type, project
      `;

      // Fire-and-forget embedding update
      getEmbedding(content).then((emb) =>
        sql`UPDATE thoughts SET embedding = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector WHERE id = ${insertResult.id}`
      ).catch(() => {});

      return {
        content: [{
          type: "text" as const,
          text: `Captured as ${insertResult.memory_type}${insertResult.project ? " / project:" + insertResult.project : ""} (id: ${insertResult.id})`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 3: list_thoughts --------------------------------------------------

server.registerTool(
  "list_thoughts",
  {
    title: "List Recent Thoughts",
    description: "List recently captured thoughts with optional filters.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      limit: z.number().optional().default(10),
      memory_type: z.enum(["shard", "wiki"]).optional(),
      context: z.string().optional().describe("Scope filter: e.g. 'project:zoom'"),
      days: z.number().optional().describe("Only thoughts from the last N days"),
    },
  },
  async ({ limit, memory_type, context, days }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

      const rows = await sql`
        SELECT id, content, memory_type, project, created_at
        FROM thoughts
        WHERE active = true
          AND (${memory_type}::text IS NULL OR memory_type = ${memory_type})
          AND (${project}::text IS NULL OR project = ${project})
          AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit ?? 10}
      `;

      if (!rows.length) return { content: [{ type: "text" as const, text: "No thoughts found." }] };

      const lines = rows.map((t, i) =>
        `${i + 1}. [${new Date(t.created_at as string).toLocaleDateString()}] (${t.memory_type}${t.project ? " / " + t.project : ""})\n   ${(t.content as string).slice(0, 120)}`
      );
      return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 4: thought_stats --------------------------------------------------

server.registerTool(
  "thought_stats",
  {
    title: "Thought Statistics",
    description: "Get total thought counts broken down by memory_type and project.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  async () => {
    try {
      const [total] = await sql`SELECT count(*) AS cnt FROM thoughts WHERE active = true`;
      const byType = await sql`SELECT memory_type, count(*) AS cnt FROM thoughts WHERE active = true GROUP BY memory_type ORDER BY cnt DESC`;
      const byProject = await sql`SELECT project, count(*) AS cnt FROM thoughts WHERE active = true AND project IS NOT NULL GROUP BY project ORDER BY cnt DESC LIMIT 10`;

      const lines = [
        `Total active thoughts: ${total.cnt}`,
        "",
        "By memory type:",
        ...byType.map((r) => `  ${r.memory_type}: ${r.cnt}`),
        "",
        "Top projects:",
        ...byProject.map((r) => `  ${r.project}: ${r.cnt}`),
      ];
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 5: graph_traverse (AGE / openCypher) ------------------------------

server.registerTool(
  "graph_traverse",
  {
    title: "Graph Traverse",
    description: "Run an openCypher query against the memory_graph (Apache AGE). Use for multi-hop entity traversal, causation chains, and fact inference.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      cypher: z.string().describe("openCypher MATCH query. The graph name is 'memory_graph'."),
    },
  },
  async ({ cypher }) => {
    try {
      const rows = await sql.unsafe(`
        LOAD 'age';
        SET search_path = ag_catalog, "$user", public;
        SELECT * FROM cypher('memory_graph', $$ ${cypher} $$) AS t(result agtype);
      `);
      const results = rows.map((r) => String(r.result));
      return { content: [{ type: "text" as const, text: results.length ? results.join("\n") : "No results." }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Hono app — Bearer auth + CORS + StreamableHTTP transport
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};

const app = new Hono();

app.options("*", (c) => c.text("ok", 200, corsHeaders));

app.all("/mcp", async (c) => {
  const denied = requireApiKey(c.req.raw);
  if (denied) return new Response(denied.body, { status: 401, headers: corsHeaders });

  // Claude Desktop / some connectors omit the Accept header; patch it in.
  let req = c.req.raw;
  if (!req.headers.get("accept")?.includes("text/event-stream")) {
    const headers = new Headers(req.headers);
    headers.set("Accept", "application/json, text/event-stream");
    req = new Request(req.url, { method: req.method, headers, body: req.body, duplex: "half" } as RequestInit);
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  await server.connect(transport);
  return transport.handleRequest(req, new Response());
});

Deno.serve({ port: 3000 }, app.fetch);
