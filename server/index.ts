import { McpServer } from "npm:@modelcontextprotocol/sdk@1.24.3/server/mcp.js";
import { StreamableHTTPTransport } from "npm:@hono/mcp@0.1.1";
import { Hono } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import { requireApiKey } from "./src/auth.ts";
import { parseContext } from "./src/parseContext.ts";
import { sql } from "./src/db.ts";
import { startEntityWorker } from "./src/entityWorker.ts";
import { startConsolidationWorker, drainPendingOnce } from "./src/consolidationWorker.ts";
import {
  cosineSim,
  deriveQualityBand,
  logRecall,
  logRecallQuery,
  mmrRerank,
  parseVector,
  rrfFuse,
  MmrCandidate,
} from "./src/searchQuality.ts";
import { ensureRequiredEnv } from "./src/startupValidation.ts";
import { getEmbedding, EMBEDDING_MODEL } from "./src/embeddings.ts";
import { startEmbeddingBackfill } from "./src/embeddingBackfill.ts";
import {
  IDENTIFIER_NORMALIZER_VERSION,
  normalizeIdentifiers,
} from "./src/identifierNormalization.ts";
import {
  type EmbeddingLane,
  emitRequestLog,
  extractSafeBodyFields,
  isBodyLoggingEnabled,
  resolveCorrelationId,
  setActiveEmbeddingLane,
  takeActiveEmbeddingLane,
} from "./src/mcpDiagnostics.ts";

// ---------------------------------------------------------------------------
// Startup validation — fail fast if required config is missing
// ---------------------------------------------------------------------------

ensureRequiredEnv();

const CITATION_BASE_URL = Deno.env.get("AI_MEMORY_CITATION_BASE_URL") ?? "https://ai-memory.local/thoughts";
const MAX_CONTENT_BYTES = 32_768; // 32 KB content limit per thought

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "ai-memory", version: "0.1.0" });

server.registerPrompt(
  "memory_search_guidance",
  {
    title: "Search AI Memory Before Answering",
    description: "Guidance for clients that want to use ai-memory recall before answering.",
  },
  () => ({
    description: "Use ai-memory tools to recall relevant project memory before answering.",
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text:
          "Before answering from memory, call ai-memory search_thoughts for project-scoped recall. Use search for ChatGPT-compatible semantic lookup, list_thoughts for recent entries, and fetch when you already have a thought id.",
      },
    }],
  }),
);

const SERVER_INFO_RESOURCE_URI = "ai-memory://server-info";

