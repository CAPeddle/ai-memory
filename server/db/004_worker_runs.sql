-- ST-028: worker_runs table for per-run state persistence of background workers.
-- Standalone idempotent delta for existing databases.

CREATE TABLE IF NOT EXISTS public.worker_runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker          text NOT NULL CHECK (worker IN ('entity', 'consolidation')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  items_processed int NOT NULL DEFAULT 0,
  errors          int NOT NULL DEFAULT 0,
  error_summary   jsonb
);

CREATE INDEX IF NOT EXISTS idx_worker_runs_worker_ended_at
  ON public.worker_runs (worker, ended_at DESC);
