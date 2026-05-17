### 6.1 Hybrid Search (FTS5 + Semantic)

Search uses a hybrid approach combining full-text search (exact keyword matching) with semantic search (embedding similarity):

See also: `docs/investigations/memsearch-applicability-review.md` for the ST-014 comparison against memsearch's Milvus-backed hybrid search and its recommendation to keep this hybrid direction while deferring staged recall ideas.

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

