# QP-056: Embedding Request Timeout Resilience

> Story: ST-056  
> Status: Seed packet from `/plan-new`  
> Created: 2026-06-05  
> Source: MCP stall investigation during local VS Code agent dogfooding

---

## PO Intent

Prevent embedding-backed MCP tools from appearing to stall when the upstream embedding provider or network path hangs. The PO scoped this story narrowly to embedding requests only: do not broaden it to entity extraction or consolidation OpenRouter calls during `/plan` unless the PO explicitly widens scope.

## Triggering Investigation

The PO reported other VS Code Agent instances using the user-level `mcp.json` ai-memory server and seeing requests stall. The reported skill query was:

```text
agent-native architecture audit action parity tools primitives context injection shared workspace CRUD UI integration capability discovery prompt-native alternate-zoom
```

Session investigation on 2026-06-05 found:

- Direct raw MCP call to `list_thoughts` returned in about 0.48s.
- Direct raw calls to `search_thoughts` and `search` with the long agent-native query returned sub-second during the investigation.
- Docker services were healthy; `mcp` and `db` were up and healthy.
- VS Code logs contained client-side failures such as `TypeError: fetch failed` and async SSE stream termination/reconnect messages for ai-memory.
- `docker compose logs mcp` showed a cold-start dependency download phase before `Listening on http://0.0.0.0:3000/`, which can create a transient connection-failure window.
- Source review found `server/src/embeddings.ts` calls OpenRouter embeddings with bare `fetch` and no timeout/cancellation.

The cold-start/client-reconnect evidence is useful operational context, but the story scope selected by the PO is the concrete service-side risk: unbounded embedding fetches.

## Confirmed Story Metadata

| Field | Value |
|---|---|
| Title | Embedding request timeout resilience |
| Type | hardening |
| Placement | Backlog |
| Value | 4 |
| Blocked by | none |
| Future ExecPlan | `.github/planning/execplans/exec-plan-ST-056.md` |

## Research Findings

### Current Embedding Client

`server/src/embeddings.ts` exports `getEmbedding(text)` and calls:

```ts
await fetch(`${OPENROUTER_BASE}/embeddings`, { ... })
```

There is no `AbortController`, timeout signal, or configurable timeout. If the provider/network call never resolves promptly, any awaiting caller stays blocked.

### Call Sites

Known embedding call paths:

- `server/index.ts` `search`: awaits `getEmbedding(query)` before vector search.
- `server/index.ts` `search_thoughts`: awaits `getEmbedding(query).catch(() => null)` before BM25/vector fusion; if the call never settles, the BM25 fallback is never reached.
- `server/index.ts` `capture_thought`: starts `getEmbedding(content).then(...)` fire-and-forget; capture response should stay non-blocking, but the background promise can hang silently.
- `server/src/embeddingBackfill.ts`: awaits injected/default `getEmbedding` once per selected row; an unbounded call can stall that sweep.

### Relationship To Existing Stories

- ST-039 already implemented durable recovery/backfill for failed embeddings. ST-056 must preserve that model and should not reinvent the backfill schema.
- ST-044 covers general per-tool structured logging. ST-056 may add focused timeout logging/error messages, but broad logging middleware belongs to ST-044.
- ST-049 may later skip vector lane for keyword-only queries. ST-056 should not depend on it; timeout fallback is still needed for normal semantic queries.
- ST-053 deep health can later surface embedding degradation, but this story should not require deep health.

## Provisional Acceptance Criteria

1. `getEmbedding` aborts OpenRouter embedding requests after a configurable timeout and returns a clear timeout error without leaking API keys or request bodies.
2. `search_thoughts` does not hang when query embedding times out; it reaches the existing BM25/null-vector fallback path and returns a bounded response.
3. `capture_thought` remains non-blocking when the inline embedding attempt times out, and the row remains recoverable through ST-039 `needs_embedding`/backfill semantics.
4. `embeddingBackfill` treats timeout as a normal failed attempt: the sweep continues or exits deterministically, and failure state remains queryable via existing ST-039 columns.
5. Timeout events produce an operator-visible log/error signal that distinguishes upstream timeout from no-results/no-memory outcomes.
6. Focused tests cover timeout/cancellation behavior using stubbed fetch/embed dependencies, not real OpenRouter calls.
7. Cross-model critical review passes before the story moves to Review.

## Open Questions For `/plan`

1. What default timeout should `getEmbedding` use locally? Candidate: 10s to 15s, configurable by env var.
2. Should `search` (ChatGPT compatibility vector-only tool) return an error on embedding timeout, or should it return an empty result payload with an explicit diagnostic text? Its response shape is more constrained than `search_thoughts`.
3. Should `getEmbedding` accept injected `fetch` / timeout options for unit tests, or should tests use a small wrapper module/hook?
4. Should timed-out background capture promises log only, or also update `embedding_error` immediately? ST-039 currently makes the sweep own attempts/error state.
5. Should timeout configuration be local to embeddings for now, or routed through a small shared helper that future OpenRouter stories can reuse?

## Out Of Scope Unless Reconfirmed

- Entity extraction OpenRouter chat-completion timeouts.
- Consolidation LLM OpenRouter chat-completion timeouts.
- General tool invocation logging middleware from ST-044.
- Persistent metrics tables from ST-048.
- Deep health endpoint changes from ST-053.
- Deno dependency pre-caching / startup readiness hardening; this was observed during the investigation but not selected for ST-056.

## Recommended Next Step

Run `/plan ST-056` to produce a Ready ExecPlan for a narrow embedding-timeout implementation, with explicit tests around timeout/cancellation and degradation behavior.