# Investigation: AI Memory Service Architecture

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Draft |
| **Scope** | Full system architecture for ai-memory service |
| **Stakeholders** | BIMcollab development team |

---

## 1. Executive Summary

This document defines the architecture for **ai-memory** — a general-purpose memory service that AI agents (primarily GitHub Copilot) use to retain and recall facts about development across C++/C# projects. The service is accessible via MCP (Model Context Protocol) and REST API.

The core philosophy: **memories never decay**. Unlike systems inspired by cognitive science forgetting curves (e.g., the Alfred architecture), ai-memory treats all stored knowledge as permanently valuable. Recency serves only as a tiebreaker, never as a penalty.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI AGENT CLIENTS                            │
│  (GitHub Copilot, VSCode extensions, CLI tools)                     │
└────────────────┬────────────────────────────┬───────────────────────┘
                 │ MCP Protocol                │ REST API
                 ▼                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ MCP Server   │  │ REST Server  │  │ Auth / Project Scoping   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MEMORY ENGINE CORE                             │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Ingest Pipeline  │  │ Recall Engine    │  │ Consolidation   │  │
│  │                  │  │                  │  │ Pipeline        │  │
│  │ • Teach (user)   │  │ • Hybrid search  │  │                 │  │
│  │ • Observe (auto) │  │ • MMR diversity  │  │ • Pattern detect│  │
│  │ • Session log    │  │ • Source mixing  │  │ • Promotion     │  │
│  │ • Dedup check    │  │ • Recall logging │  │ • Scoring       │  │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        STORAGE LAYER                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   SQLite Database                             │  │
│  │                                                              │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐  │  │
│  │  │ semantic_    │ │ episodic_    │ │ recall_events       │  │  │
│  │  │ memories     │ │ memories     │ │                     │  │  │
│  │  └──────────────┘ └──────────────┘ └─────────────────────┘  │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐  │  │
│  │  │ FTS5 index   │ │ projects     │ │ consolidation_log   │  │  │
│  │  │              │ │              │ │                     │  │  │
│  │  └──────────────┘ └──────────────┘ └─────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Vector Store (Embeddings)                        │  │
│  │              sqlite-vec or in-process HNSW                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Memory Types and Schemas

### 3.1 Semantic Memory (Evergreen Facts)

Permanent truths about projects, tools, conventions, and patterns. These never expire.

```sql
CREATE TABLE semantic_memories (
    id              TEXT PRIMARY KEY,  -- ULID for time-sortable unique IDs
    content         TEXT NOT NULL,     -- The fact in natural language
    embedding       BLOB,             -- Vector embedding for semantic search
    source          TEXT NOT NULL,     -- 'user_taught' | 'promoted' | 'observed'
    project         TEXT,             -- NULL = cross-project, else project slug
    tags            TEXT,             -- JSON array of tags
    confidence      REAL DEFAULT 1.0, -- 0.0–1.0, user-taught starts at 1.0
    created_at      TEXT NOT NULL,     -- ISO 8601
    updated_at      TEXT NOT NULL,     -- ISO 8601
    promoted_from   TEXT,             -- episodic_memory ID if promoted
    recall_count    INTEGER DEFAULT 0, -- Times this memory was returned in search
    last_recalled   TEXT,             -- ISO 8601 of last recall
    supersedes      TEXT,             -- ID of memory this corrects/replaces
    active          INTEGER DEFAULT 1  -- 0 = soft-deleted/corrected
);
```

**Examples:**
| content | source | project |
|---------|--------|---------|
| "The zoom project uses CMake 3.25+" | user_taught | zoom |
| "Conan v2 profiles are in ~/.conan2/profiles" | user_taught | NULL |
| "BCF Manager uses .NET 8" | user_taught | bcf-managers |
| "libxml2 must be linked with ICU on macOS" | promoted | zoom |

### 3.2 Episodic Memory (Session Logs)

Records of specific development sessions. Each episode captures what happened, what was learned, and the context.

```sql
CREATE TABLE episodic_memories (
    id              TEXT PRIMARY KEY,  -- ULID
    session_id      TEXT NOT NULL,     -- Groups entries from same session
    content         TEXT NOT NULL,     -- What happened / was learned
    embedding       BLOB,             -- Vector embedding
    project         TEXT,             -- Project context
    tags            TEXT,             -- JSON array of tags
    occurred_at     TEXT NOT NULL,     -- When this happened (ISO 8601)
    created_at      TEXT NOT NULL,     -- When stored (ISO 8601)
    agent_context   TEXT,             -- JSON: agent type, tool, file context
    promoted        INTEGER DEFAULT 0, -- 1 if promoted to semantic memory
    recall_count    INTEGER DEFAULT 0,
    last_recalled   TEXT
);
```

