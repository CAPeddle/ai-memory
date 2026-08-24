-- ST-097 migration 005 — the WorkItem layer above the packet, the observed-session
-- lane, and the explicit session-to-WorkItem claim. Contract of record: ADR-017.
--
-- ---------------------------------------------------------------------------
-- WHY THIS MIGRATION IS PERMITTED AT ALL, given ADR-016 §1.
-- ---------------------------------------------------------------------------
-- ADR-016 §1 bars schema or migration work that assumes the host until the
-- ST-084/ST-088 spike concludes. That bar was NOT lifted. The PO granted a NARROW
-- OVERRIDE, recorded as a dated entry in ADR-016's Revision History, scoped to this
-- one file and nothing else. It is an override rather than compliance: the host gate
-- is not discharged, §1's acceptance pre-condition on the policy-scope enforcement
-- surface stands unchanged, and it sets no precedent — the next AWCP migration
-- returns for its own explicit decision.
--
-- The separate §3 question — storage LAYOUT, a module-design decision rather than a
-- host decision — is settled by ADR-017 §5: WorkItem lives beside its packets in the
-- existing `workflow` schema, as the packet's parent in one aggregate, and no second
-- schema is introduced. That is what keeps teardown a single statement and the
-- module a single migration ledger.
--
-- ---------------------------------------------------------------------------
-- WHAT THESE TABLES DELIBERATELY DO NOT HOLD. The absences ARE the contract, so they
-- are stated here rather than left to be rediscovered as gaps.
-- ---------------------------------------------------------------------------
--   * NO status on a work item (ADR-017 §6). No aggregate status, no derived status,
--     no projection. Requested-work status stays authoritative at its source, and
--     deriving one from packets whose own status cannot leave 'open' would
--     manufacture a signal the server does not hold.
--   * NO policy_scope on a work item (ADR-017 §3). A Work Packet is the only
--     authority for its own scope; a scope-gated operation reached through a work
--     item names the specific packet whose scope governs it. Nothing is derived,
--     defaulted or inferred from the set of a work item's packets, because choosing
--     among several packets' scopes implicitly would be choosing the boundary.
--     There is no column here to fabricate.
--   * NO title, and no other copy of requested work (ADR-017 §2). Title, hierarchy,
--     priority and status keep their authority at the source system. The provenance
--     pair is a reference to that authority, never a mirror of it.
--   * NO attention anywhere in this file. Attention stays derived and packet-level.
--
-- Adding any of these is a reversal of a settled decision, not a gap being filled.
--
-- ---------------------------------------------------------------------------
-- DELIBERATE STYLE BREAK FROM 001: no `IF NOT EXISTS` guards. Same rationale as
-- 002/003/004.
-- ---------------------------------------------------------------------------
-- The ledger (`workflow.schema_migrations`) owns idempotency. Self-idempotent DDL on
-- top of it would hollow out the drift check, because a migration that no-ops when
-- its objects already exist cannot tell "already applied" from "applied something
-- different". Raw re-execution of this file SHOULD fail loudly. Re-application
-- THROUGH the ledger is a skip: `runWorkflowMigrations()` called twice applies
-- nothing the second time. The two are different mechanisms and both are correct.
--
-- ADDITIVE ONLY. This file creates tables and indexes, and adds the nullable
-- `work_item_id` column to `workflow.work_packets`. It drops nothing, rewrites no
-- type, migrates no data, and inserts no rows — in particular it mints no `AW-NNN`
-- value, because ADR-017 §4 allocates those from an allocator that does not yet exist.
--
-- Every object below is schema-qualified `workflow.*` — see 001's header for why
-- `workflow` is never implicitly on a pooled connection's search_path.
--
-- Teardown remains `DROP SCHEMA workflow CASCADE`.

