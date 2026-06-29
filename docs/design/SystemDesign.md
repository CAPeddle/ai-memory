---
name: "System Design Overview — ai-memory"
summary: "High-level architecture, component descriptions, data flow, and storage schema for the ai-memory service"
asset_type: "design"
status: "active"
version: "1.0"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/SystemDesign.md"
created: "2026-05-15"
---

# System Design Overview — ai-memory

**Version:** 1.0  
**Date:** 2026-05-15  
**Status:** Active

This document is the high-level design reference for ai-memory. For binding architectural decisions, see the ADR index in §5. For requirements, see [docs/requirements/SRS.md](../requirements/SRS.md).

---

## §1. Architecture Overview

ai-memory is a **local-first personal memory service** built on C#/.NET 8. It runs as a single ASP.NET Core process that hosts both a REST API and an MCP server over the same service layer and shared SQLite database.

### Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                    │
│  AI Agents (GitHub Copilot, Claude) │  Developer tools │  CI/Automation │
│  via MCP protocol                   │  via REST HTTP   │  via REST HTTP  │
└────────────────┬────────────────────┴──────────────────┴────────────────┘
                 │ MCP (stdio / HTTP)           │ HTTP (REST)
                 ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      TRANSPORT LAYER                                    │
│  ┌─────────────────────────┐   ┌────────────────────────────────────┐  │
│  │ MCP Server              │   │ REST API (ASP.NET Core Minimal API)│  │
│  │ Tools + Resources       │   │ /api/v1/... endpoints              │  │
│  │ (thin facade only)      │   │ Swagger (dev mode only)            │  │
│  └────────────┬────────────┘   └──────────────────┬─────────────────┘  │
└───────────────┼────────────────────────────────────┼────────────────────┘
                └─────────────────┬──────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                                     │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │ IMemoryService│  │ ISearchEngine    │  │ IStoryboardService       │ │
│  │               │  │ (Hybrid Search)  │  │ (CRUD + state machine)   │ │
│  │ Teach         │  │                  │  │                          │ │
│  │ LogEpisode    │  │ BM25 (FTS5)      │  │ IConsolidationService    │ │
│  │ Correct       │  │ Vector (sqlite-v)│  │                          │ │
│  │ Delete        │  │ RRF (k=60)       │  │ ISynthesisService        │ │
│  │ Inspect       │  │ MMR (λ=0.7)      │  │ (view generation)        │ │
│  │ Promote       │  │ Structural filter│  │                          │ │
│  └──────┬────────┘  └────────┬─────────┘  └────────────────┬─────────┘ │
└─────────┼────────────────────┼─────────────────────────────┼────────────┘
          └────────────────────┴─────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                IMemoryStore (abstraction)                         │  │
│  │  SqliteMemoryStore (default) ◄──────► PgMemoryStore (upgrade)   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    SQLite Database                                │  │
│  │  semantic_memories │ episodic_memories │ recall_events           │  │
│  │  consolidation_log │ projects          │ stories                 │  │
│  │  entities          │ chunk_entities    │ edges                   │  │
│  │  FTS5 index (fts_memories)             │ sqlite-vec (vectors)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                  ┌───────────────┴──────────────────┐
                  ▼                                   ▼
┌────────────────────────┐              ┌─────────────────────────────┐
│  IEmbeddingService     │              │  ILlmClient                 │
│  (Ingest + Search)     │              │  (Synthesis + Entity Ext.)  │
│  OpenAI (default)      │              │  Ollama (default, $0)       │
│  Ollama (optional $0)  │              │  OpenAI / OpenRouter ($opt) │
└────────────────────────┘              └─────────────────────────────┘
                                  │
                    ┌─────────────┴────────────────┐
                    ▼                              ▼
       ┌────────────────────────┐    ┌──────────────────────────┐
       │  Wiki View (Markdown)  │    │  Storyboard View         │
       │  ~/.ai-memory/views/   │    │  (Markdown + REST/MCP)   │
       │  Obsidian-compatible   │    │  Professional + Personal │
       └────────────────────────┘    └──────────────────────────┘