**Examples:**
| content | project | occurred_at |
|---------|---------|-------------|
| "Refactored BCF import module; discovered it depends on libxml2" | bcf-managers | 2025-04-15T14:30:00Z |
| "Fixed CMake find_package for Conan 2 — needed CMAKE_PREFIX_PATH from toolchain" | zoom | 2025-04-18T09:15:00Z |

### 3.3 Recall Events

Every search hit is logged to feed the consolidation pipeline.

```sql
CREATE TABLE recall_events (
    id              TEXT PRIMARY KEY,
    memory_id       TEXT NOT NULL,     -- FK to semantic or episodic memory
    memory_type     TEXT NOT NULL,     -- 'semantic' | 'episodic'
    query           TEXT NOT NULL,     -- The search query that triggered recall
    query_embedding BLOB,             -- Embedding of the query
    project_context TEXT,             -- What project the agent was working in
    relevance_score REAL,             -- How relevant the result was (search score)
    position        INTEGER,          -- Rank position in results
    recalled_at     TEXT NOT NULL,     -- ISO 8601
    feedback        TEXT              -- 'helpful' | 'irrelevant' | NULL (no feedback)
);
```

### 3.4 Projects Registry

```sql
CREATE TABLE projects (
    slug            TEXT PRIMARY KEY,  -- e.g., 'zoom', 'bcf-managers', 'conan-libs'
    display_name    TEXT NOT NULL,
    description     TEXT,
    build_system    TEXT,             -- 'cmake' | 'msbuild' | 'xcode'
    languages       TEXT,             -- JSON array: ["c++", "c#"]
    created_at      TEXT NOT NULL
);
```

---

## 4. Consolidation Pipeline (Pattern Promotion)

The consolidation pipeline reviews episodic memories and promotes recurring patterns into semantic memory. This runs on a scheduled basis (configurable, default: after every N sessions or on explicit trigger).

### 4.1 Pipeline Stages

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. CANDIDATE   │────▶│  2. SCORING     │────▶│  3. PROMOTION   │
│     DETECTION   │     │                 │     │                 │
│                 │     │  • Frequency    │     │  • Deduplicate  │
│  • Cluster      │     │  • Diversity    │     │  • Merge facts  │
│    episodic     │     │  • Relevance    │     │  • Create       │
│    embeddings   │     │  • Recency tie  │     │    semantic     │
│  • Find themes  │     │                 │     │  • Link source  │
│  • Extract facts│     │  Score ≥ 0.7?   │     │    episodes     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │ No
                                 ▼
                        ┌─────────────────┐
                        │  SKIP           │
                        │  (re-evaluate   │
                        │   next cycle)   │
                        └─────────────────┘
```

### 4.2 Promotion Scoring

Each candidate receives a composite score based on three factors:

| Factor | Weight | Description | Measurement |
|--------|--------|-------------|-------------|
| **Frequency** | 0.40 | How often a pattern surfaces in episodic memory | Count of similar episodes (cosine similarity > 0.85) |
| **Diversity** | 0.35 | Appears across different projects or contexts | Count of distinct projects/sessions where observed |
| **Relevance** | 0.25 | How useful the fact was when recalled | Recall count + positive feedback ratio |

**Composite Score Formula:**

```
score = (0.40 × normalized_frequency) +
        (0.35 × normalized_diversity) +
        (0.25 × normalized_relevance)
```

- All factors normalized to [0.0, 1.0]
- Promotion threshold: `score ≥ 0.7`
- Near-threshold candidates (0.5–0.7) are flagged for optional user confirmation

### 4.3 Consolidation Log

```sql
CREATE TABLE consolidation_log (
    id              TEXT PRIMARY KEY,
    run_at          TEXT NOT NULL,
    candidates      INTEGER,          -- Number of candidates evaluated
    promoted        INTEGER,          -- Number promoted
    skipped         INTEGER,          -- Number skipped
    details         TEXT              -- JSON array of decisions with reasoning
);
```

### 4.4 User Override

Users can:
- Force-promote an episodic memory to semantic (`promote <id>`)
- Block a pattern from auto-promotion
- Adjust promotion threshold per-project

---

## 5. Recall Tracking and Promotion Scoring

### 5.1 Recall Flow

```
Agent query arrives
        │
        ▼