-- ---------------------------------------------------------------------------
-- Work items — one unit of REQUESTED work, and the optional parent of 0..n packets.
-- ---------------------------------------------------------------------------
-- Identity is the uuid and only the uuid (ADR-017 §1). Both secondary identities
-- below are nullable, neither is a primary key, and both resolve TO the uuid.
CREATE TABLE workflow.work_items (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ADR-017 §2's provenance pair, first half. The closed set is the same vocabulary
  -- `SOURCE_SYSTEMS` declares in server/src/workflow/types.ts and
  -- `sourceSystemSchema` validates in server/src/workflow/schema.ts. Widening it is
  -- an amendment to ADR-017 §2 — its own Revisit Triggers say so — not an edit at a
  -- call site, and not an edit here.
  source_system  text         NOT NULL
                              CHECK (source_system IN ('jira', 'github', 'story-board', 'awcp-native')),
  -- Second half: the identifier in THEIR namespace. Empty string is barred because
  -- an empty reference is not a reference; `createWorkItemSchema` applies the same
  -- floor at the edge.
  source_ref     text         CHECK (source_ref <> ''),
  -- ADR-017 §4's human-facing label for AWCP-native work. Nullable on EVERY row, not
  -- on native rows only: a dogfooded `story-board` item carries its own label
  -- alongside its provenance, and the label stays null until the allocator that
  -- mints it exists.
  aw_label       text         CHECK (aw_label ~ '^AW-[0-9]+$'),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  -- Both directions of the pair rule, matching `checkProvenancePair` in
  -- server/src/workflow/schema.ts. `awcp-native` names no foreign namespace, so it
  -- carries no ref; every other member names one, and a reference to it is what
  -- makes the pair a reference at all. Stated as a database invariant rather than an
  -- edge-validation convention because a contract that starts tight can be loosened
  -- by a later migration, and one that starts loose cannot be tightened once rows
  -- exist.
  CONSTRAINT work_items_provenance_pair
    CHECK ((source_system = 'awcp-native') = (source_ref IS NULL))
);

-- DEFAULT (NULLS DISTINCT) semantics are load-bearing here, not incidental. This
-- Postgres major can be told `NULLS NOT DISTINCT`, and doing so would cap the whole
-- database at ONE `awcp-native` work item, because the pair constraint above gives
-- every native row a null `source_ref`. The default is precisely what ADR-017 §2's
-- "UNIQUE (source_system, source_ref) where both are present" means.
CREATE UNIQUE INDEX uq_work_items_provenance
  ON workflow.work_items (source_system, source_ref);

-- ADR-017 §4 chose `AW-NNN` over reusing `ST-NNN` on the stated ground that AWCP
-- allocates from its own persistence, "where a database can enforce uniqueness
-- directly". This index IS that enforcement; without it the reason the decision was
-- taken would not be true of the schema. Many nulls stay legal, which is what lets
-- the label remain unallocated until its allocator arrives.
CREATE UNIQUE INDEX uq_work_items_aw_label
  ON workflow.work_items (aw_label);

-- ---------------------------------------------------------------------------
-- The packet's optional parent.
-- ---------------------------------------------------------------------------
-- NULLABLE is the contract, not a convenience (ADR-017 §3): a packet is entirely
-- valid with no parent, and every packet that existed before this migration stays
-- valid, unchanged and unparented.
--
-- No ON DELETE action is declared, so this is NO ACTION — deleting a work item that
-- still has packets is REFUSED. That is a deliberate deferral rather than a chosen
-- lifecycle: nothing in this schema deletes a work item, so no reachable behaviour
-- is being fixed, and a refusal is the reading a later migration can replace without
-- having silently unparented anything in the meantime. Contrast
-- `operational_decisions.run_id`, which names `ON DELETE SET NULL` in 002 precisely
-- because `deletePacket` makes that path reachable today.
ALTER TABLE workflow.work_packets
  ADD COLUMN work_item_id uuid REFERENCES workflow.work_items (id);

CREATE INDEX idx_workflow_packets_work_item
  ON workflow.work_packets (work_item_id);

