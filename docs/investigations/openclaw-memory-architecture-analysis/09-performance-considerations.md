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

