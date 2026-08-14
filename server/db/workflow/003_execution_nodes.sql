-- ST-088 migration 003 — remote execution node identity (U2, NODE-01).
--
-- WHAT THIS IS FOR. An authorized Ubuntu execution node registers itself with the hub
-- and is thereafter addressable by `node_id`. Registration is idempotent: the node
-- presents the same per-node bearer on every start, and the hub resolves it to the same
-- identity rather than accumulating a row per boot.
--
-- ---------------------------------------------------------------------------
-- `bearer_token_hash` — what is stored, and why a fast digest is the right choice.
-- ---------------------------------------------------------------------------
-- The column holds `sha256Hex(rawBearer)`: 64 lowercase hex characters, deterministic.
-- The raw bearer is NEVER stored, logged, or returned by any endpoint.
--
-- Deterministic is load-bearing, not incidental. The U2 identity contract is "same
-- bearer resolves to the same node", which this schema serves with a single
-- `UNIQUE (bearer_token_hash)` column and a plain SQL equality lookup. A salted KDF
-- (bcrypt/argon2) hashes the same input to a different value every time, so it cannot
-- answer an equality lookup at all — it would need a SECOND deterministic fingerprint
-- column to find the row before it could verify against it. That is a different data
-- contract, not a hashing swap. Recorded as the Task 1 checkpoint decision (Option A)
-- in 02-01-PLAN.md.
--
-- SHA-256 being fast is acceptable here for a reason specific to this credential: the
-- bearer is a PRE-PROVISIONED MACHINE SECRET of 32 random bytes (`openssl rand -hex 32`
-- — 256 bits), never a human-chosen password. A slow KDF exists to make low-entropy
-- guessing expensive; against 256 bits of entropy there is nothing to slow down. The
-- endpoint enforces the shape that keeps this true, rejecting any bearer that does not
-- match `^[0-9a-f]{64}$` with 401 BEFORE hashing or persisting. That check is a floor
-- on the ENCODED entropy — it does not, and cannot, prove the bytes were random; the
-- documented generation command supplies the randomness.
--
-- ---------------------------------------------------------------------------
-- DELIBERATE STYLE BREAK FROM 001: no `IF NOT EXISTS` guards. Same rationale as 002.
-- ---------------------------------------------------------------------------
-- The ledger (`workflow.schema_migrations`) is this module's idempotency mechanism.
-- Self-idempotent DDL on top of it would hollow out the drift check, because a
-- migration that no-ops when its objects already exist cannot tell "already applied"
-- from "applied something different". Re-running this file against a database that
-- already has these objects SHOULD fail loudly.
--
-- Note this is about RAW re-execution. Through the ledger, re-application is a SKIP:
-- `runWorkflowMigrations()` called twice applies nothing the second time. The two are
-- different mechanisms and both are correct.
--
-- Every object below is schema-qualified `workflow.*` — mandatory, because AGE graph
-- queries leave a sticky polluted `search_path` on pooled connections, so `workflow` is
-- never implicitly on the path. See 001's header for the four offending sites.
--
-- Teardown remains `DROP SCHEMA workflow CASCADE`.

CREATE TABLE workflow.execution_nodes (
  node_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256Hex of the per-node bearer. UNIQUE is what makes registration idempotent
  -- AND concurrency-safe: two simultaneous registrations with the same bearer cannot
  -- produce two identities, because the second INSERT has no row to win with.
  bearer_token_hash text         NOT NULL UNIQUE,
  registered_at     timestamptz  NOT NULL DEFAULT now(),
  last_seen_at      timestamptz  NOT NULL DEFAULT now(),
  status            text         NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'offline')),
  -- Self-reported by the node at registration. Advisory only — never used for
  -- authentication or authorization, so a node lying about either changes nothing.
  hostname          text,
  platform          text
);

CREATE INDEX idx_workflow_nodes_status
  ON workflow.execution_nodes (status, registered_at DESC);
