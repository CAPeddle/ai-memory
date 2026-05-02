# OpenClaw Official Documentation — Memory Concepts Review

| Field | Value |
|-------|-------|
| **Source** | https://docs.openclaw.ai/concepts/memory |
| **Reviewed** | 2025-05-02 |
| **Purpose** | Evaluate OpenClaw's memory design for patterns adoptable in ai-memory |

---

## 1. Architecture Overview

OpenClaw uses a **file-based, tiered memory architecture** with distinct temporal layers:

| Layer | File | Scope | Auto-loaded? |
|-------|------|-------|--------------|
| **Long-term memory** | `MEMORY.md` | Durable facts, preferences, decisions | Yes — every session |
| **Daily notes** | `memory/YYYY-MM-DD.md` | Running context, observations | Today + yesterday |
| **Dream diary** | `DREAMS.md` | Consolidation summaries for human review | Optional |
| **Short-term dreaming store** | `memory/.dreams/` | Machine state: recall traces, phase signals | Internal only |
| **Commitments** | (opt-in) | Short-lived follow-up reminders | Delivered via heartbeat |
| **Memory Wiki** | `memory-wiki` plugin | Structured knowledge with contradiction tracking | Optional |

**Key principle:** No hidden state — the model only remembers what gets saved to disk as plain Markdown.

---

## 2. Storage & Retrieval

**Storage:** All memory is plain Markdown on disk (`~/.openclaw/workspace`). The default backend indexes into a per-agent SQLite database (`~/.openclaw/memory/<agentId>.sqlite`). Files chunked at ~400 tokens with 80-token overlap, stored with FTS5 full-text indexes + optional vector embeddings.

**Retrieval tools:**
- `memory_search` — semantic/hybrid search across indexed chunks
- `memory_get` — reads a specific memory file or line range
- `memory_recall` — LanceDB plugin variant

**Active Memory** — a blocking sub-agent that runs *before* the main reply, proactively surfacing relevant memories without explicit search. Configurable "eagerness" levels (strict → balanced → contextual → recall-heavy → precision-heavy → preference-only).

---

## 3. Memory Lifecycle

| Phase | Mechanism |
|-------|-----------|
| **Creation** | Agent writes to `MEMORY.md` or `memory/YYYY-MM-DD.md` |
| **Indexing** | File changes trigger debounced reindex (1.5s). Chunks embedded & stored |
| **Retrieval** | Hybrid search (vector + BM25) at query time; Active Memory pre-fetches |
| **Memory Flush** | Before compaction, a silent turn saves important context to files |
| **Consolidation (Dreaming)** | Background sweep: Light → REM → Deep phases. Scores and promotes |
| **Promotion gates** | Must pass: frequency, relevance, query diversity, recency, consolidation, conceptual richness |
| **Temporal decay** | Old notes lose ranking weight (half-life: 30 days). `MEMORY.md` exempt |

---

## 4. Search Strategy — Hybrid Architecture

```
Query → [Embedding] + [Tokenize]
         ↓                ↓
   Vector Search     BM25 Search (FTS5)
         ↓                ↓
       Weighted Merge → Top Results
```

| Feature | Detail |
|---------|--------|
| Vector search | Semantically similar notes (e.g. "gateway host" matches "the machine running OpenClaw") |
| BM25 (FTS5) | Exact matches — IDs, error strings, config keys |
| Graceful degradation | If embeddings unavailable, lexical ranking via FTS still works |
| Temporal decay | Configurable half-life (30d default); evergreen files exempt |
| MMR diversity | Reduces redundant results |
| Multimodal | Images/audio indexable alongside Markdown (Gemini Embedding 2) |
| sqlite-vec | Optional in-database vector acceleration |

**Supported embedding providers:** OpenAI, Gemini, Voyage, Mistral, DeepInfra, Ollama, Local (GGUF), GitHub Copilot, Bedrock.

---

## 5. Context Window Management

| Technique | Purpose |
|-----------|---------|
| **Compaction** | Near context limit → summarize older messages, keep recent intact |
| **Memory Flush** | Before compaction, save important facts to persistent files |
| **Session Pruning** | Trim tool output without full summarization |
| **Successor Transcripts** | After compaction: summary + preserved state + unsummarized tail |
| **Active Memory** | Pre-loads relevant context as hidden prompt prefix (bounded: max 220 chars) |
| **Auto-loading rules** | MEMORY.md always; today+yesterday loaded; older requires explicit search |
| **Identifier preservation** | Compaction preserves opaque IDs/keys during summarization |

