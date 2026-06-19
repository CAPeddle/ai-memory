import { McpServer } from "npm:@modelcontextprotocol/sdk@1.24.3/server/mcp.js";
import { StreamableHTTPTransport } from "npm:@hono/mcp@0.1.1";
import { Hono } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";

import { requireApiKey } from "./src/auth.ts";
import { parseContextOrError } from "./src/parseContext.ts";
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
import { runMigrations } from "./src/migrate.ts";
import {
  IDENTIFIER_NORMALIZER_VERSION,
  normalizeIdentifiers,
} from "./src/identifierNormalization.ts";
import { withTiming } from "./src/logging.ts";
import {
  type EmbeddingLane,
  emitRequestLog,
  extractSafeBodyFields,
  resolveCorrelationId,
  runWithMcpRequestContext,
  setActiveEmbeddingLane,
  takeActiveEmbeddingLane,
} from "./src/mcpDiagnostics.ts";

// ---------------------------------------------------------------------------
// Startup validation — fail fast if required config is missing
// ---------------------------------------------------------------------------

ensureRequiredEnv();
await runMigrations();

const CITATION_BASE_URL = Deno.env.get("AI_MEMORY_CITATION_BASE_URL") ?? "https://ai-memory.local/thoughts";
const MAX_CONTENT_BYTES = 32_768; // 32 KB content limit per thought

function resolveSearchEmbeddingLane(normalizedQuery: string, qEmb: number[] | null): EmbeddingLane {
  if (!normalizedQuery) return "n/a";
  return qEmb ? "full" : "bm25_only";
}

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
          "stats",
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
    description: "Search memories by meaning for ChatGPT-compatible clients. Use when you need a simple read-only recall result list for a natural-language query. Parameters: query is the search text. Example: {\"query\":\"embedding timeout investigation\"}. Returns: JSON with results containing id, title, and url. Errors/edge cases: embedding failures fall back to lexical (BM25) results; when embeddings succeed but no results pass the cosine similarity threshold, nearest-neighbor matches are still returned, so an empty results array is returned only when all recall paths (vector threshold, lexical, nearest-neighbor) yield nothing.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().describe("Natural-language search text to recall matching active memories."),
    },
  },
  withTiming("search", async ({ query }) => {
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

      setActiveEmbeddingLane(resolveSearchEmbeddingLane(normalizedQuery, qEmb));
      return { content: [{ type: "text" as const, text: JSON.stringify({ results }) }] };
    } catch (err) {
      setActiveEmbeddingLane("n/a");
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  })
);

server.registerTool(
  "fetch",
  {
    title: "Fetch AI Memory Thought",
    description: "Fetch a single active thought by UUID for ChatGPT-compatible clients. Use when search returned an id and the caller needs the complete memory text and metadata. Parameters: id is the thought UUID to retrieve. Example: {\"id\":\"00000000-0000-4000-8000-000000000000\"}. Returns: JSON with id, title, text, url, and metadata. Errors/edge cases: invalid UUIDs fail schema validation; missing or inactive thoughts return a not-found error.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      id: z.string().uuid().describe("UUID of the active thought to fetch."),
    },
  },
  withTiming("fetch", async ({ id }) => {
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
  })
);

// --- Tool 1: search_thoughts (BM25 + vector hybrid) -------------------------

server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description: "Search captured thoughts with hybrid BM25 and vector recall. Use when an agent needs the richest project-aware memory search, including scores and quality bands. Parameters: query is the search text; context scopes results — project scopes to a project and activates a 1.2× boost for in-project results (strict restricts to only that project's results); the profile key is accepted but not used for filtering; limit controls result count. Example: {\"query\":\"MCP protocol compatibility\",\"context\":\"project:ai-memory,strict\",\"limit\":5}. Returns: JSON with query, normalized_query, and ranked results including score and quality_band. Errors/edge cases: malformed context returns a validation error; embedding failures keep BM25 recall available; limit must be 1-100.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().describe("Natural-language or identifier-heavy search text to match against captured thoughts."),
      context: z.string().optional().describe("Optional scope string — project scopes to a project with a 1.2× boost; strict restricts to in-project results only. Example: 'project:ai-memory,strict'."),
      limit: z.number().int().min(1).max(100).optional().default(10).describe("Maximum number of ranked results to return, from 1 to 100; defaults to 10."),
    },
  },
  withTiming("search_thoughts", async ({ query, context, limit }) => {
    try {
      const scopeResult = parseContextOrError(context);
      if ("isError" in scopeResult) return scopeResult;
      const scope = scopeResult;
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
        setActiveEmbeddingLane(resolveSearchEmbeddingLane(normalizedQuery, qEmb));
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

      setActiveEmbeddingLane(resolveSearchEmbeddingLane(normalizedQuery, qEmb));
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
      setActiveEmbeddingLane("n/a");
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  })
);

