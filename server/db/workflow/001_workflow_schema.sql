-- ST-084: Workflow Operations spike — dedicated `workflow` schema namespace.
-- Standalone idempotent delta for existing databases.
--
-- SPIKE / DISPOSABLE. Full teardown:
--   DROP SCHEMA workflow CASCADE;
--   DELETE FROM schema_migrations WHERE version = 7;
--
-- Every object below is schema-qualified `workflow.*`. This is a correctness
-- requirement, not a style preference: four sites in the memory domain issue a
-- bare `SET search_path = ag_catalog, "$user", public` inside a multi-statement
-- sql.unsafe() on a POOLED connection (server/index.ts:941, :997;
-- server/src/entityWorker.ts:115, :125). That SET is session-scoped and sticky,
-- so any pooled connection which has served an AGE graph query keeps a polluted
-- search_path for its lifetime. `workflow` is therefore NEVER implicitly on the
-- path. Unqualified objects would land in the wrong schema non-deterministically.
--
-- What this schema buys, honestly: namespacing and clean teardown. NOT access
-- control — the single `ai_memory` role reads and writes both schemas freely.
-- Real enforcement would need a second role plus REVOKE (out of spike scope).

CREATE SCHEMA IF NOT EXISTS workflow;

-- ---------------------------------------------------------------------------
-- Work packets — the unit of supervised agent work.
-- ---------------------------------------------------------------------------
-- policy_scope is NOT NULL with NO DEFAULT, deliberately. A permissive default
-- on a boundary column silently mints permissive rows wherever an INSERT forgets
-- the column (the memory domain's consolidation promote at
-- consolidationWorker.ts:121-134 is exactly that shape). No default means every
-- write site must state a scope, and forgetting fails loudly at deploy time.
-- Stage 1 DEFINES this column; enforcement across retrieval paths is Stage 2.
CREATE TABLE IF NOT EXISTS workflow.work_packets (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text         NOT NULL,
  objective         text         NOT NULL,
  scope             text         NOT NULL DEFAULT '',
  constraints       text         NOT NULL DEFAULT '',
  -- repository binding inlined rather than a join table: it is 1:1 with the
  -- packet, and an unused join table is structure without a consumer.
  repository        text,
  branch            text,
  policy_scope      text         NOT NULL
                                 CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public')),
  status            text         NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open', 'in_progress', 'blocked', 'complete')),
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workflow_packets_status
  ON workflow.work_packets (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Agent runs — one supervised agent session against a packet.
-- ---------------------------------------------------------------------------
-- `host` and `node_id` carry the local/remote distinction. Stage 1 exercises
-- local runs only; Stage 2 populates node_id from the remote execution node.
CREATE TABLE IF NOT EXISTS workflow.agent_runs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id         uuid         NOT NULL REFERENCES workflow.work_packets (id) ON DELETE CASCADE,
  agent_type        text         NOT NULL,
  host              text         NOT NULL,
  node_id           text,
  working_dir       text,
  repository        text,
  branch            text,
  status            text         NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running', 'ended', 'failed')),
  started_at        timestamptz  NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  last_event_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_packet
  ON workflow.agent_runs (packet_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Checkpoints — structured progress reports within a run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow.checkpoints (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid         NOT NULL REFERENCES workflow.agent_runs (id) ON DELETE CASCADE,
  completed_work    text         NOT NULL,
  current_state     text         NOT NULL,
  blockers          text,
  next_action       text,
  repo_commit       text,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run
  ON workflow.checkpoints (run_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Operational decisions — first-class blocking execution state.
-- ---------------------------------------------------------------------------
-- These are NOT "thoughts". A decision here can block a run and gate completion;
-- it is authoritative transactional state. It may LATER be projected into memory
-- as promoted knowledge, but that projection is optional and non-authoritative:
-- deleting the projection must leave this row untouched (proven by test).
CREATE TABLE IF NOT EXISTS workflow.operational_decisions (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id         uuid         NOT NULL REFERENCES workflow.work_packets (id) ON DELETE CASCADE,
  run_id            uuid         REFERENCES workflow.agent_runs (id) ON DELETE SET NULL,
  question          text         NOT NULL,
  rationale         text,
  resolution        text,
  blocking          boolean      NOT NULL DEFAULT true,
  status            text         NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open', 'resolved')),
  -- Set when this decision is projected into the memory domain. Nullable and
  -- non-authoritative by design: it is a pointer OUT to an optional projection,
  -- never a foreign key, and never required for this row to be valid.
  promoted_memory_ref text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workflow_decisions_packet
  ON workflow.operational_decisions (packet_id, status);

-- ---------------------------------------------------------------------------
-- Verification criteria + evidence — the completion gate.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow.verification_criteria (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id         uuid         NOT NULL REFERENCES workflow.work_packets (id) ON DELETE CASCADE,
  description       text         NOT NULL,
  required          boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_criteria_packet
  ON workflow.verification_criteria (packet_id);

-- Evidence is INGESTED, never produced by executing commands (AWCP §8 Q8:
-- verification is ingest-only). `kind` records how the result arrived.
CREATE TABLE IF NOT EXISTS workflow.evidence_items (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id      uuid         NOT NULL REFERENCES workflow.verification_criteria (id) ON DELETE CASCADE,
  kind              text         NOT NULL
                                 CHECK (kind IN ('manual', 'command_result', 'external_build')),
  detail            text         NOT NULL,
  recorded_commit   text,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_evidence_criterion
  ON workflow.evidence_items (criterion_id, created_at DESC);
