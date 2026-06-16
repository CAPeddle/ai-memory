-- ST-054: search_text, normalizer_version, and query-level recall logging.
-- Standalone idempotent delta for existing databases.

DROP INDEX IF EXISTS idx_thoughts_search_vec;

ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS search_text text;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS normalizer_version integer;

ALTER TABLE public.thoughts DROP COLUMN IF EXISTS search_vector;
ALTER TABLE public.thoughts
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(search_text, content))) STORED;

CREATE INDEX IF NOT EXISTS idx_thoughts_search_vec ON public.thoughts USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS public.recall_queries (
  id               bigserial   PRIMARY KEY,
  tool             text        NOT NULL CHECK (tool IN ('search', 'search_thoughts')),
  query            text        NOT NULL,
  normalized_query text        NOT NULL,
  project          text,
  profile          text,
  result_count     int         NOT NULL CHECK (result_count >= 0),
  top_result_ids   uuid[]      NOT NULL DEFAULT '{}'::uuid[],
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recall_queries_tool_created
  ON public.recall_queries(tool, created_at DESC);