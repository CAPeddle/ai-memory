-- ADR-012: replace binary profile scoping with flexible tags.
-- Standalone idempotent delta for existing databases.

ALTER TABLE public.thoughts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = 'profile'
  ) THEN
    UPDATE public.thoughts
    SET tags = ARRAY(
      SELECT DISTINCT tag
      FROM unnest(
        tags || CASE profile
          WHEN 'professional' THEN ARRAY['developer']::text[]
          WHEN 'personal' THEN ARRAY['personal']::text[]
          ELSE '{}'::text[]
        END
      ) AS tag
      WHERE tag <> ''
      ORDER BY tag
    );

    ALTER TABLE public.thoughts DROP COLUMN profile;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_thoughts_tags
  ON public.thoughts USING GIN (tags);

ALTER TABLE public.recall_queries
  DROP COLUMN IF EXISTS profile;