// --- Tool 2: capture_thought ------------------------------------------------

server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description: "Save a standalone memory thought. Use when an agent or user wants ai-memory to remember a reusable decision, fact, constraint, or project note. Parameters: content is the memory text; memory_type is shard or wiki; context scopes the thought — project and profile are stored with the thought (not used as search filters). Example: {\"content\":\"Use mcp-test for isolated server tests.\",\"memory_type\":\"shard\",\"context\":\"project:ai-memory\"}. Returns: capture confirmation with memory_type, optional project, and id. Errors/edge cases: content over 32KB is rejected; malformed context returns a validation error; duplicate content updates the existing active thought.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    inputSchema: {
      content: z.string().describe("Clear, standalone memory text to capture; maximum encoded size is 32KB."),
      memory_type: z.enum(["shard", "wiki"]).optional().default("shard").describe("Memory type to store: shard for raw captured notes, wiki for promoted durable facts; defaults to shard."),
      context: z.string().optional().describe("Optional scope string to tag the thought — project and profile are stored with the thought. Example: 'project:ai-memory,profile:professional'."),
    },
  },
  withTiming("capture_thought", async ({ content, memory_type, context }) => {
    try {
      const contentBytes = new TextEncoder().encode(content).length;
      if (contentBytes > MAX_CONTENT_BYTES) {
        return {
          content: [{ type: "text" as const, text: `Error: Content exceeds maximum size of 32KB (received ${contentBytes} bytes, limit ${MAX_CONTENT_BYTES})` }],
          isError: true,
        };
      }

      const scopeResult = parseContextOrError(context);
      if ("isError" in scopeResult) return scopeResult;
      const scope = scopeResult;
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
  })
);

// --- Tool 3: list_thoughts --------------------------------------------------

server.registerTool(
  "list_thoughts",
  {
    title: "List Recent Thoughts",
    description: "List recently captured active thoughts. Use when an agent needs a quick chronological inventory instead of relevance-ranked search. Parameters: limit controls count; memory_type filters shard or wiki; context filters by project assignment — the profile key is accepted but not used for filtering; days filters by recency. Example: {\"limit\":5,\"memory_type\":\"shard\",\"context\":\"project:ai-memory\",\"days\":7}. Returns: human-readable numbered thought summaries with dates, type, project, and content preview. Errors/edge cases: malformed context returns a validation error; no matches return 'No thoughts found.'; limit must be 1-100 and days must be 1-365.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().default(10).describe("Maximum number of recent thoughts to list, from 1 to 100; defaults to 10."),
      memory_type: z.enum(["shard", "wiki"]).optional().describe("Optional memory type filter: shard for raw captured notes or wiki for promoted durable facts."),
      context: z.string().optional().describe("Optional scope filter — project filters by project assignment. Example: 'project:ai-memory'."),
      days: z.number().int().min(1).max(365).optional().describe("Only thoughts from the last N days"),
    },
  },
  withTiming("list_thoughts", async ({ limit, memory_type, context, days }) => {
    try {
      const scopeResult = parseContextOrError(context);
      if ("isError" in scopeResult) return scopeResult;
      const scope = scopeResult;
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
  })
);

// --- Tool 4: thought_stats --------------------------------------------------