```

---

## §2. Component Descriptions

### 2.1 Transport Layer

| Component | Responsibility |
|-----------|---------------|
| **MCP Server** | Exposes MCP tools, resources, and prompts. All business logic delegated to `IMemoryService`/`IStoryboardService`. Supports stdio and HTTP/StreamableHTTP transports simultaneously. |
| **REST API** | ASP.NET Core Minimal API. Route prefix `/api/v1/`. Swagger enabled in development mode only. All responses use the `{ data, meta, errors }` envelope. Cursor-based pagination. |

### 2.2 Service Layer

| Interface | Responsibility |
|-----------|---------------|
| **`IMemoryService`** | Core memory operations: Teach, LogEpisode, Correct, Delete, Inspect, Promote, RecordFeedback. Fires domain events on write. |
| **`ISearchEngine`** | Hybrid search: BM25 lane + Vector lane fused via RRF (k=60) + MMR re-ranking (λ=0.7) + structural structural pre-filter. Returns `SearchResult` list with scores. |
| **`IStoryboardService`** | CRUD for stories table. State machine enforcement (todo→in-progress→review→done). WIP limit (1 per profile). Layered context projection. |
| **`IConsolidationService`** | Scores episodic memories, promotes qualifying candidates to semantic memories, writes consolidation log. Dry-run mode. |
| **`ISynthesisService`** | Triggered by domain events after memory write. Identifies affected views, fetches delta since last synthesis point, calls `ILlmClient`, writes Markdown files. Runs asynchronously. |
| **`IEmbeddingService`** | Generates vector embeddings for memory content. Default: OpenAI `text-embedding-3-small` (1,536 dimensions). Degrades gracefully (FTS5-only search) when unavailable. |
| **`ILlmClient`** | Calls language models for synthesis and entity extraction. Default: Ollama (local, $0). Optional: OpenAI / OpenRouter. |

### 2.3 Data Layer

| Component | Responsibility |
|-----------|---------------|
| **`IMemoryStore`** | Storage abstraction decoupling the engine from any specific backend. Configuration-driven selection. |
| **`SqliteMemoryStore`** | SQLite implementation. Uses FTS5 for BM25, sqlite-vec for vector search, relational tables for structural pre-filter. |
| **`PgMemoryStore`** | PostgreSQL implementation. Uses `pg_trgm` + `tsvector` for BM25, pgvector HNSW for vector search. (Phase 3 upgrade path.) |
| **`IDbConnectionFactory`** | Abstracts `SqliteConnection` creation and lifecycle. Services never open connections directly. |

---

## §3. Data Flow

### 3.1 Memory Ingest Flow

```
Client (REST POST /api/v1/memories OR MCP memory_teach)
  ↓
IMemoryService.TeachAsync(content, project?, tags?)
  ↓
IEmbeddingService.GetEmbeddingAsync(content)  [async; FTS5 ingest proceeds without it if unavailable]
  ↓
IMemoryStore.DedupCheckAsync(embedding)  [cosine sim > 0.95 → 409 Conflict]
  ↓
IMemoryStore.StoreSemanticAsync(memory)  [INSERT into semantic_memories]
  ↓
Domain event: MemoryStoredEvent(memoryId, project, tags)
  ↓ (async, non-blocking)
ISynthesisService.UpdateViewsAsync(event)  → ILlmClient → Markdown file write
IEntityExtractionService.ExtractAsync(event)  → INSERT into entities + chunk_entities
```

### 3.2 Hybrid Search Flow

```
Client (REST GET /api/v1/memories/search?q=... OR MCP memory_search)
  ↓
ISearchEngine.HybridSearchAsync(query, project?, type?, limit)
  ↓
