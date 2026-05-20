## Context

The system introduces **hybrid retrieval** combining three independent relevance signals:

- **Lexical retrieval** via BM25 (keyword-based)
- **Semantic retrieval** via vector similarity (embeddings)
- **Structural retrieval** via hierarchy/graph-based similarity

These signals are combined using **Reciprocal Rank Fusion (RRF)** to produce final ranked results.

This shifts the system from a traditional database into a **multi-index retrieval architecture**, where the same logical entity must be accessed efficiently via multiple representations.

---

