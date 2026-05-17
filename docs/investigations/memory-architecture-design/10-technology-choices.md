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