[Parallel execution]
  ├── IEmbeddingService.GetEmbeddingAsync(query)
  │       ↓
  │   sqlite-vec KNN(k=N)  → [vector_results: id, cosine_score, rank]
  │
  └── FTS5 MATCH @query    → [fts_results: id, bm25_score, rank]
         ↓
  [Structural pre-filter applied if project/entity constraints present]
         ↓
  RRF fusion: score = Σ 1/(60 + rank_i) per document across both lanes
         ↓
  Project boost: same-project results × 1.2
         ↓
  MMR re-ranking (λ=0.7): remove near-duplicates (cosine >0.7 to already-selected)
         ↓
  SELECT top limit records, emit recall_event for each
         ↓
Return { data: [SearchResult[]], meta: { took_ms, total, cursor, degraded } }
```

### 3.3 Consolidation Flow

```
POST /api/v1/consolidate  [or scheduled trigger]
  ↓
IConsolidationService.RunAsync(dryRun)
  ↓
SELECT episodic_memories with recall_count >= 2 AND active = 1
  ↓
FOR EACH candidate:
  frequency_score = recall_count / max_recall_count_in_batch
  diversity_score = distinct_project_recall_count / total_projects
  relevance_score = helpful_feedback_count / total_feedback_count
  score = 0.40×freq + 0.35×div + 0.25×rel
    ↓
  score >= 0.7 → promote (if not dryRun):
    INSERT semantic_memory (source=auto-promoted, confidence=score)
    UPDATE episodic_memory SET active=0
    INSERT consolidation_log (decision=promoted)
    
  score 0.5–0.69 → INSERT consolidation_log (decision=flagged)
  score < 0.5    → INSERT consolidation_log (decision=skipped)
  ↓
Return ConsolidationResult { promoted, flagged, skipped, dryRun }
```

### 3.4 Story Pickup Flow (Agent)

```
Agent session start:
  1. Read MCP Resource memory://storyboard/professional
     → Returns: story IDs, titles, statuses (~500 tokens)
  
  2. Select a "todo" story; call MCP story_claim(storyId)
     → System: UPDATE stories SET status='in-progress' WHERE id=storyId
     → WIP limit check: 409 if another story already in-progress for this profile
  
  3. Call GET /api/v1/stories/:id for full detail
     → Returns: description, acceptance criteria, linked memory IDs, project
  
  4. Call memory_search(query related to story context) to pull relevant memory
  
  5. Execute story work; call story_complete(storyId) on completion
     → System: UPDATE stories SET status='done'
```

---

## §4. Storage Schema Summary

### Core Memory Tables

```sql
-- Semantic memories (Wiki tier -- evergreen facts)
CREATE TABLE semantic_memories (
    id          TEXT PRIMARY KEY,         -- ULID
    content     TEXT NOT NULL,
    project     TEXT,
    tags        TEXT,                      -- JSON array
    source      TEXT DEFAULT 'user-taught',-- user-taught | auto-promoted | observed
    confidence  REAL DEFAULT 1.0,
    active      INTEGER DEFAULT 1,
    recall_count INTEGER DEFAULT 0,
    last_recalled TEXT,
    embedding   BLOB,                      -- sqlite-vec managed
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    supersedes  TEXT                       -- ULID of prior version
);

-- Episodic memories (Shard tier -- raw observations)
CREATE TABLE episodic_memories (
    id          TEXT PRIMARY KEY,         -- ULID
    session_id  TEXT NOT NULL,
    content     TEXT NOT NULL,
    project     TEXT,
    tags        TEXT,                      -- JSON array
    agent_context TEXT,
    active      INTEGER DEFAULT 1,
    recall_count INTEGER DEFAULT 0,
    embedding   BLOB,                      -- sqlite-vec managed
    occurred_at TEXT NOT NULL
);

-- FTS5 full-text index (BM25)
CREATE VIRTUAL TABLE fts_memories USING fts5(
    content, project, tags,
    content='semantic_memories',
    content_rowid='rowid',
    tokenize='porter ascii'
);

-- Recall and feedback
CREATE TABLE recall_events (
    id              TEXT PRIMARY KEY,     -- ULID
    memory_id       TEXT NOT NULL,
    query           TEXT,
    relevance_score REAL,
    position        INTEGER,
    feedback        TEXT,                  -- helpful | irrelevant | NULL
    recalled_at     TEXT NOT NULL
);
```

### Structural Pre-Filter Tables

```sql
CREATE TABLE projects (
    slug         TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    build_system TEXT,
    languages    TEXT,                     -- JSON array
    created_at   TEXT NOT NULL
);

