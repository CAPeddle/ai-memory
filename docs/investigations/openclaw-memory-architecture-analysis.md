# OpenClaw Memory Architecture — Research Analysis

**Repository:** https://github.com/coolmanns/openclaw-memory-architecture  
**Author:** coolmanns (Sascha Kuhlmann)  
**Stars:** 52 | **Forks:** 7 | **License:** MIT  
**Last updated:** ~March 2026 (v2.4)  
**Languages:** Python 60.5%, HTML 31.1%, JavaScript 8.2%, Shell 0.2%

---

## 1. Overall Architecture Pattern

**Multi-layered cognitive memory system** — 12+ discrete layers, each optimized for a different query pattern and lifetime. The core philosophy is:

> "Don't rely on one approach. Use the right memory layer for each type of recall."

The architecture draws from cognitive science (Hebbian learning, working memory vs. long-term memory):

```
┌─────────────────────────────────────────────────────────┐
│ Lossless Context Engine (lcm.db)                         │
│ Stores all messages → builds summary DAG → assembles     │
│ context window from DAG + live messages                  │
├─────────────────────────────────────────────────────────┤
│ CONTEXT WINDOW (~200K tokens, assembled by LCM)          │
│                                                          │
│ • Workspace files (always loaded): MEMORY.md, USER.md,  │
│   SOUL.md, AGENTS.md                                     │
│ • Plugin context (injected at runtime): Continuity,     │
│   Stability, Metabolism                                  │
│ • Conversation (managed by LCM): Live msgs + DAG        │
│   summaries of older ones                                │
├─────────────────────────────────────────────────────────┤
│ PERSISTENT STORAGE                                       │
│                                                          │
│ • lcm.db — Messages, summaries, FTS index, DAG nodes    │
│ • facts.db — Entities, relations, aliases, decay tiers  │
│ • continuity.db — Archives, embeddings, topics, anchors │
│ • LightRAG — PostgreSQL + pgvector (domain knowledge)   │
│ • Daily files — memory/*.md (journal)                   │
├─────────────────────────────────────────────────────────┤
│ METACOGNITIVE PIPELINE                                   │
│ Metabolism → Gaps → Contemplation → Growth Vectors       │
└─────────────────────────────────────────────────────────┘
```

**Key insight: Layers serve different timescales and query patterns.**

| Layer | Purpose | Latency | Query Pattern |
|-------|---------|---------|---------------|
| 0. LCM | Lossless within-session context (DAG + FTS) | Runtime | "What did I just say?" |
| 1. Always-loaded files | Identity, working memory | 0ms | Always present |
| 2. MEMORY.md | Curated long-term wisdom | 0ms | Always present |
| 3. PROJECT.md | Institutional knowledge per project | 0ms | Per-project boot |
| 4. facts.db | Structured entity/key/value | <1ms | "What's X's birthday?" |
| 5. Continuity | Cross-session conversation recall | 7ms | "What did we discuss?" |
| 5a. File-vec | Workspace document search | 7ms | "Where did I document X?" |
| 5b. LightRAG | Domain GraphRAG | ~200ms | Deep domain queries |
| 6. Daily logs | Raw session history | On demand | Full history |
| 10-12. Plugins | Context budgeting, monitoring, extraction | Runtime | Automatic |

---

## 2. Technology Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| **Primary language** | Python (60.5%) | Scripts, data processing, search |
| **Plugin runtime** | JavaScript/Node.js (8.2%) | OpenClaw plugin system (JS-based) |
| **Structured storage** | SQLite + FTS5 | facts.db, lcm.db, continuity.db |
| **Vector search** | sqlite-vec (768d) | Integrated with continuity plugin |
| **Domain RAG** | PostgreSQL + pgvector | LightRAG for GraphRAG (4,909 entities) |
| **Embeddings** | llama.cpp + nomic-embed-text-v2-moe | 768d, ~7ms GPU, multilingual |
| **LLM extraction** | Anthropic Sonnet | Metabolism fact extraction |
| **Dashboard** | HTML (31.1%) | OMA Dashboard for visualization |
| **Deployment** | Docker (llama.cpp), cron jobs | Single-machine, local-first |

---

## 3. Memory Data Models / Schemas

### facts.db — Core Knowledge Graph

