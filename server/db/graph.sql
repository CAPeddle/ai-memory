-- AGE graph setup and entity extraction schema
-- Depends on: 02-schema.sql (public.thoughts must exist before this runs)
-- Safe to run multiple times (idempotent via IF NOT EXISTS and existence checks).

-- ============================================================
-- 1. CREATE THE MEMORY GRAPH (idempotent)
--    All entity nodes and relationship edges live in this AGE graph.
-- ============================================================

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'memory_graph') THEN
    PERFORM create_graph('memory_graph');
  END IF;
END;
$$;

-- ============================================================
-- 2. ENTITY EXTRACTION QUEUE (PostgreSQL side)
--    AGE stores the graph; this table tracks extraction job state.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_extraction_queue (
  thought_id          uuid        PRIMARY KEY REFERENCES public.thoughts(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'pending',
  attempt_count       int         NOT NULL DEFAULT 0,
  last_error          text,
  queued_at           timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  processed_at        timestamptz,
  source_fingerprint  text,
  source_updated_at   timestamptz,
  worker_version      text,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_extraction_queue_status
  ON public.entity_extraction_queue(status)
  WHERE status = 'pending';

-- ============================================================
-- 3. AUTO-QUEUE TRIGGER FOR ENTITY EXTRACTION
--    Fires on insert or content change only. The requeue condition
--    guards on source_fingerprint (derived from content), so firing
--    on metadata-only changes would be a no-op. Matching the trigger
--    to content changes keeps it consistent with the queue condition.
--    Skips system-generated artifacts (e.g. consolidation outputs).
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_entity_extraction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.metadata->>'generated_by' IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.entity_extraction_queue
    (thought_id, status, source_fingerprint, source_updated_at)
  VALUES
    (NEW.id, 'pending', NEW.content_fingerprint, NEW.updated_at)
  ON CONFLICT (thought_id) DO UPDATE SET
    status             = 'pending',
    attempt_count      = 0,
    last_error         = NULL,
    queued_at          = now(),
    source_fingerprint = EXCLUDED.source_fingerprint,
    source_updated_at  = EXCLUDED.source_updated_at
  WHERE entity_extraction_queue.source_fingerprint IS DISTINCT FROM EXCLUDED.source_fingerprint;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_entity_extraction ON public.thoughts;
CREATE TRIGGER trg_queue_entity_extraction
  AFTER INSERT OR UPDATE OF content ON public.thoughts
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_entity_extraction();

-- ============================================================
-- 4. OPENROUTER ENTITY EXTRACTION CALL SHAPE (reference comment)
--
-- The Deno entity extraction worker sends this to OpenRouter:
--
--   POST https://openrouter.ai/api/v1/chat/completions
--   Authorization: Bearer ${OPENROUTER_API_KEY}
--   {
--     "model": "openai/gpt-4o-mini",
--     "response_format": { "type": "json_object" },
--     "messages": [
--       {
--         "role": "system",
--         "content": "Extract entities and relationships from the thought below.
--           Return JSON: { \"nodes\": [{\"label\": \"Person|Function|Error|Topic|Project\",
--           \"name\": \"...\", \"props\": {}}],
--           \"edges\": [{\"from\": \"...\", \"to\": \"...\",
--           \"rel\": \"CAUSED_BY|LIKES|WORKS_ON|USES|RELATED_TO\"}] }"
--       },
--       { "role": "user", "content": "<thought content>" }
--     ]
--   }
--
-- IMPORTANT: The implementation must sanitize LLM output before writing to AGE:
--   - Allow-list node labels against the known set (Person, Function, Error, Topic, Project)
--   - Allow-list relationship types against the known set (CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO)
--   - Escape string property values (replace single quotes with \')
--   - Strip any $$ sequences to prevent dollar-quote injection in sql.unsafe() blocks
--
-- After receiving the response, the worker writes nodes and edges into
-- the memory_graph AGE graph using MERGE (idempotent):
--
--   SELECT * FROM cypher('memory_graph', $$
--     MERGE (:Person {name: 'John'})
--   $$) AS t(v agtype);
-- ============================================================

-- Exponential backoff support (added by ST-022)
ALTER TABLE public.entity_extraction_queue
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;
