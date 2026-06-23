-- ST-029: Feedback API
-- Joinability decision: The acceptance criteria specify "Feedback rows joinable
-- to the originating recall_events row (shared (thought_id, query) natural key,
-- or an explicit recall_event_id FK — decide during planning)". We chose the
-- natural key approach: feedback_events stores (thought_id, query) which can be
-- joined to recall_events on the same pair. An explicit recall_event_id FK was
-- rejected because the report_feedback tool inputs do not include a recall_event
-- identifier — agents only know the thought_id and the query they searched with.
-- The (thought_id, query) pair is not unique in recall_events (a thought can be
-- returned for the same query multiple times), so the join is fuzzy by design:
-- feedback applies to the thought+query combination, not a specific recall event.
CREATE TABLE IF NOT EXISTS public.feedback_events (
  id          bigserial     PRIMARY KEY,
  thought_id  uuid          NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE,
  query       text          NOT NULL CHECK (octet_length(query) <= 4096),
  verdict     text          NOT NULL CHECK (verdict IN ('helpful', 'irrelevant')),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_thought_id ON public.feedback_events(thought_id);