```sql
CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,          -- "Sascha", "Postiz", "decision"
    key TEXT NOT NULL,             -- "birthday", "stack", "always use trash"
    value TEXT NOT NULL,           -- "March 15, 1990", "Next.js + PostgreSQL"
    category TEXT NOT NULL,        -- 14 enforced categories
    source TEXT,                   -- "metabolism", "manual", "conversation 2026-02-14"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed TEXT,            -- updated on every retrieval
    access_count INTEGER DEFAULT 0,
    permanent BOOLEAN DEFAULT 0,   -- 1 = never decays
    decay_score REAL DEFAULT 1.0,  -- computed decay for pruning
    activation REAL DEFAULT 0.0,   -- Hebbian: bumped on retrieval
    importance REAL DEFAULT 0.5    -- baseline importance (0.0-1.0)
);

CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    source TEXT DEFAULT 'metabolism',
    category TEXT DEFAULT 'person',
    permanent BOOLEAN DEFAULT 1,
    activation REAL DEFAULT 0.0,
    decay_score REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS aliases (
    alias TEXT NOT NULL COLLATE NOCASE,
    entity TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (alias, entity)
);

CREATE TABLE IF NOT EXISTS facts_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    key TEXT NOT NULL,
    operation TEXT NOT NULL,       -- "insert", "update", "delete", "prune"
    old_value TEXT,
    new_value TEXT,
    source TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS co_occurrences (
    fact_a TEXT NOT NULL,
    fact_b TEXT NOT NULL,
    weight REAL NOT NULL
);

-- FTS5 index for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    entity, key, value,
    content=facts,
    content_rowid=id
);

-- Auto-sync triggers for FTS
CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
    INSERT INTO facts_fts(rowid, entity, key, value)
    VALUES (new.id, new.entity, new.key, new.value);
END;

-- Relations also get FTS
CREATE VIRTUAL TABLE IF NOT EXISTS relations_fts USING fts5(
    subject, predicate, object,
    content=relations,
    content_rowid=id
);
```

### 14-Category Taxonomy (enforced)

| Domain | Categories |
|--------|-----------|
| People | `person`, `family`, `friend`, `pet` |
| Knowledge | `psychedelic`, `reference` |
| Tech | `project`, `infrastructure`, `tool` |
| Decisions | `decision`, `preference`, `convention` |
| Ops | `automation`, `workflow` |

**Born permanent** (never decay): `family`, `friend`, `person`, `pet`, `psychedelic`, `decision`, `preference`

### LCM (Lossless Context Management) — lcm.db

- Every message (user, assistant, tool I/O) stored with FTS5 indexing
- Summary DAG: leaf summaries (depth 0) from oldest messages, merged into higher levels
- Nothing ever deleted — drill into any summary to recover originals
- Context assembly walks DAG to reconstruct most relevant context per turn

---

## 4. Tradeoffs Made

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| **SQLite over PostgreSQL** (for facts) | No concurrent writes, limited scale | Zero deployment cost, <1ms lookup, single-user sufficient |
| **PostgreSQL for LightRAG** | Extra infrastructure | pgvector + GraphRAG needs relational capabilities SQLite can't provide |
| **Multiple DBs** (lcm.db, facts.db, continuity.db) | Complexity, data spread | Each optimized for its access pattern; single-DB was tried and backed away from |
| **Local embeddings (llama.cpp)** | GPU required | Zero API cost, 7ms vs 200ms cloud, multilingual |
| **Hebbian decay as stub** | Feature incomplete | Schema ready, ranking not wired — pragmatic "ship schemas, implement later" |
| **LLM-based extraction** (Metabolism) | API cost for Sonnet calls | Quality of extraction justifies cost over rule-based approaches |
| **File-based identity** (MEMORY.md, SOUL.md) | Manual curation overhead | Explainable, editable, version-controlled; humans can audit |
| **Per-agent conversation isolation** | Less cross-agent learning | Security boundary; shared facts.db bridges the gap |
| **Single-user architecture** | Not multi-tenant | Simplicity; multi-tenant identified as future design fork |

---

## 5. Retrieval Strategies

### Unified Search (`memory_search`) — One Tool, Four Backends

```
memory_search("what did we decide about the database?")
        │
        ├── continuity  — semantic vector search (384d/768d embeddings)
        ├── facts       — structured entity/key/value lookup + FTS5
        ├── files       — workspace document vector search
        └── lcm         — full-text search over lossless messages + summaries
        │
        ▼
    Combined results — all backends in parallel
```

### Four-Phase Search Pipeline (Graph Layer)

1. **Entity + Intent** (score 95): Query matches known entity AND intent keyword (birthday, phone, port, stack)
2. **Entity Facts** (score 70): Query matches entity via aliases → return all facts
3. **FTS Facts** (score 50): Full-text search across `facts_fts`
4. **FTS Relations** (score 40): Full-text search across relations

### Alias-Based Entity Resolution