┌─────────────────┐
│  Search both    │
│  semantic +     │
│  episodic       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rank + MMR     │
│  diversify      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Return results │────▶│  Log recall     │
│  to agent       │     │  events         │
└─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Update recall  │
                        │  counts on      │
                        │  memories       │
                        └─────────────────┘
```

### 5.2 Feedback Loop

After returning results, agents can optionally report feedback:
- `helpful` — the memory was used in the response
- `irrelevant` — the memory was ignored

This feedback directly influences the relevance score in the consolidation pipeline.

---

## 6. Search / Retrieval Strategy

### 6.1 Hybrid Search (FTS5 + Semantic)

Search uses a hybrid approach combining full-text search (exact keyword matching) with semantic search (embedding similarity):

```
┌─────────────────────────────────────────────────────┐
│                  QUERY INPUT                         │
│  "How does the zoom project handle conan deps?"     │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐      ┌───────────────┐
│  FTS5 Search  │      │  Vector Search│
│  (BM25 rank)  │      │  (cosine sim) │
│               │      │               │
│  Keywords:    │      │  Embedding of │
│  zoom, conan, │      │  full query   │
│  deps         │      │               │
└───────┬───────┘      └───────┬───────┘
        │                      │
        └───────────┬──────────┘
                    ▼
        ┌───────────────────┐
        │  Reciprocal Rank  │
        │  Fusion (RRF)     │
        │                   │
        │  Combined score = │
        │  Σ 1/(k + rank_i) │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │  MMR Diversity    │
        │  Re-ranking       │
        └─────────┬─────────┘
                  │
                  ▼
        ┌───────────────────┐
        │  Final Results    │
        │  (top N, diverse) │
        └───────────────────┘
```

### 6.2 Reciprocal Rank Fusion (RRF)

Combines FTS5 and vector search rankings without needing score normalization:

```
RRF_score(d) = Σ  1 / (k + rank_i(d))
               i∈{fts, vector}

k = 60 (standard constant)
```

### 6.3 MMR Diversity (Pattern Separation)

Maximal Marginal Relevance prevents near-duplicate results from dominating:

```
MMR = argmax[λ · sim(d, q) - (1-λ) · max(sim(d, d_selected))]

