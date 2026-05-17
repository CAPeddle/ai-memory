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

