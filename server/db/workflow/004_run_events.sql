-- ST-088 migration 004 — remote execution node event ingestion (U2, NODE-02).
--
-- WHAT THIS IS FOR. A registered node streams execution events to the hub. Delivery is
-- over a network that will drop and retry, so the node re-sends anything it did not see
-- acknowledged. The hub must absorb those replays without duplicating state.
--
-- ---------------------------------------------------------------------------
-- `UNIQUE (node_id, client_seq)` — the whole idempotency contract, in one index.
-- ---------------------------------------------------------------------------
-- `client_seq` is the NODE's own monotonic counter, not the hub's. Scoping uniqueness
-- to `(node_id, client_seq)` rather than `client_seq` alone is what lets every node
-- number its own events from 1 without coordinating with any other node — two nodes
-- both sending their event 7 is normal and must both persist.
--
-- The ingest path pairs this with `ON CONFLICT (node_id, client_seq) DO NOTHING`, so a
-- replayed batch is silently absorbed rather than erroring. The acknowledgement is then
-- re-derived by SELECT rather than taken from the INSERT's result — that is deliberate:
-- a duplicate insert returns no row, so an ack built from INSERT output would omit
-- exactly the events the node is retrying and it would retry them forever. Reading the
-- acks back covers both the freshly-inserted and the already-present.
--
-- `ON DELETE CASCADE` on `node_id`: a node's events have no meaning without the node,
-- and there is no cross-node reference to leave dangling. Teardown stays the single
-- `DROP SCHEMA workflow CASCADE` with no orphan bookkeeping.
--
-- ---------------------------------------------------------------------------
-- DELIBERATE STYLE BREAK FROM 001: no `IF NOT EXISTS` guards. Same rationale as 002/003.
-- ---------------------------------------------------------------------------
-- The ledger owns idempotency; self-idempotent DDL would hollow out drift detection.
-- Raw re-execution SHOULD fail loudly. Re-application THROUGH the ledger is a skip.
--
-- Every object below is schema-qualified `workflow.*` — see 001's header for why
-- `workflow` is never implicitly on a pooled connection's search_path.

CREATE TABLE workflow.run_events (
  event_id    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     uuid         NOT NULL REFERENCES workflow.execution_nodes (node_id)
                           ON DELETE CASCADE,
  -- The node's own counter. bigint, not int: a long-lived node emitting events
  -- continuously should not have a wrap-around failure mode designed into its schema.
  client_seq  bigint       NOT NULL,
  event_type  text         NOT NULL,
  payload     jsonb,
  received_at timestamptz  NOT NULL DEFAULT now()
);

-- A UNIQUE INDEX rather than a table constraint, because `ON CONFLICT (node_id,
-- client_seq)` infers its arbiter from an index and this states the target directly.
CREATE UNIQUE INDEX uq_run_events_node_seq
  ON workflow.run_events (node_id, client_seq);

-- Serves the per-node newest-first read the acknowledgement and any later inspection
-- surface will want. Distinct from the unique index above, which is ordered for
-- conflict arbitration rather than for scanning a node's recent history.
CREATE INDEX idx_workflow_run_events_node
  ON workflow.run_events (node_id, received_at DESC);
