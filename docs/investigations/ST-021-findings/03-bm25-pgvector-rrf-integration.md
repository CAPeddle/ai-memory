## §R2 — BM25 + pgvector RRF Integration

**Status: Validated. SQL pattern confirmed correct.**

### BM25 lane

PostgreSQL's `tsvector`/`tsquery` with `ts_rank_cd()` provides BM25-approximate ranking. The `search_vector` generated column (`to_tsvector('english', content)`) is indexed with GIN for fast `@@` matching.

```sql
SELECT id, ts_rank_cd(search_vector, query) AS bm25_score
FROM thoughts, plainto_tsquery('english', $query) AS query
WHERE search_vector @@ query AND active = true
ORDER BY bm25_score DESC LIMIT 60;
```

### Vector lane

pgvector HNSW with cosine distance (`<=>` operator). `1 - (embedding <=> $qEmb)` gives a similarity score in [0,1].

```sql
SELECT id, embedding <=> $qEmb::vector AS distance
FROM thoughts
WHERE active = true AND embedding IS NOT NULL
ORDER BY distance LIMIT 60;
```

### RRF fusion

`score = Σ 1/(k + rank_i)` where k=60. Both lanes contribute rank-independent scores; FULL OUTER JOIN ensures results appearing in only one lane still score.

```sql
WITH bm25 AS (...), vector AS (...)
SELECT COALESCE(b.id, v.id) AS id,
       COALESCE(1.0/(60+b.bm25_rank), 0) + COALESCE(1.0/(60+v.vector_rank), 0) AS rrf_score
FROM bm25 b FULL OUTER JOIN vector v ON b.id = v.id
ORDER BY rrf_score DESC LIMIT $limit;
```

**Full query:** `server/db/search.sql`

**Note on vector lane during spike:** Embeddings require an OpenRouter API key; the vector lane was validated structurally (query parses and executes) but not with real embeddings. Real 512-dim vectors will be tested in the first implementation story. BM25 lane tested with real inserted data and returns correct ranked results.

**Key finding:** OB1's `schemas/enhanced-thoughts/schema.sql` already contains a `search_thoughts_text()` function using `websearch_to_tsquery` with ILIKE fallback. This is more sophisticated than our plain `plainto_tsquery` approach; the implementation story should adopt OB1's two-phase BM25 (GIN-indexed tsvector → ILIKE fallback) and extend it with the RRF vector lane rather than replacing it.

---

