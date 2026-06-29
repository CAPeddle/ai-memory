-- Hybrid search: BM25 (tsvector) + pgvector cosine similarity, fused via RRF (k=60)
-- MMR re-ranking (λ=0.7) is applied in the application layer after this query.
--
-- Parameters (substitute before executing):
--   $1  — search query string (e.g. 'conan cmake dependency')
--   $2  — query embedding as vector(512) literal (e.g. '[0.1, 0.2, ...]')
--   $3  — optional project filter (text, NULL = no filter)
--   $4  — result limit (integer, e.g. 10)
--
-- When embeddings are not yet available, set $2 to NULL and the vector lane
-- will be skipped; BM25 rank alone drives the RRF score.

WITH bm25_results AS (
  SELECT
    id,
    row_number() OVER (ORDER BY ts_rank_cd(search_vector, query) DESC) AS bm25_rank
  FROM public.thoughts,
       plainto_tsquery('english', $1) AS query
  WHERE search_vector @@ query
    AND active = true
    AND ($3::text IS NULL OR project = $3)
  LIMIT 60
),

vector_results AS (
  -- Skipped when $2 IS NULL (no embedding provided)
  SELECT
    id,
    row_number() OVER (ORDER BY embedding <=> $2::vector) AS vector_rank
  FROM public.thoughts
  WHERE active = true
    AND ($3::text IS NULL OR project = $3)
    AND embedding IS NOT NULL
    AND $2 IS NOT NULL
  LIMIT 60
),

rrf AS (
  SELECT
    COALESCE(b.id, v.id) AS id,
    COALESCE(1.0 / (60 + b.bm25_rank),   0) +
    COALESCE(1.0 / (60 + v.vector_rank),  0) AS rrf_score
  FROM bm25_results b
  FULL OUTER JOIN vector_results v ON b.id = v.id
)

SELECT
  r.rrf_score,
  t.id,
  t.memory_type,
  t.project,
  t.tags,
  t.content,
  t.confidence,
  t.created_at
FROM rrf r
JOIN public.thoughts t ON r.id = t.id
ORDER BY r.rrf_score DESC
LIMIT $4;
