-- ST-082 / v1.1 Policy-Scope Isolation (POLICY-01, POLICY-02): every thought
-- carries a closed-vocabulary policy_scope.
-- Standalone idempotent delta for existing databases. Fresh databases get the
-- same final shape inline from schema.sql.
--
-- No DEFAULT, deliberately (mirrors workflow/001_workflow_schema.sql). A
-- permissive default on a boundary column silently mints permissive rows
-- wherever an INSERT forgets the column. No default means every write site
-- must state a scope, and forgetting fails loudly at deploy time.
--
-- Backfill is 'corporate', not 'personal' (05-CONTEXT.md D-02): the bulk of
-- thoughts captured to date are work/dev content, and backfilling to
-- 'personal' would hide most existing memory from normal corporate-scope
-- retrieval once default-deny is enforced. This is a one-way, blanket
-- backfill; reclassification tooling is out of scope for this milestone.

ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS policy_scope text;

UPDATE public.thoughts SET policy_scope = 'corporate' WHERE policy_scope IS NULL;

ALTER TABLE public.thoughts ALTER COLUMN policy_scope SET NOT NULL;

-- The guard is required, not defensive. A database bootstrapped from
-- schema.sql already has this exact constraint: Postgres auto-names an
-- unnamed inline column CHECK as <table>_<column>_check. The non-bootstrap
-- path can re-apply this file against that shape (migrations.test.ts's
-- "migration 003 repair probe" test does exactly that), and an unguarded
-- ADD CONSTRAINT would throw "constraint ... already exists", which
-- migrate.ts turns into Deno.exit(1).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'thoughts_policy_scope_check'
  ) THEN
    ALTER TABLE public.thoughts ADD CONSTRAINT thoughts_policy_scope_check
      CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public'));
  END IF;
END $$;