-- ---------------------------------------------------------------------------
-- Observed sessions — a provider session announced on the node lane.
-- ---------------------------------------------------------------------------
-- OBSERVED, not authoritative, and the distinction is a schema fact rather than a
-- naming convention (ADR-017 §3). This row is reachable only through
-- `workflow.execution_nodes`, and it carries no run, no packet and no policy scope.
-- An AUTHORITATIVE execution is a `workflow.agent_runs` row under a packet. Nothing
-- converts one into the other implicitly, and neither table references the other.
--
-- `node_id` is `uuid` REFERENCING `workflow.execution_nodes`, following
-- `workflow.run_events` and NOT `workflow.agent_runs`. That choice is deliberate:
-- `agent_runs.node_id` is `text`, nullable and unconstrained — a shape 001 could not
-- avoid, because `execution_nodes` did not exist until 003 — and the two columns are
-- consequently not join-compatible at all. Repeating that here would be choosing the
-- defect rather than inheriting it: an observed session is DEFINED as living on the
-- node lane, so the node it names must be a node the database knows.
--
-- Identity is `(node_id, session_id)`, mirroring `uq_run_events_node_seq`'s
-- `(node_id, client_seq)` in 004 and for the same reason. `session_id` is
-- client-generated, opaque and explicitly non-authoritative; it is not a security
-- boundary, so scoping it to the node is what stops one node colliding with,
-- impersonating, or closing another machine's session. The hub's existing forgery
-- defence covers `node_id`; it cannot cover a payload field.
--
-- THERE IS NO STATUS COLUMN, and that is a decision rather than an omission. A
-- session's state is read from these timestamps: `ended_at IS NOT NULL` is a clean
-- close, and abandonment is a gap since `last_heartbeat_at` — a signal a SIGKILL
-- cannot suppress, unlike the absence of a stop record. The gap THRESHOLD is
-- evaluation policy and is deliberately not decided here; storing a status would
-- freeze one into a file whose bytes cannot change.
CREATE TABLE workflow.observed_sessions (
  node_id            uuid         NOT NULL REFERENCES workflow.execution_nodes (node_id)
                                  ON DELETE CASCADE,
  session_id         text         NOT NULL CHECK (session_id <> ''),
  started_at         timestamptz  NOT NULL DEFAULT now(),
  last_heartbeat_at  timestamptz  NOT NULL DEFAULT now(),
  -- Nullable BY DESIGN: null is "still open or abandoned", and the discrimination
  -- between those two is the heartbeat gap above, never this column.
  ended_at           timestamptz,
  PRIMARY KEY (node_id, session_id)
);

CREATE INDEX idx_workflow_observed_sessions_node
  ON workflow.observed_sessions (node_id, last_heartbeat_at DESC);

-- ---------------------------------------------------------------------------
-- The claim — an observed session associated with a work item.
-- ---------------------------------------------------------------------------
-- An EXPLICIT claim, never an inference. It gets its own table rather than a column
-- on either side because that is the only shape permitting many sessions to one work
-- item, re-claiming, and unclaiming — and the only one that leaves `run_events`
-- structurally incapable of implying supervised work.
--
-- UNIQUENESS IS A DATABASE INVARIANT, NOT A READ. `uq_work_item_sessions_claim`
-- below is what PREVENTS a duplicate claim. A `SELECT`-derived acknowledgement
-- reports a duplicate but cannot prevent two inserts racing; that acknowledgement
-- pattern is borrowed from 004 for its REPORTING property, not for exclusion. It is
-- a unique index rather than a table constraint for 004's own stated reason: an
-- `ON CONFLICT` clause infers its arbiter from an index, and this states the target
-- directly.
--
-- The TRIPLE is the constraint, and the narrower `(node_id, session_id)` is
-- deliberately not it — one observed session may be claimed by more than one work
-- item, and that is a legitimate state rather than a duplicate.
--
-- The composite foreign key makes "a claim requires an observed session that exists"
-- structural rather than a caller's responsibility. Both cascades are 004's
-- judgement applied again: a claim has no meaning without either side of the join,
-- and no third party is left holding a dangling reference, so teardown stays the
-- single `DROP SCHEMA workflow CASCADE` with no orphan bookkeeping.
CREATE TABLE workflow.work_item_sessions (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  uuid         NOT NULL REFERENCES workflow.work_items (id) ON DELETE CASCADE,
  node_id       uuid         NOT NULL,
  session_id    text         NOT NULL,
  claimed_at    timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (node_id, session_id)
    REFERENCES workflow.observed_sessions (node_id, session_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_work_item_sessions_claim
  ON workflow.work_item_sessions (node_id, session_id, work_item_id);

-- Serves the per-work-item newest-first read a work item's session list will want.
-- Distinct from the unique index above, which is ordered for conflict arbitration
-- rather than for scanning one item's claims.
CREATE INDEX idx_workflow_work_item_sessions_item
  ON workflow.work_item_sessions (work_item_id, claimed_at DESC);
