## 2. Storage & Retrieval

**Storage:** All memory is plain Markdown on disk (`~/.openclaw/workspace`). The default backend indexes into a per-agent SQLite database (`~/.openclaw/memory/<agentId>.sqlite`). Files chunked at ~400 tokens with 80-token overlap, stored with FTS5 full-text indexes + optional vector embeddings.

**Retrieval tools:**
- `memory_search` — semantic/hybrid search across indexed chunks
- `memory_get` — reads a specific memory file or line range
- `memory_recall` — LanceDB plugin variant

**Active Memory** — a blocking sub-agent that runs *before* the main reply, proactively surfacing relevant memories without explicit search. Configurable "eagerness" levels (strict → balanced → contextual → recall-heavy → precision-heavy → preference-only).

---