- Word-boundary matching (`\b`) prevents false positives
- Case-insensitive (`COLLATE NOCASE`)
- Entity normalization via gazetteer in metabolism plugin

### Activation-Based Ranking

- **Hot** (>2.0): Highly accessed, always retrieved
- **Warm** (1.0-2.0): Moderately accessed
- **Cool** (<1.0): Rarely accessed, candidate for pruning

---

## 6. Memory Consolidation / Summarization

### Upward Flow (Raw → Curated → Structured)

```
Daily logs → active-context.md → MEMORY.md → facts.db
(raw)        (working memory)    (curated)   (structured)

Session work → phase close → project-{slug}.md
(ephemeral)   (PM gate)      (institutional)
```

### LCM Summary DAG

- Messages fill context window → LCM creates **leaf summaries** (depth 0) from oldest messages
- Leaf summaries accumulate → merged into **higher-level summaries** (depth 1, 2, ...)
- Context assembly walks DAG per turn to select most relevant summaries
- **Nothing deleted** — originals recoverable by drilling into summaries

### Metacognitive Pipeline (Automated Consolidation)

```
Conversation → Metabolism (extract facts + gaps)
                    ↓                    ↓
              facts.db            pending-gaps.json
              (superseded_at        ↓
               invalidation)   Nightshift cron (23:00-08:00)
                                     ↓
                              Contemplation (3-pass: explore → reflect → synthesize)
                                     ↓
                              Growth Vectors (19 active, deduped from 902 via Jaccard)
                                     ↓
                              Crystallization (30+ day gate → permanent traits)
```

### Daily Log Importance Tagging

```markdown
- [decision|i=0.9] Switched to nomic-embed-text-v2-moe
- [lesson|i=0.7] llama.cpp requires prefixes for v2 model
- [context|i=0.3] Routine maintenance
```

Retention: i≥0.8 permanent, 0.4≤i<0.8 → 30 days, i<0.4 → 7 days

---

## 7. API Endpoints / Tool Interfaces

The system exposes tools through the **OpenClaw plugin system** (not a REST API):

### Primary Tool: `memory_search`
```
memory_search(query: "...", systems: "continuity,facts,files,lcm")
```
- Default: searches all four backends in parallel
- Configurable: comma-separated subset to narrow scope

### LCM Deep-Dive Tools
| Tool | Purpose |
|------|---------|
| `lcm_grep` | Regex/full-text search (standalone) |
| `lcm_describe` | Inspect specific summary metadata |
| `lcm_expand` | Traverse DAG to recover compressed detail |
| `lcm_expand_query` | Sub-agent answers from expanded context (~120s) |

### Plugin Hooks (not user-facing)
- `before_agent_start` — Graph-memory injects `[GRAPH MEMORY]` block
- `prependSystemContext` — Continuity/Stability inject context
- Metabolism cron (every 5 min) — Extracts facts and gaps

### Graph Search (subprocess)
```bash
python3 scripts/graph-search.py --json "query text"
```
Called by the plugin with 2s timeout, filters score ≥ 65.

---

## 8. Testing Strategies

### 60-Query Benchmark Suite

Categories: PEOPLE, TOOLS, PROJECTS, FACTS, OPERATIONAL, IDENTITY, DAILY

| Strategy | Accuracy |
|----------|----------|
| BM25 only (QMD) | 46.7% |
| Graph only | 96.7% |
| Hybrid (Graph + BM25) | **100%** (60/60) |

### Script: `memory-benchmark.py`
- Runs search queries against all backends
- Compares results against expected ground truth
- Used to validate search pipeline after changes

### Guardrails Testing (Metabolism)
- 13 guardrails enforced on fact insertion
- Blocked keys: `gateway_status`, `node_status`, `model_setting`, etc.
- Entity minimum length enforcement
- Numeric value filter
- 16 explicitly blocked key patterns

---

## 9. Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| Embedding latency | ~7ms | GPU (nomic-embed-text-v2-moe via llama.cpp) |
| Previous embedding latency | ~500ms | ONNX CPU (all-MiniLM-L6-v2, 384d) — 70x improvement |
| Facts lookup (exact) | <1ms | SQLite indexed query |
| Continuity recall | ~7ms | sqlite-vec similarity search |
| Graph memory injection | ~2s | subprocess spawn + search + filter |
| LightRAG domain query | ~200ms | PostgreSQL + pgvector |
| LCM expand query | ~120s | Sub-agent traverses DAG (for precision) |
| Context token budget | ~200K | Full context window assembly |
| Cloud API cost | $0 | All embeddings local; only LLM extraction costs |

### Context Optimization Achievement