server.registerTool(
  "thought_stats",
  {
    title: "Thought Statistics",
    description: "Get active thought counts by memory type and project. Use when an agent needs a lightweight content inventory, not worker or recall metrics. Parameters: No parameters; call with {}. Example: {}. Returns: human-readable totals for active thoughts, counts by memory_type, and top projects. Errors/edge cases: database failures are returned as tool errors.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  withTiming("thought_stats", async () => {
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
  })
);

// --- Tool: stats (worker and system statistics) -------------------------------

server.registerTool(
  "stats",
  {
    title: "Worker and System Statistics",
    description: "Get queue, worker, recall, and content statistics. Use when an agent needs operational status for ai-memory background work and recent recall activity. Parameters: No parameters; call with {}. Example: {}. Returns: JSON with queues, workers, recall, and content sections. Errors/edge cases: database failures are returned as tool errors; this is broader than thought_stats and includes worker health signals.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  withTiming("stats", async () => {
    try {
      const [queueEntity] = await sql`
        SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending FROM entity_extraction_queue
      `;
      const [queueConsolidation] = await sql`
        SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending FROM consolidation_queue
      `;

      const workerAggs = await sql`
        SELECT worker, COUNT(*)::int AS runs, COALESCE(SUM(errors), 0)::int AS total_errors
        FROM worker_runs
        WHERE started_at > now() - interval '24 hours'
        GROUP BY worker
      `;

      const workerLastRun = await sql`
        SELECT DISTINCT ON (worker) worker, ended_at AS last_run_at,
          CASE WHEN errors > 0 THEN 'error' ELSE 'ok' END AS last_status
        FROM worker_runs
        WHERE ended_at IS NOT NULL
        ORDER BY worker, ended_at DESC
      `;

      const [recallCount] = await sql`
        SELECT COUNT(*)::int AS events_24h FROM recall_events WHERE created_at > now() - interval '24 hours'
      `;

      const [total] = await sql`SELECT count(*) AS cnt FROM thoughts WHERE active = true`;
      const byType = await sql`SELECT memory_type, count(*) AS cnt FROM thoughts WHERE active = true GROUP BY memory_type ORDER BY cnt DESC`;

      const workerNames = ["entity", "consolidation"];
      const workerMap: Record<string, { runs_24h: number; errors_24h: number; last_run_at: string | null; last_status?: string }> = Object.fromEntries(
        workerNames.map((n) => [n, { runs_24h: 0, errors_24h: 0, last_run_at: null }]),
      );
      for (const row of workerAggs) {
        const w = row.worker as string;
        if (workerMap[w]) {
          workerMap[w].runs_24h = Number(row.runs);
          workerMap[w].errors_24h = Number(row.total_errors);
        }
      }
      for (const row of workerLastRun) {
        const w = row.worker as string;
        if (workerMap[w]) {
          workerMap[w].last_run_at = row.last_run_at ? new Date(row.last_run_at as string).toISOString() : null;
          workerMap[w].last_status = row.last_status as string;
        }
      }

      const typeMap: Record<string, number> = {};
      for (const row of byType) {
        typeMap[row.memory_type as string] = Number(row.cnt);
      }

      const result = {
        queues: {
          entity_extraction_pending: Number(queueEntity.pending),
          consolidation_pending: Number(queueConsolidation.pending),
        },
        workers: workerMap,
        recall: { events_24h: Number(recallCount.events_24h) },
        content: { total: Number(total.cnt), by_type: typeMap },
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  })
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

type CypherWalkState = "normal" | "single" | "double" | "lineComment" | "blockComment";
type CypherCharAction = { type: "char"; ch: string } | { type: "advance" };

function* walkCypherTokens(cypher: string): Generator<{ char: string; state: CypherWalkState }, { error: string | null }> {
  const chars = [...cypher];
  let i = 0;
  let state: CypherWalkState = "normal";

  while (i < chars.length) {
    const ch = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : "";

    if (state === "normal") {
      if (ch === "'") {
        state = "single";
        yield { char: ch, state };
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = "double";
        yield { char: ch, state };
        i += 1;
        continue;
      }
      if (ch === "-" && next === "-") {
        yield { char: ch, state };
        yield { char: next, state };
        state = "lineComment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        yield { char: ch, state };
        yield { char: next, state };
        state = "blockComment";
        i += 2;
        continue;
      }

      yield { char: ch, state };
      i += 1;
      continue;
    }

    if (state === "single") {
      yield { char: ch, state };
      if (ch === "\\" && i + 1 < chars.length) {
        yield { char: chars[i + 1], state };
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
      yield { char: ch, state };
      if (ch === "\\" && i + 1 < chars.length) {
        yield { char: chars[i + 1], state };
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
      yield { char: ch, state };
      if (ch === "\n" || ch === "\r") {
        state = "normal";
      }
      i += 1;
      continue;
    }

    // blockComment
    yield { char: ch, state };
    if (ch === "*" && next === "/") {
      yield { char: next, state };
      state = "normal";
      i += 2;
      continue;
    }
    i += 1;
  }

  let error: string | null = null;
  if (state === "single" || state === "double") {
    error = "Unterminated string literal in Cypher query.";
  } else if (state === "blockComment") {
    error = "Unterminated block comment in Cypher query.";
  }

  return { error };
}

function maskCypherLiteralsAndComments(cypher: string): { masked: string; error: string | null } {
  const result: string[] = [];
  const iter = walkCypherTokens(cypher);
  let item = iter.next();

  while (!item.done) {
    const { char, state } = item.value;
    if (state === "normal") {
      result.push(char);
    } else {
      result.push(" ");
    }
    item = iter.next();
  }

  return { masked: result.join(""), error: item.value.error };
}

function stripCypherComments(cypher: string): string {
  const result: string[] = [];
  const iter = walkCypherTokens(cypher);
  let item = iter.next();

  while (!item.done) {
    const { char, state } = item.value;
    if (state === "lineComment" || state === "blockComment") {
      if (state === "lineComment" && (char === "\n" || char === "\r")) {
        result.push(char);
      }
    } else {
      result.push(char);
    }
    item = iter.next();
  }

  return result.join("");
}

server.registerTool(
  "graph_traverse",
  {
    title: "Graph Traverse",
    description: "Run a read-only openCypher MATCH query against the memory_graph. Use when an advanced caller needs custom multi-hop entity traversal or fact inference beyond graph_search. Parameters: cypher is an openCypher query that must start with MATCH and target memory_graph. Example: {\"cypher\":\"MATCH (n) RETURN n LIMIT 5\"}. Returns: one result per line or 'No results.'. Errors/edge cases: non-MATCH queries, mutation keywords, malformed literals/comments, dollar-quote breakouts, and queries over the length cap are rejected.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      cypher: z.string().describe("Read-only openCypher query that must start with MATCH and run against the memory_graph graph."),
    },
  },
  withTiming("graph_traverse", async ({ cypher }) => {
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

      const executableCypher = stripCypherComments(trimmed).trim();
      if (!CYPHER_MUST_START_WITH.test(executableCypher)) {
        return {
          content: [{ type: "text" as const, text: "Only MATCH queries are accepted. Query must start with MATCH." }],
          isError: true,
        };
      }

      // Parameter binding is not used here because the AGE cypher(...) call is
      // executed inside a multi-statement sql.unsafe wrapper. Keep the wrapper
      // narrow and strip dollar-quotes to avoid $$ delimiter breakouts.
      const safeCypher = executableCypher.replace(CYPHER_DOLLAR_QUOTE_RE, "");

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
  })
);

// --- Tool 6: graph_search (parameterized graph traversal) -------------------

const GRAPH_SEARCH_ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

server.registerTool(
  "graph_search",
  {
    title: "Graph Search",
    description: "Search the knowledge graph from a named entity using bounded traversal. Use when an agent wants connected entities without writing openCypher; prefer graph_traverse only for custom graph queries. Parameters: start_node is the entity name; relationship_filter optionally restricts edge type; max_hops controls traversal depth. Example: {\"start_node\":\"TypeScript\",\"relationship_filter\":\"USES\",\"max_hops\":2}. Returns: connected graph nodes, one per line, or a no-nodes message. Errors/edge cases: relationship_filter must be one of the allowed relationship types; max_hops must be 1-3.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      start_node: z.string().describe("Name of the entity node to start traversal from, for example 'Alice' or 'TypeScript'."),
      relationship_filter: z.string().optional().describe("Optional relationship type allow-list filter such as CAUSED_BY, LIKES, WORKS_ON, USES, or RELATED_TO."),
      max_hops: z.number().int().min(1).max(3).optional().default(2).describe("Maximum traversal depth (1-3, default 2)"),
    },
  },
  withTiming("graph_search", async ({ start_node, relationship_filter, max_hops }) => {
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
  })
);

// --- Tool 8: consolidate ------------------------------------------------

server.registerTool(
  "consolidate",
  {
    title: "Run consolidation sweep",
    description: "Manually drain pending consolidation candidates. Use when an operator or agent needs to trigger a consolidation sweep outside the background schedule. Parameters: dry_run previews work without thought mutations; limit caps processed candidates. Example: {\"dry_run\":true,\"limit\":10}. Returns: JSON with processed count and dry_run flag. Errors/edge cases: dry_run=true still writes dry-run consolidation_log rows; limit defaults to 50 and cannot exceed 500.",
    inputSchema: {
      dry_run: z.boolean().optional().describe("If true, skip thoughts mutations and tag consolidation_log rows as dry_run=true."),
      limit: z.number().int().positive().max(500).optional().describe("Maximum number of pending candidates to process in this sweep; defaults to 50 and maxes at 500."),
    },
  },
  withTiming("consolidate", async ({ dry_run, limit }) => {
    const processed = await drainPendingOnce(dry_run ?? false, limit ?? 50);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ processed, dry_run: dry_run ?? false }) }],
    };
  })
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

  // Extract safe method/tool/id fields for logging (clones stream — does not consume original).
  const bodyFields = await extractSafeBodyFields(c.req.raw);
  const method = typeof bodyFields === "object" ? bodyFields.method : undefined;
  const tool = typeof bodyFields === "object" ? bodyFields.tool : undefined;

  const denied = requireApiKey(c.req.raw);
  if (denied) {
    emitRequestLog({ ts: new Date().toISOString(), request_id, method, tool, status: 401, duration_ms: Date.now() - startMs, embedding_lane: "n/a" });
    return c.text("Unauthorized", 401);
  }

  // embedding_lane is populated by search tools when they complete.
  // Default to "n/a" for non-search requests or requests that error before reaching a tool.
  let embedding_lane: EmbeddingLane = "n/a";
  let status = 200;
  let error_class: string | undefined;

  try {
    const response = await runWithMcpRequestContext(async () => {
      // @hono/mcp's StreamableHTTPTransport is Fetch/Hono-compatible (unlike the SDK's Node-style transport)
      const transport = new StreamableHTTPTransport();
      await server.connect(transport);
      return await transport.handleRequest(c);
    });
    status = response instanceof Response ? response.status : 200;
    embedding_lane = takeActiveEmbeddingLane();
    return response;
  } catch (err) {
    status = 500;
    error_class = (err as Error)?.constructor?.name ?? "Error";
    throw err;
  } finally {
    emitRequestLog({ ts: new Date().toISOString(), request_id, method, tool, status, duration_ms: Date.now() - startMs, embedding_lane, error_class });
  }
});

Deno.serve({ port: 3000 }, app.fetch);

// Feature flags — set to "false" to disable
const FEATURE_ENTITY_WORKER = Deno.env.get("FEATURE_ENTITY_WORKER") !== "false";
const FEATURE_CONSOLIDATION_WORKER = Deno.env.get("FEATURE_CONSOLIDATION_WORKER") !== "false";

if (FEATURE_ENTITY_WORKER) {
  startEntityWorker();
} else {
  console.log("[server] Entity worker: disabled by feature flag (FEATURE_ENTITY_WORKER=false)");
}

if (FEATURE_CONSOLIDATION_WORKER) {
  startConsolidationWorker().catch((err) =>
    console.error("[server] consolidation worker failed to start:", err)
  );
} else {
  console.log("[server] Consolidation worker: disabled by feature flag (FEATURE_CONSOLIDATION_WORKER=false)");
}

// Start embedding backfill worker (recovers rows whose embedding call failed)
startEmbeddingBackfill();
