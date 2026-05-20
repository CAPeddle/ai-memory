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

