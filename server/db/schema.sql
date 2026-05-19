-- ai-memory schema — forked from OB1, extended with memory tiers and context scoping
-- Safe for fresh database creation (CREATE TABLE IF NOT EXISTS).
-- For migration onto an existing OB1 thoughts table, use ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- for each new column instead of the CREATE TABLE block.

-- ============================================================
-- 1. BASE THOUGHTS TABLE
--    OB1's flat thoughts table plus ai-memory extensions:
--    memory_type discriminator, project/profile context,
--    tier lifecycle columns, and generated tsvector for BM25.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.thoughts (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content             text        NOT NULL,
  embedding           vector(512),
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  content_fingerprint text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Memory tier discriminator (Shard = episodic raw observation; Wiki = promoted semantic fact)
  memory_type         text        NOT NULL DEFAULT 'shard'
                                  CHECK (memory_type IN ('shard', 'wiki')),

  -- Context scoping
  project             text,
  profile             text        CHECK (profile IN ('professional', 'personal')),

  -- Tier lifecycle
  active              boolean     NOT NULL DEFAULT true,
  supersedes          uuid        REFERENCES public.thoughts(id),
  recall_count        integer     NOT NULL DEFAULT 0,
  last_recalled_at    timestamptz,

  -- Provenance
  source              text        CHECK (source IN ('user-taught', 'auto-promoted', 'observed')),
  confidence          float       CHECK (confidence BETWEEN 0 AND 1),

  -- Generated tsvector for BM25 full-text search (PG15+, requires STORED)
  search_vector       tsvector    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,

  -- Global deduplication: same normalised content = same memory, regardless of project/profile.
  -- Capturing the same text in two projects returns the original row (not a second copy).
  -- This is intentional for a single-user personal store; multi-tenant use would scope this key.
  UNIQUE (content_fingerprint)
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_thoughts_memory_type ON public.thoughts(memory_type);
CREATE INDEX IF NOT EXISTS idx_thoughts_project     ON public.thoughts(project);
CREATE INDEX IF NOT EXISTS idx_thoughts_active      ON public.thoughts(active);
CREATE INDEX IF NOT EXISTS idx_thoughts_search_vec  ON public.thoughts USING GIN(search_vector);

-- HNSW vector index for cosine similarity search (pgvector)
-- m=16, ef_construction=64 is a good baseline; tune ef_search at query time
CREATE INDEX IF NOT EXISTS idx_thoughts_embedding ON public.thoughts
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 3. CONSOLIDATION QUEUE
--    Shards eligible for wiki promotion are queued here.
--    The Deno consolidation worker polls this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consolidation_queue (
  thought_id          uuid        PRIMARY KEY REFERENCES public.thoughts(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'pending',
  attempt_count       int         NOT NULL DEFAULT 0,
  last_error          text,
  queued_at           timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_consolidation_queue_status
  ON public.consolidation_queue(status)
  WHERE status = 'pending';

-- ============================================================
-- 4. CONSOLIDATION LOG
--    Audit trail for shard → wiki promotion decisions.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consolidation_log (
  id              bigserial   PRIMARY KEY,
  operation       text        NOT NULL,
  thought_id      uuid        REFERENCES public.thoughts(id),
  wiki_id         uuid        REFERENCES public.thoughts(id),
  score           float,
  score_breakdown jsonb       NOT NULL DEFAULT '{}'::jsonb,
  worker_run_id   text,
  dry_run         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. AUTO-QUEUE TRIGGER FOR CONSOLIDATION
--    New shards are queued for consolidation scoring.
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_for_consolidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.consolidation_queue (thought_id, status)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (thought_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_consolidation ON public.thoughts;
CREATE TRIGGER trg_queue_consolidation
  AFTER INSERT ON public.thoughts
  FOR EACH ROW
  WHEN (NEW.memory_type = 'shard')
  EXECUTE FUNCTION public.queue_for_consolidation();

-- ============================================================
-- 6. RECALL EVENTS (added by ST-005)
--    Every search_thoughts call logs one row per returned result.
--    Feeds ST-008's consolidation scoring (recall frequency/recency).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recall_events (
  id          bigserial   PRIMARY KEY,
  thought_id  uuid        NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE,
  query       text        NOT NULL,
  rrf_score   float       NOT NULL,
  rank        int         NOT NULL,
  project     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recall_events_thought_created
  ON public.recall_events(thought_id, created_at DESC);
