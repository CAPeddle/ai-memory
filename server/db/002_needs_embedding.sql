-- ST-039: Embedding resilience — standalone idempotent schema delta.
-- NOT applied by a migration runner (ST-042 not built). Applied via the Docker
-- init entrypoint on fresh DBs and manually (psql) on the persistent dev DB.
-- Safe to re-run: every statement is guarded.

ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS needs_embedding    boolean NOT NULL DEFAULT true;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_model    text;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_error    text;

-- Reconcile existing data (idempotent): rows that already have an embedding are done.
UPDATE public.thoughts SET needs_embedding = false
  WHERE embedding IS NOT NULL AND needs_embedding = true;

-- Rows with a NULL embedding from PAST silent failures keep needs_embedding = true,
-- so the first backfill sweep recovers already-lost data.

-- Partial index for the sweep query (selects only rows still needing an embedding).
CREATE INDEX IF NOT EXISTS idx_thoughts_needs_embedding
  ON public.thoughts (needs_embedding) WHERE needs_embedding = true;