| File | Before | After | Savings |
|------|--------|-------|---------|
| MEMORY.md | 12.4KB | 3.5KB | -72% |
| AGENTS.md | 14.7KB | 4.3KB | -70% |
| **Total** | 27.1KB | 7.8KB | ~6,500 tokens/session saved |

### Scale (at documentation time)

- facts.db: 3,108 facts, 1,009 relations, 275 aliases
- Continuity: 2,065 exchanges
- LightRAG: 4,909 entities, 6,089 relations
- Daily logs: 74 source files ingested

---

## 10. Lessons for C# .NET 8+ / SQLite + FTS5 Implementation

### Direct Adaptations (High Value)

1. **Entity/Key/Value schema with FTS5** — The `facts` table design maps directly to SQLite in C#. Use `Microsoft.Data.Sqlite` with FTS5 virtual tables and the trigger-based sync pattern shown above.

2. **14-category taxonomy** — Fixed category enum enforced at the application layer. In C#, model as an enum with `[AllowedValues]` validation.

3. **Activation/Decay system** — Schema-ready columns (`activation`, `decay_score`, `importance`) with cron-based decay. In .NET, use a `BackgroundService` or Hangfire for periodic decay.

4. **Alias-based entity resolution** — Simple aliases table with `COLLATE NOCASE`. Cheap word-boundary matching enables fuzzy entity lookup without embeddings. Model as a separate table with composite key.

5. **Four-phase search pipeline** — Entity+Intent → Entity → FTS → Relations. Implementable as a `SearchPipeline` with scored results merged. Short-circuit when high-confidence match found.

6. **Changelog/audit trail** — `facts_changelog` table captures mutations. Essential for debugging LLM-generated fact writes. Map to an append-only audit table.

7. **Importance-tagged retention** — Daily log entries with `i=0.9` importance scores. Drives TTL-based cleanup. Model as a `float` property with configurable thresholds.

### Architecture Patterns to Adopt

8. **"Right tool for the query" philosophy** — Don't force everything through vector search. Exact lookups (entity/key) should be instant structured queries; only use semantic search for fuzzy recall.

9. **Unified search facade** — One entry point dispatches to multiple backends in parallel. In C#, use `Task.WhenAll` with multiple `ISearchBackend` implementations.

10. **File-based identity + DB-based knowledge** — Keep curated files (MEMORY.md equivalent) for human-editable context. Use SQLite for machine-written structured knowledge.

11. **Lossless context + summary DAG** — Store all messages, build summaries on compaction. Tree structure enables drill-down. Map to a `Summaries` table with `depth` and `parent_id` columns.

12. **Context budgeting** — Allocate token pools to different memory tiers. Priority-tiered: identity first, then working memory, then search results.

### Key Lessons / Warnings

13. **"Structure beats embeddings"** — For 80% of queries (exact lookups, entity facts), a well-indexed SQLite DB with aliases outperforms expensive vector search. Reserve embeddings for genuine fuzzy recall.

14. **Hebbian decay is hard to get right** — OpenClaw has the schema but the ranking integration is still a stub after months. Don't over-invest in decay before core retrieval works.

15. **Fact quality is the bottleneck** — Metabolism produces operational noise ("gateway_status", "model_setting") as facts. Extensive guardrails (13+ rules) needed. In C#, implement a `FactValidationPipeline` with ordered validators.

16. **`superseded_at` invalidation** — Facts are never deleted, just marked superseded. Handles contradictions cleanly. Model as nullable `DateTime? SupersededAt` with filtered queries.

17. **Single DB vs. Multiple DBs** — They tried single-DB consolidation (v2.2), then backed away for domain-specific stores. For a simpler system, starting with one DB is fine but design for later separation.

18. **Security concern: stored prompt injection** — Continuity injects raw past messages without sanitization. Single-user is low risk; multi-user requires scrubbing.

---

## Summary Verdict

OpenClaw's memory architecture is a **production-tested, iteratively evolved system** that demonstrates:

- SQLite + FTS5 is entirely sufficient for structured memory at personal-agent scale (3K+ facts)
- Hybrid search (graph + keyword + vector) achieves 100% recall where any single approach fails
- The "layers for different query patterns" principle is sound and well-validated
- Automated fact extraction (metabolism) requires extensive guardrails
- Lossless context (summary DAG) is architecturally elegant but complex to implement
- Local embeddings eliminate API costs with better latency (7ms vs 200ms)

**For our C# .NET 8+ implementation**: The facts.db schema, four-phase search pipeline, activation/decay model, and unified search facade are directly portable. Start with Layers 1-5 (files + structured facts + FTS5) before investing in vector search or metacognitive pipelines.
