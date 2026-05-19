# QP-022 — Entity Extraction Worker (OpenRouter → AGE Graph)

## Story

**ST-022** — Implement entity extraction worker (OpenRouter → AGE graph)

## Summary

Background worker that polls `entity_extraction_queue`, sends thought content to an LLM for structured entity/relationship extraction, and writes the results into the AGE `memory_graph` via idempotent MERGE. Also ships a basic `graph_traverse` MCP tool so the populated graph is immediately queryable.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Worker deployment model | Same container — background loop inside MCP server process (shared DB pool, starts on server boot) |
| 2 | Integration testing approach | Docker Compose full-stack integration test (Postgres+AGE+worker; insert thought → assert graph nodes) |
| 3 | Allow-list scope | Hardcoded for v1: 5 node labels, 5 relationship types (per §R8 design) |
| 4 | Poll interval | 10 seconds |
| 5 | Batch size | 10 rows per poll cycle (`FOR UPDATE SKIP LOCKED`) |
| 6 | Retry strategy | Exponential backoff: 1s initial → 128s max, 5 max retries before marking `failed` |
| 7 | Input token cap | 4000 tokens (truncate content before sending to LLM) |
| 8 | LLM model | `openai/gpt-4o-mini` via OpenRouter |
| 9 | Graph traverse tool | Include a basic `graph_traverse` MCP tool (1–3 hops, configurable start node, optional relationship filter) |

## In Scope

- Background poll loop with `FOR UPDATE SKIP LOCKED` concurrency safety
- OpenRouter LLM call with strict `response_format: { type: "json_object" }`
- Allow-list validation: node labels (`Person`, `Function`, `Error`, `Topic`, `Project`), relationship types (`CAUSED_BY`, `LIKES`, `WORKS_ON`, `USES`, `RELATED_TO`)
- Escape/sanitise all string values before Cypher interpolation (single-quote escape, `$$` strip)
- Status lifecycle: `pending` → `processing` → `done` | `failed`
- Exponential backoff on transient failures (HTTP 429, 5xx, network errors)
- Per-thought content truncation at 4000 tokens
- AGE graph writes via `MERGE` (idempotent reprocessing)
- Basic `graph_traverse` MCP tool: accepts start node name, optional relationship filter, hop depth (1–3), returns connected nodes and edges as JSON
- Docker Compose integration test: insert thought → trigger fires → worker processes → assert AGE graph contains expected nodes/edges
- `graph_traverse` integration test: seeded graph → tool returns expected traversal

## Out of Scope

- Separate worker container/sidecar (single process for v1)
- Configurable allow-list (config file; hardcoded for v1)
- Multi-model routing or model fallback chains
- Dead-letter queue or manual retry UI
- Worker stats/observability tooling (covered by ST-028)
- REST API for graph traversal (MCP only)
- Graph visualization

## Design References

- Full worker design: `docs/investigations/ST-021-findings/09-entity-extraction-worker-design/`
- Existing schema: `server/db/graph.sql` (queue table + trigger + AGE graph already exist)
- Existing MCP tools: `server/index.ts` (add worker loop + graph_traverse tool here)
- OpenRouter call shape: `docs/investigations/ST-021-findings/09-entity-extraction-worker-design/03-openrouter-call-shape.md`
- AGE write pattern: `docs/investigations/ST-021-findings/09-entity-extraction-worker-design/04-age-write-pattern.md`
- Queue processing loop: `docs/investigations/ST-021-findings/09-entity-extraction-worker-design/05-queue-processing-loop.md`

## Acceptance Criteria (from board + additions)

1. Background worker loop polls `entity_extraction_queue` via `FOR UPDATE SKIP LOCKED`
2. OpenRouter LLM call with strict JSON `response_format` extracts entities + edges using hardcoded allow-list
3. Writes nodes/edges to `memory_graph` via `MERGE` cypher (idempotent reprocessing)
4. Worker runs as a background loop in the MCP server process
5. Status transitions: `pending` → `processing` → `done` | `failed` with exponential backoff on transient failures
6. Per-thought 4000-token input cap; content truncated before LLM call
7. Integration test: insert thought → trigger queues → worker processes → AGE graph contains expected nodes
8. `graph_traverse` MCP tool returns multi-hop traversal results (1–3 hops) with optional relationship filter
9. Integration test: `graph_traverse` returns expected nodes/edges from seeded graph

## Next Step

PO: compact context, then invoke `/plan` with this query packet path to produce the ExecPlan.