CREATE TABLE entities (
    id          TEXT PRIMARY KEY,         -- ULID
    name        TEXT NOT NULL,
    entity_type TEXT NOT NULL,            -- tool | project | person | pattern | concept | decision
    created_at  TEXT NOT NULL
);

CREATE TABLE chunk_entities (
    chunk_id   TEXT NOT NULL,             -- references memory id
    entity_id  TEXT NOT NULL,
    frequency  INTEGER DEFAULT 1,
    PRIMARY KEY (chunk_id, entity_id)
);
```

### Storyboard Tables

```sql
CREATE TABLE stories (
    id                  TEXT PRIMARY KEY, -- ULID
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT DEFAULT 'todo', -- todo | in-progress | review | done
    priority            TEXT DEFAULT 'medium', -- low | medium | high | critical
    profile             TEXT NOT NULL,    -- professional | personal
    project             TEXT,
    tags                TEXT,             -- JSON array
    acceptance_criteria TEXT,             -- JSON array of strings
    memory_ids          TEXT,             -- JSON array of ULID references
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
```

### Pipeline Tables

```sql
CREATE TABLE consolidation_log (
    id              TEXT PRIMARY KEY,
    episodic_id     TEXT NOT NULL,
    score           REAL NOT NULL,
    decision        TEXT NOT NULL,        -- promoted | flagged | skipped | rejected-duplicate
    promoted_to     TEXT,                 -- ULID of new semantic memory if promoted
    run_at          TEXT NOT NULL
);
```

---

## §5. ADR Reference Index

| ADR | Decision | File |
|-----|----------|------|
| [ADR-001](adr/ADR-001-language-stack.md) | C# 12 / .NET 8 as the sole implementation language | Language & Framework |
| [ADR-002](adr/ADR-002-storage-backend.md) | SQLite-first via `IMemoryStore` abstraction; PostgreSQL upgrade path | Storage Backend |
| [ADR-003](adr/ADR-003-hybrid-search.md) | BM25 + Vector via RRF (2-lane); Structural as pre-filter; MMR diversity | Hybrid Search |
| [ADR-004](adr/ADR-004-interface-design.md) | MCP facade over REST core; shared service layer; dual transport | Interface Design |
| [ADR-005](adr/ADR-005-memory-model.md) | Three-tier model (Shards + Wiki + Views); no-decay; soft-delete; ULID | Memory Model |
| [ADR-006](adr/ADR-006-views-architecture.md) | Views as projections over The Brain; REST/MCP canonical; Obsidian optional | Views Architecture |
| [ADR-007](adr/ADR-007-consolidation-pipeline.md) | 3-factor scoring (0.40 freq + 0.35 div + 0.25 rel); threshold ≥ 0.7 | Consolidation Pipeline |
| [ADR-008](adr/ADR-008-context-scoping.md) | Request-scoped context via `AsyncLocal`; `project:zoom,profile:professional,strict` | Context Scoping |
| [ADR-009](adr/ADR-009-deployment-model.md) | Docker Compose deployment; Postgres 15 + pgvector + AGE; health check endpoint | Deployment Model |
| [ADR-010](adr/ADR-010-authentication.md) | Bearer token API key auth on `/mcp`; `/health` unauthenticated | Authentication |
| [ADR-011](adr/ADR-011-storage-strategy.md) | PostgreSQL 15 + pgvector + Apache AGE; supersedes ADR-002 | Storage Strategy |
| [ADR-012](adr/ADR-012-tags-replace-binary-profile.md) | Replace binary `profile` with `tags: string[]`; GIN index for array queries | Tag Scoping |

---

## §6. Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-05-15 | ai-memory-maintainers | Initial System Design — synthesised from 12 investigation docs, 4 discussion ADRs, and approved SRS |
