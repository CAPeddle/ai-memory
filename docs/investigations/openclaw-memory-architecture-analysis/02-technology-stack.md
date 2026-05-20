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