λ = 0.7 (tunable — higher favors relevance over diversity)
```

At each step, the next result chosen maximizes a balance between:
- Relevance to the query (first term)
- Dissimilarity to already-selected results (second term)

### 6.4 Search Filters

Queries accept optional filters:
- `project` — scope to a specific project
- `memory_type` — `semantic`, `episodic`, or `all`
- `tags` — filter by tags
- `date_range` — for episodic memories
- `min_confidence` — minimum confidence threshold

### 6.5 Recency as Tiebreaker

When two results have equal combined scores (within ε = 0.01), the more recently created memory ranks higher. This is the **only** role recency plays — it is never a decay factor.

---

## 7. Source Mixing Across Projects

### 7.1 Multi-Project Awareness

The memory service stores memories from all projects in a unified store but maintains project attribution:

| Scope | Description | Example |
|-------|-------------|---------|
| **Project-specific** | Facts about one project | "zoom uses Qt 6.5 for the UI layer" |
| **Cross-project** | Facts that apply broadly | "Our CI uses GitHub Actions with self-hosted runners" |
| **Cross-pollination** | Patterns from one project useful in another | "The pattern we used for async loading in zoom also works for BCF import" |

### 7.2 Query-Time Source Mixing

When an agent queries from a specific project context:

1. **Primary results** — memories tagged with that project (boosted 1.2×)
2. **Cross-project results** — memories with `project = NULL` (no boost)
3. **Adjacent results** — memories from other projects that are semantically relevant (no penalty, but not boosted)

This ensures that working on the zoom project surfaces zoom-specific knowledge first, but doesn't hide broadly useful facts or relevant discoveries from other projects.

### 7.3 Project Inference

If an agent doesn't explicitly specify a project, the service infers from:
1. File paths mentioned in the query context
2. Build system markers (CMakeLists.txt → cmake projects, .csproj → .NET projects)
3. Package references (conan requires → conan libraries)

---

## 8. The "No Forgetting" Philosophy

### 8.1 Comparison with Alfred

| Aspect | Alfred (Forgetting Curve) | ai-memory (No Forgetting) |
|--------|--------------------------|---------------------------|
| **Temporal decay** | Memories lose strength over time | No decay — all memories retain full weight |
| **Recall refresh** | Recalling a memory resets its decay | Recall only logs events for analytics |
| **Old memories** | Gradually become unreachable | Always equally accessible |
| **Storage growth** | Self-pruning via decay | Grows monotonically (managed by dedup + archival) |
| **Search weight** | Recency heavily weighted | Recency only as tiebreaker |
| **Philosophy** | "Forgetting is healthy" | "Nothing learned should be lost" |

### 8.2 Rationale

For a development memory service:
- A CMake quirk discovered 2 years ago is just as relevant when hit again today
- Build system knowledge doesn't expire — versions change, but the old fact was true at the time
- Team conventions from early in a project remain context-valuable
- "We tried X and it didn't work" is permanently useful to avoid re-attempting

### 8.3 Managing Unbounded Growth

Without decay, storage grows indefinitely. Mitigations:

1. **Deduplication at ingest** — Reject semantically identical new memories (cosine similarity > 0.95 to existing)
2. **Supersession** — When a fact is corrected, the old version is soft-deleted (`active = 0`) but retained for audit
3. **Archival threshold** — After configurable period (e.g., 2 years) with zero recalls, memories are moved to cold storage (still searchable but not in primary index)
4. **Explicit pruning** — Users can delete memories they know are obsolete
5. **Embedding compaction** — Periodic re-embedding with latest model to maintain quality

### 8.4 Corrections Model

When a user corrects a fact:
```
Old: "zoom uses CMake 3.21+"
New: "zoom uses CMake 3.25+" (supersedes old)
```

The old memory gets `active = 0` and the new memory's `supersedes` field links to it. This preserves history while ensuring search only returns current facts.

---

## 9. API Surface

### 9.1 MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `memory_teach` | Store a user-taught fact | `content`, `project?`, `tags?` |
| `memory_log_episode` | Record a session observation | `content`, `session_id`, `project?`, `tags?` |
| `memory_search` | Search all memories | `query`, `project?`, `type?`, `limit?`, `tags?` |
| `memory_correct` | Correct/update a fact | `memory_id`, `new_content` |
| `memory_delete` | Soft-delete a memory | `memory_id` |
| `memory_list` | List memories with filters | `project?`, `type?`, `tags?`, `page?` |
| `memory_inspect` | Get full details of a memory | `memory_id` |
| `memory_feedback` | Report recall usefulness | `recall_event_id`, `feedback` |
| `memory_promote` | Force-promote episodic → semantic | `episodic_id` |
| `memory_consolidate` | Trigger consolidation pipeline | `dry_run?` |
| `memory_projects` | List known projects | — |
| `memory_stats` | Usage statistics | `project?` |

### 9.2 REST API Endpoints

```
POST   /api/v1/memories              — Create (teach or log)
GET    /api/v1/memories/search       — Hybrid search
GET    /api/v1/memories/:id          — Get by ID
PATCH  /api/v1/memories/:id          — Update / correct
DELETE /api/v1/memories/:id          — Soft delete

POST   /api/v1/episodes              — Log episode
GET    /api/v1/episodes?session=X    — Get session episodes

POST   /api/v1/recall/:id/feedback   — Submit feedback
GET    /api/v1/recall/events         — List recall events

POST   /api/v1/consolidate           — Trigger consolidation
GET    /api/v1/consolidate/log       — Consolidation history

GET    /api/v1/projects              — List projects
POST   /api/v1/projects              — Register project

GET    /api/v1/stats                 — System statistics
```

### 9.3 MCP Resources (Read-Only Context)

| Resource URI | Description |
|--------------|-------------|
| `memory://facts/{project}` | All active semantic facts for a project |
| `memory://recent-episodes` | Last N episodes across all projects |
| `memory://stats` | Memory system statistics |

---