---

## 6. Dreaming (Bio-Inspired Consolidation)

Three-phase background sweep mimicking human sleep consolidation:

| Phase | Function |
|-------|----------|
| **Light** | Score short-term signals from daily notes |
| **REM** | Cross-reference with existing long-term memory |
| **Deep** | Promote qualified items to `MEMORY.md` |

**Promotion scoring dimensions:**
1. Frequency (how often referenced)
2. Relevance (semantic similarity to existing memory)
3. Query diversity (useful across different question types)
4. Recency (temporal freshness)
5. Consolidation (already partially consolidated?)
6. Conceptual richness (depth of the observation)

**Grounded backfill:** Can replay historical notes through the dreaming system retroactively.

---

## 7. Cross-Session Persistence

| Mechanism | Scope |
|-----------|-------|
| File-based persistence | All memory survives any session boundary |
| `MEMORY.md` | Loaded at start of every session |
| Daily notes | Today + yesterday auto-loaded; older searchable |
| Session transcripts | Optionally indexable for recall |
| Honcho integration | Alternative backend for cross-session user modeling |
| Commitments | Short-lived follow-ups delivered via heartbeat across sessions |

---

## 8. Unique / Novel Approaches

| Feature | What's Novel | Relevance to ai-memory |
|---------|--------------|------------------------|
| **Active Memory sub-agent** | Blocking pre-reply agent surfaces relevant memory *before* main generation | Consider as future enhancement — proactive recall |
| **Dreaming consolidation** | Three-phase bio-inspired sweep with weighted scoring | Maps to our consolidation pipeline design |
| **Memory Flush** | Auto-saves before compaction prevents context loss | Relevant for long-session resilience |
| **File-as-truth** | No hidden state — human-readable, editable Markdown | Aligns with our auditable design philosophy |
| **Inferred commitments** | Auto-detects temporal follow-up opportunities | Future feature — temporal triggers |
| **Eagerness tuning** | Configurable aggressiveness of proactive recall | Interesting knob for per-agent profiles |
| **Pluggable backends** | SQLite, QMD, Honcho, LanceDB interchangeable | Validates our service abstraction layer |
| **Wiki companion** | Structured knowledge with contradiction/freshness tracking | Possible future layer |

---

## 9. Key Takeaways for ai-memory

### Validate Our Existing Decisions

| Our Decision | OpenClaw Confirms |
|--------------|-------------------|
| SQLite + FTS5 for primary storage | Their default backend; works at 3K+ facts scale |
| Hybrid search (keyword + vector) | 100% recall with hybrid vs 46.7% BM25-only |
| MMR diversity in results | They use it for redundancy reduction |
| Consolidation pipeline | Their "dreaming" validates the bio-inspired approach |
| No decay/forgetting (initially) | They have decay but the ranking integration is still a stub |
| MCP tools as interface | Aligns with their plugin tool model |

### New Patterns to Consider

| Pattern | Description | Priority for ai-memory |
|---------|-------------|------------------------|
| **Active Memory (proactive recall)** | Pre-reply context injection without explicit search | Medium — future enhancement |
| **Memory Flush before compaction** | Save context before it's lost to summarization | Low — we don't manage compaction |
| **Importance tagging** (`i=0.9`) | Explicit importance scores on observations | High — map to our `confidence` field |
| **Eagerness profiles** | Per-agent recall aggressiveness tuning | Low — future sophistication |
| **File-as-truth Layer 0** | Keep curated Markdown alongside DB knowledge | Medium — aligns with Resource design |
| **Debounced reindex** (1.5s) | Don't re-index on every write | High — practical performance pattern |
| **Chunking strategy** (400 tok / 80 overlap) | Proven chunking parameters | Medium — reference for our embedding design |

### Warnings from Their Experience

1. **Decay is hard** — They have the schema but ranking integration is still incomplete after months
2. **Fact quality is the bottleneck** — LLM extraction produces noise; 13+ guardrails needed
3. **Single DB vs Multiple** — They tried consolidation, backed away. Design for later separation
4. **220-char limit on Active Memory** — Even proactive recall must be brutally concise
5. **Temporal decay half-life** — 30 days default; `MEMORY.md` must be exempt from decay