server.registerResource(
  "server-info",
  SERVER_INFO_RESOURCE_URI,
  {
    title: "AI Memory Server Info",
    description: "Safe static MCP compatibility metadata for ai-memory clients.",
    mimeType: "application/json",
  },
  (uri) => ({
    contents: [{
      uri: uri.toString(),
      mimeType: "application/json",
      text: JSON.stringify({
        name: "ai-memory",
        version: "0.1.0",
        protocolSurfaces: ["tools", "prompts", "resources"],
        promptNames: ["memory_search_guidance"],
        resourceUris: [SERVER_INFO_RESOURCE_URI],
        toolNames: [
          "search",
          "fetch",
          "search_thoughts",
          "capture_thought",
          "list_thoughts",
          "thought_stats",
          "graph_traverse",
          "graph_search",
          "consolidate",
        ],
      }, null, 2),
    }],
  }),
);

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
      const normalizedQuery = normalizeIdentifiers(query).retrievalText;
      const qEmb = normalizedQuery
        ? await getEmbedding(normalizedQuery).catch(() => null)
        : null;
      const aboveFloorRows = qEmb
        ? await sql`
            SELECT id, content, created_at,
                   1 - (embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS similarity
            FROM thoughts
            WHERE active = true AND embedding IS NOT NULL
              AND 1 - (embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) >= 0.5
            ORDER BY similarity DESC
            LIMIT 10
          `
        : [];

      const lexicalFallbackRows = normalizedQuery
        ? await sql`
            SELECT id, content, created_at, 0::float AS similarity
            FROM thoughts, plainto_tsquery('english', ${normalizedQuery}) AS q
            WHERE active = true
              AND search_vector @@ q
            ORDER BY ts_rank_cd(search_vector, q) DESC
            LIMIT 10
          `
        : [];

      const nearestNeighborFallbackRows = qEmb
        ? await sql`
            SELECT id, content, created_at,
                   1 - (embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS similarity
            FROM thoughts
            WHERE active = true AND embedding IS NOT NULL
            ORDER BY similarity DESC
            LIMIT 10
          `
        : [];

      const rows = aboveFloorRows.length
        ? aboveFloorRows
        : lexicalFallbackRows.length
          ? lexicalFallbackRows
          : nearestNeighborFallbackRows;
      const results = rows.map((t) => ({
        id: t.id,
        title: (t.content as string).slice(0, 80),
        url: `${CITATION_BASE_URL.replace(/\/$/, "")}/${t.id}`,
      }));

      logRecallQuery({
        tool: "search",
        query,
        normalizedQuery,
        project: null,
        profile: null,
        resultIds: results.map((result) => result.id as string),
      });

      setActiveEmbeddingLane(qEmb ? "full" : "bm25_only");
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
    description: "Fetch an active thought by ID (ChatGPT compatibility tool).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      id: z.string().uuid().describe("Thought UUID"),
    },
  },
  async ({ id }) => {
    try {
      const rows = await sql`
        SELECT id, content, metadata, memory_type, project, created_at, updated_at
        FROM thoughts
        WHERE id = ${id} AND active = true
      `;
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
      limit: z.number().int().min(1).max(100).optional().default(10),
    },
  },
  async ({ query, context, limit }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const profile = scope?.profile ?? null;
      const strict = scope?.strict === true;
      const n = limit ?? 10;
      const normalizedQuery = normalizeIdentifiers(query).retrievalText;

      const qEmb = normalizedQuery
        ? await getEmbedding(normalizedQuery).catch(() => null)
        : null;

      // BM25 lane — drop the hard project filter unless strict
      const bm25 = normalizedQuery
        ? (strict
        ? await sql`
            SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS bm25_rank
            FROM thoughts, plainto_tsquery('english', ${normalizedQuery}) AS q
            WHERE search_vector @@ q AND active = true
              AND (${project}::text IS NULL OR project = ${project})
            LIMIT 60
          `
        : await sql`
            SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_vector, q) DESC) AS bm25_rank
            FROM thoughts, plainto_tsquery('english', ${normalizedQuery}) AS q
            WHERE search_vector @@ q AND active = true
            LIMIT 60
          `)
        : [];

      // Vector lane (skipped if no embedding) — drop hard project filter unless strict
      const vector = qEmb
        ? (strict
            ? await sql`
                SELECT id, row_number() OVER (ORDER BY embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS vector_rank
                FROM thoughts
                WHERE active = true AND embedding IS NOT NULL
                  AND (${project}::text IS NULL OR project = ${project})
                LIMIT 60
              `
            : await sql`
                SELECT id, row_number() OVER (ORDER BY embedding <=> ${sql.unsafe(`'[${qEmb.join(",")}]'`)}::vector) AS vector_rank
                FROM thoughts
                WHERE active = true AND embedding IS NOT NULL
                LIMIT 60
              `)
        : [];

      // RRF fusion via the pure rrfFuse helper (k=60). Extracted so the regression harness
      // can prove k-sensitivity deterministically without the network. Behaviour-identical.
      const scores = rrfFuse([
        bm25.map((r) => ({ id: r.id as string, rank: Number(r.bm25_rank) })),
        vector.map((r) => ({ id: r.id as string, rank: Number(r.vector_rank) })),
      ], 60);

      if (!scores.size) {
        logRecallQuery({
          tool: "search_thoughts",
          query,
          normalizedQuery,
          project,
          profile,
          resultIds: [],
        });
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ query, normalized_query: normalizedQuery, results: [] }),
          }],
        };
      }

      // Pull top-N (3× requested, capped at 60) for boost + MMR
      const N = Math.min(60, Math.max(n * 3, n));
      const topIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, N).map(([id]) => id);

      const rowsAll = await sql`
        SELECT id, content, memory_type, project, created_at, embedding::text AS embedding
        FROM thoughts WHERE id = ANY(${topIds}::uuid[])
      `;
      const rowMap = new Map<string, { id: string; content: unknown; memory_type: unknown; project: string | null; created_at: unknown; embedding: number[] | null }>();
      for (const r of rowsAll) {
        rowMap.set(r.id as string, {
          id: r.id as string,
          content: r.content,
          memory_type: r.memory_type,
          project: (r.project as string | null) ?? null,
          created_at: r.created_at,
          embedding: parseVector(r.embedding as string | null),
        });
      }

      // Apply project boost (only when !strict — strict already filtered to in-project only)
      const bm25Ranks = new Map<string, number>(bm25.map((row) => [row.id as string, Number(row.bm25_rank)]));
      const vectorRanks = new Map<string, number>(vector.map((row) => [row.id as string, Number(row.vector_rank)]));

      const boosted: MmrCandidate[] = topIds.map((id) => {
        const r = rowMap.get(id)!;
        let score = scores.get(id)!;
        if (!strict && project && r.project === project) score *= 1.2;
        return { id, score, embedding: r.embedding };
      }).sort((a, b) => b.score - a.score);

      // MMR re-rank top-N to final n
      const reranked = mmrRerank(boosted, n, 0.7);

      const responseResults = reranked.map((res) => {
        const t = rowMap.get(res.id);
        if (!t) return null;

        const vectorSimilarity = qEmb && t.embedding
          ? cosineSim(qEmb, t.embedding)
          : null;

        return {
          id: t.id,
          content: t.content as string,
          memory_type: t.memory_type as "shard" | "wiki",
          project: t.project,
          score: res.score,
          quality_band: deriveQualityBand({
            bm25Rank: bm25Ranks.get(res.id) ?? null,
            vectorRank: vectorRanks.get(res.id) ?? null,
            vectorSimilarity,
          }),
        };
      }).filter((result): result is {
        id: string;
        content: string;
        memory_type: "shard" | "wiki";
        project: string | null;
        score: number;
        quality_band: "high" | "medium" | "low";
      } => result !== null);

      // Fire-and-forget recall log (never awaited)
      logRecall(query, project, reranked);
      logRecallQuery({
        tool: "search_thoughts",
        query,
        normalizedQuery,
        project,
        profile,
        resultIds: responseResults.map((result) => result.id),
      });

      setActiveEmbeddingLane(qEmb ? "full" : "bm25_only");
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            query,
            normalized_query: normalizedQuery,
            results: responseResults,
          }),
        }],
      };
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
      const contentBytes = new TextEncoder().encode(content).length;
      if (contentBytes > MAX_CONTENT_BYTES) {
        return {
          content: [{ type: "text" as const, text: `Error: Content exceeds maximum size of 32KB (received ${contentBytes} bytes, limit ${MAX_CONTENT_BYTES})` }],
          isError: true,
        };
      }

      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const profile = scope?.profile ?? null;
      const normalized = normalizeIdentifiers(content);
      const searchText = normalized.retrievalText;
      const metadata = {
        identifiers: normalized.facets,
      };

      const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content.trim().toLowerCase().replace(/\s+/g, " ")))
        .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

      const [insertResult] = await sql`
        INSERT INTO thoughts (
          content,
          search_text,
          normalizer_version,
          metadata,
          memory_type,
          project,
          profile,
          content_fingerprint,
          source
        )
        VALUES (
          ${content},
          ${searchText},
          ${IDENTIFIER_NORMALIZER_VERSION},
          ${metadata},
          ${memory_type ?? "shard"},
          ${project},
          ${profile},
          ${fingerprint},
          'user-taught'
        )
        ON CONFLICT (content_fingerprint) DO UPDATE
          SET updated_at = now(),
              active     = true,
              search_text = EXCLUDED.search_text,
              normalizer_version = EXCLUDED.normalizer_version,
              metadata = thoughts.metadata || EXCLUDED.metadata
        RETURNING id, memory_type, project
      `;

      // Fire-and-forget embedding update. On success, record the model and clear the
      // needs_embedding flag; on failure, log only — the backfill sweep owns retries
      // and the embedding_attempts counter (this inline attempt is best-effort).
      getEmbedding(searchText || content).then((emb) =>
        sql`
          UPDATE thoughts
          SET embedding       = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
              needs_embedding = false,
              embedding_model = ${EMBEDDING_MODEL},
              embedding_error = NULL
          WHERE id = ${insertResult.id}
        `
      ).catch((err) => console.error(`[capture_thought] embedding update failed for ${insertResult.id}:`, err));

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
      limit: z.number().int().min(1).max(100).optional().default(10),
      memory_type: z.enum(["shard", "wiki"]).optional(),
      context: z.string().optional().describe("Scope filter: e.g. 'project:zoom'"),
      days: z.number().int().min(1).max(365).optional().describe("Only thoughts from the last N days"),
    },
  },
  async ({ limit, memory_type, context, days }) => {
    try {
      const scope = parseContext(context);
      const project = scope?.projects?.[0] ?? null;
      const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
      const n = limit ?? 10;
      const mt = memory_type ?? null;

      const rows = await sql`
        SELECT id, content, memory_type, project, created_at
        FROM thoughts
        WHERE active = true
          AND (${mt}::text IS NULL OR memory_type = ${mt})
          AND (${project}::text IS NULL OR project = ${project})
          AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${n}
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

// sql.unsafe() with multi-statement SQL (LOAD + SET + SELECT) returns a nested
// array where each element is the rows from one statement. The actual query
// result rows are the last element.
function extractAgeRows(result: Record<string, unknown>[]): Record<string, unknown>[] {
  if (result.length > 0 && Array.isArray(result[0])) {
    return (result as unknown as Record<string, unknown>[][])[result.length - 1];
  }
  return result;
}

// --- Tool 5: graph_traverse (AGE / openCypher) ------------------------------

const CYPHER_MUST_START_WITH = /^\s*match\b/i;
const CYPHER_DENIED_KEYWORDS = /\b(CREATE|SET|DELETE|REMOVE|MERGE|DETACH|DROP|CALL|LOAD)\b/i;
const CYPHER_DOLLAR_QUOTE_RE = /\$\$/g;
const CYPHER_MAX_LENGTH = 4096;

function maskCypherLiteralsAndComments(cypher: string): { masked: string; error: string | null } {
  const chars = [...cypher];
  const masked = [...cypher];

  let i = 0;
  let state: "normal" | "single" | "double" | "lineComment" | "blockComment" = "normal";

  while (i < chars.length) {
    const ch = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : "";

    if (state === "normal") {
      if (ch === "'" ) {
        masked[i] = " ";
        state = "single";
        i += 1;
        continue;
      }
      if (ch === '"') {
        masked[i] = " ";
        state = "double";
        i += 1;
        continue;
      }
      if (ch === "-" && next === "-") {
        masked[i] = " ";
        masked[i + 1] = " ";
        state = "lineComment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        masked[i] = " ";
        masked[i + 1] = " ";
        state = "blockComment";
        i += 2;
        continue;
      }

      i += 1;
      continue;
    }

    if (state === "single") {
      masked[i] = " ";
      if (ch === "\\" && i + 1 < chars.length) {
        masked[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "normal";
      }
      i += 1;
      continue;
    }

    if (state === "double") {
      masked[i] = " ";
      if (ch === "\\" && i + 1 < chars.length) {
        masked[i + 1] = " ";
        i += 2;
        continue;
      }
      if (ch === '"') {
        state = "normal";
      }
      i += 1;
      continue;
    }

    if (state === "lineComment") {
      if (ch === "\n" || ch === "\r") {
        state = "normal";
      } else {
        masked[i] = " ";
      }
      i += 1;
      continue;
    }

    // blockComment
    masked[i] = " ";
    if (ch === "*" && next === "/") {
      masked[i + 1] = " ";
      state = "normal";
      i += 2;
      continue;
    }
    i += 1;
  }

  if (state === "single" || state === "double") {
    return { masked: masked.join(""), error: "Unterminated string literal in Cypher query." };
  }
  if (state === "blockComment") {
    return { masked: masked.join(""), error: "Unterminated block comment in Cypher query." };
  }

  return { masked: masked.join(""), error: null };
}

server.registerTool(
  "graph_traverse",
  {
    title: "Graph Traverse",
    description: "Run a read-only openCypher MATCH query against the memory_graph (Apache AGE). Use for multi-hop entity traversal, causation chains, and fact inference. Only MATCH queries are accepted.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      cypher: z.string().describe("openCypher MATCH query. Must start with MATCH. The graph name is 'memory_graph'."),
    },
  },
  async ({ cypher }) => {
    try {
      const trimmed = cypher.trim();
      if (trimmed.length > CYPHER_MAX_LENGTH) {
        return {
          content: [{ type: "text" as const, text: `Error: Query exceeds maximum length of ${CYPHER_MAX_LENGTH} characters.` }],
          isError: true,
        };
      }

      const { masked, error } = maskCypherLiteralsAndComments(trimmed);
      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          isError: true,
        };
      }

      if (!CYPHER_MUST_START_WITH.test(masked)) {
        return {
          content: [{ type: "text" as const, text: "Only MATCH queries are accepted. Query must start with MATCH." }],
          isError: true,
        };
      }

      const denied = masked.match(CYPHER_DENIED_KEYWORDS);
      if (denied) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: Query contains disallowed keyword "${denied[0]}". Only read-only MATCH...RETURN queries are accepted. Mutating statements (CREATE, MERGE, SET, DELETE, REMOVE, DETACH, DROP, CALL, LOAD) are not allowed.`,
          }],
          isError: true,
        };
      }

      // Parameter binding is not used here because the AGE cypher(...) call is
      // executed inside a multi-statement sql.unsafe wrapper. Keep the wrapper
      // narrow and strip dollar-quotes to avoid $$ delimiter breakouts.
      const safeCypher = trimmed.replace(CYPHER_DOLLAR_QUOTE_RE, "");

      if (!CYPHER_MUST_START_WITH.test(safeCypher)) {
        return {
          content: [{ type: "text" as const, text: "Only MATCH queries are accepted. Query must start with MATCH." }],
          isError: true,
        };
      }

      const rawRows = await sql.unsafe(`
        LOAD 'age';
        SET search_path = ag_catalog, "$user", public;
        SELECT * FROM cypher('memory_graph', $$ ${safeCypher} $$) AS t(result agtype);
      `);
      const rows = extractAgeRows(rawRows);
      const results = rows.map((r) => String(r.result));
      return { content: [{ type: "text" as const, text: results.length ? results.join("\n") : "No results." }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 6: graph_search (parameterized graph traversal) -------------------

const GRAPH_SEARCH_ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

server.registerTool(
  "graph_search",
  {
    title: "Graph Search",
    description: "Search the knowledge graph by starting from a named entity and traversing relationships up to a specified depth. Safer alternative to graph_traverse — does not require writing openCypher.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      start_node: z.string().describe("Name of the entity to start from (e.g. 'Alice', 'TypeScript')"),
      relationship_filter: z.string().optional().describe("Limit traversal to this relationship type (e.g. 'CAUSED_BY'). If omitted, all relationship types are traversed."),
      max_hops: z.number().int().min(1).max(3).optional().default(2).describe("Maximum traversal depth (1-3, default 2)"),
    },
  },
  async ({ start_node, relationship_filter, max_hops }) => {
    try {
      // Validate relationship filter against allow-list
      if (relationship_filter && !GRAPH_SEARCH_ALLOWED_RELS.has(relationship_filter)) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid relationship_filter. Allowed: ${[...GRAPH_SEARCH_ALLOWED_RELS].join(", ")}`,
          }],
          isError: true,
        };
      }

      const escapedName = start_node.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$\$/g, "");
      const hops = max_hops ?? 2;

      // Build the MATCH pattern
      let relPattern: string;
      if (relationship_filter) {
        relPattern = `-[:${relationship_filter}*1..${hops}]-`;
      } else {
        relPattern = `-[*1..${hops}]-`;
      }

      const cypher = `MATCH (start {name: '${escapedName}'})${relPattern}(connected) RETURN DISTINCT connected`;

      const rawRows = await sql.unsafe(`
        LOAD 'age';
        SET search_path = ag_catalog, "$user", public;
        SELECT * FROM cypher('memory_graph', $$ ${cypher} $$) AS t(result agtype);
      `);
      const rows = extractAgeRows(rawRows);

      const results = rows.map((r) => String(r.result));
      if (!results.length) {
        return { content: [{ type: "text" as const, text: `No nodes found connected to "${start_node}" within ${hops} hops.` }] };
      }
      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool 8: consolidate ------------------------------------------------

server.registerTool(
  "consolidate",
  {
    title: "Run consolidation sweep",
    description: "Manually drain the consolidation_queue. With dry_run=true, writes only consolidation_log rows marked dry_run=true and performs no thoughts writes.",
    inputSchema: {
      dry_run: z.boolean().optional().describe("If true, no thoughts mutations; consolidation_log rows are tagged dry_run=true"),
      limit: z.number().int().positive().max(500).optional().describe("Maximum candidates to process this sweep (default 50)"),
    },
  },
  async ({ dry_run, limit }) => {
    const processed = await drainPendingOnce(dry_run ?? false, limit ?? 50);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ processed, dry_run: dry_run ?? false }) }],
    };
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

// Apply CORS headers to every response
app.use("*", async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(corsHeaders)) c.res.headers.set(k, v);
});

app.options("*", (c) => c.text("ok", 200));

// Health endpoint for Docker Compose healthcheck
app.get("/health", (c) => c.text("ok"));

app.all("/mcp", async (c) => {
  const startMs = Date.now();
  const request_id = resolveCorrelationId(c.req.raw);

  // Extract safe method/id from body for logging (clones stream — does not consume original).
  const bodyFields = isBodyLoggingEnabled()
    ? await extractSafeBodyFields(c.req.raw)
    : undefined;
  const method = typeof bodyFields === "object" ? bodyFields.method : undefined;

  const denied = requireApiKey(c.req.raw);
  if (denied) {
    emitRequestLog({ ts: new Date().toISOString(), request_id, method, status: 401, duration_ms: Date.now() - startMs, embedding_lane: "n/a" });
    return c.text("Unauthorized", 401);
  }

  // embedding_lane is populated by search tools when they complete.
  // Default to "n/a" for non-search requests or requests that error before reaching a tool.
  let embedding_lane: EmbeddingLane = "n/a";
  let status = 200;
  let error_class: string | undefined;

  try {
    // @hono/mcp's StreamableHTTPTransport is Fetch/Hono-compatible (unlike the SDK's Node-style transport)
    const transport = new StreamableHTTPTransport();
    await server.connect(transport);
    const response = await transport.handleRequest(c);
    status = response instanceof Response ? response.status : 200;
    embedding_lane = takeActiveEmbeddingLane();
    return response;
  } catch (err) {
    status = 500;
    error_class = (err as Error)?.constructor?.name ?? "Error";
    throw err;
  } finally {
    emitRequestLog({ ts: new Date().toISOString(), request_id, method, status, duration_ms: Date.now() - startMs, embedding_lane, error_class });
  }
});

Deno.serve({ port: 3000 }, app.fetch);

// Start entity extraction background worker
startEntityWorker();

// Start consolidation background worker
startConsolidationWorker().catch((err) =>
  console.error("[server] consolidation worker failed to start:", err)
);

// Start embedding backfill worker (recovers rows whose embedding call failed)
startEmbeddingBackfill();