## 10. Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Primary DB** | SQLite | Single-file, zero-config, excellent FTS5, suits single-machine deployment |
| **FTS** | SQLite FTS5 | Built-in, BM25 ranking, fast for our scale |
| **Vector store** | sqlite-vec extension | Keeps everything in one DB file, HNSW index |
| **Embeddings** | OpenAI text-embedding-3-small (or local alternative) | Good quality/cost ratio; 1536 dimensions |
| **API framework** | ASP.NET Core minimal API (C#) or FastAPI (Python) | Team familiarity; TBD in ExecPlan |
| **MCP SDK** | Official MCP C# or TypeScript SDK | Protocol compliance |
| **ID generation** | ULID | Time-sortable, globally unique, no coordination |

---

## 11. Data Flow Examples

### 11.1 User Teaches a Fact

```
User: "Remember that the zoom project requires Qt 6.5 or higher"
  │
  ▼
memory_teach(content="zoom project requires Qt 6.5+", project="zoom")
  │
  ▼
┌─────────────────────┐
│ 1. Generate embedding│
│ 2. Dedup check      │ ← cosine sim < 0.95 to all existing? proceed
│ 3. Insert semantic  │
│ 4. Return ID        │
└─────────────────────┘
```

### 11.2 Agent Observes During Session

```
Agent working on zoom CMake configuration discovers a fact
  │
  ▼
memory_log_episode(
  content="Qt6_DIR must be set before find_package(Qt6) in CMake",
  session_id="sess_01HXY...",
  project="zoom"
)
  │
  ▼
┌─────────────────────┐
│ 1. Generate embedding│
│ 2. Insert episodic  │
│ 3. Return ID        │
└─────────────────────┘
```

### 11.3 Consolidation Promotes a Pattern

```
Consolidation pipeline runs (scheduled or triggered)
  │
  ▼
┌─────────────────────────────────────────────┐
│ 1. Cluster recent episodic memories         │
│ 2. Find cluster: 4 episodes mention         │
│    "Qt6_DIR needed before find_package"     │
│    across zoom and bcf-managers projects    │
│ 3. Score: freq=0.8, diversity=0.9, rel=0.6 │
│    composite = 0.78 ≥ 0.7 threshold        │
│ 4. Generate consolidated fact               │
│ 5. Insert into semantic_memories            │
│    source='promoted', project=NULL          │
│ 6. Mark source episodes promoted=1          │
└─────────────────────────────────────────────┘
```

---

## 12. Open Questions and Trade-offs

### 12.1 Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | **Implementation language?** | C# (.NET 8) vs Python vs TypeScript | Affects team velocity, MCP SDK choice, deployment |
| 2 | **Embedding model hosting?** | Cloud API (OpenAI) vs local (ONNX) vs hybrid | Cost, latency, offline capability |
| 3 | **Consolidation trigger?** | Scheduled (cron) vs event-driven (every N episodes) vs manual-only | Automation vs control |
| 4 | **Multi-user?** | Single-user local vs shared team service | Schema changes, auth requirements |
| 5 | **Where does the DB live?** | User home dir vs project-adjacent vs cloud-synced | Portability, backup, sharing |
| 6 | **Embedding drift?** | Re-embed everything when model changes vs dual-index | Migration complexity, quality |
| 7 | **Confidence scoring for observations?** | Agent self-reported vs inferred from context | Accuracy of auto-promoted facts |
| 8 | **Session boundary detection?** | Explicit start/stop vs inferred from time gaps | Episodic grouping accuracy |

### 12.2 Trade-offs

| Trade-off | Choice A | Choice B | Recommendation |
|-----------|----------|----------|----------------|
| **Storage vs Precision** | Store everything raw | Deduplicate aggressively | Moderate dedup (0.95 threshold) — preserve nuance |
| **Search speed vs Quality** | FTS only (fast) | Always include vector search (slower) | Hybrid with RRF — quality wins for our scale |
| **Promotion automation** | Fully automatic | Always require user confirmation | Auto with threshold; flag borderline cases |
| **Embedding dimension** | 1536 (higher quality) | 256 (faster, smaller) | 1536 — storage is cheap, quality matters |
| **Cross-project visibility** | Strict project isolation | Everything visible always | Visible with project boosting — knowledge should flow |

### 12.3 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Embedding model deprecation | Medium | Abstract embedding behind interface; store model version per memory |
| SQLite concurrency limits | Low | Single-writer is fine for our use case; WAL mode for concurrent reads |
| False promotions (garbage in semantic) | Medium | Require minimum recall count before promotion; user can demote |
| Storage growth over years | Low | Archival pipeline + cold storage for zero-recall aged memories |
| Search quality degrades at scale | Medium | Monitor recall feedback; periodic re-indexing; tune MMR λ |

---

## 13. Next Steps for ExecPlan

1. **Decide implementation language** — drives all subsequent tooling choices
2. **Set up project scaffold** — solution structure, dependencies, build
3. **Implement storage layer** — SQLite schema, migrations, repository pattern
4. **Implement embedding pipeline** — model choice, generation, storage
5. **Implement search** — FTS5 + vector hybrid with RRF
6. **Implement MCP server** — tool definitions, protocol handling
7. **Implement REST API** — endpoints, validation, error handling
8. **Implement consolidation pipeline** — clustering, scoring, promotion
9. **Integration testing** — end-to-end flows with realistic data
10. **Documentation** — API docs, deployment guide, usage examples
