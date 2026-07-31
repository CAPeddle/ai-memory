-- ST-084 migration 002 — bind an operational decision's run to its own packet.
--
-- THE DEFECT IN 001. `packet_id` and `run_id` were two independent single-column
-- references, so a decision could claim to belong to packet A while pointing at a run
-- that belonged to packet B, and nothing rejected it. Every consumer that walks
-- decision → run → packet and expects to arrive back where it started was relying on
-- callers being careful. `attention.ts` emits `AttentionItem.run_id` alongside
-- `packet_id` on exactly that assumption.
--
-- THE FIX. Make the pair referentially checkable: a composite unique key on
-- `agent_runs (id, packet_id)` to reference, and a composite foreign key on
-- `(run_id, packet_id)` to enforce it. A run from the wrong packet now has no matching
-- parent row and the INSERT is refused by the database rather than by convention.
--
-- ---------------------------------------------------------------------------
-- Two syntax details that are load-bearing, both verified against the PG 15.18
-- image this repo pins (docker/postgres-age) rather than assumed:
-- ---------------------------------------------------------------------------
--
-- 1. `ON DELETE SET NULL (run_id)` — the PostgreSQL 15+ COLUMN-LIST form, not plain
--    `ON DELETE SET NULL`. This is not a stylistic nicety. A bare `SET NULL` on a
--    composite FK nulls EVERY referencing column, and `packet_id` is NOT NULL, so
--    deleting an agent run would fail with a not-null violation. That path is
--    reachable: `deletePacket` cascades into `agent_runs`. Plain `SET NULL` here
--    would ship a foreign key that breaks packet deletion.
--
-- 2. MATCH SIMPLE (the default — deliberately not MATCH FULL). `run_id` is nullable
--    and `packet_id` is NOT NULL. MATCH SIMPLE skips enforcement when ANY referencing
--    column is NULL, which is exactly right: a decision recorded with no run attached
--    is legitimate and common. MATCH FULL would demand all-or-nothing and reject
--    every `run_id IS NULL` decision — i.e. it would break the majority case.
--
-- ---------------------------------------------------------------------------
-- DELIBERATE STYLE BREAK FROM 001: no `IF NOT EXISTS` guards on the ADDs.
-- ---------------------------------------------------------------------------
-- 001 is idempotent statement-by-statement because it predates this module having a
-- migration ledger; it had to survive being re-run. It doesn't any more. The ledger
-- (`workflow.schema_migrations`) is now the idempotency mechanism, and making the DDL
-- self-idempotent on top of it would be worse than redundant — it would hollow out the
-- drift check, because a migration that no-ops when its objects already exist cannot
-- tell "already applied" from "applied something different". Re-running this file
-- against a database that already has these constraints SHOULD fail loudly.
-- (PostgreSQL 15 has no `ADD CONSTRAINT IF NOT EXISTS` in any case.)
--
-- The DROP below does use `IF EXISTS`, for a different and narrower reason: it targets
-- a constraint PostgreSQL auto-named, and tolerating a database where that name
-- differs is not the same as making the migration re-runnable.

-- The composite FK subsumes this single-column one entirely: any (run_id, packet_id)
-- pair valid under the new constraint has a valid run_id under the old. Keeping both
-- would mean two constraints firing the same SET NULL on the same delete.
ALTER TABLE workflow.operational_decisions
  DROP CONSTRAINT IF EXISTS operational_decisions_run_id_fkey;

-- The referenced key. `id` is already the primary key, so this unique constraint is
-- redundant for uniqueness — it exists solely to give the composite FK something to
-- reference, which PostgreSQL requires.
ALTER TABLE workflow.agent_runs
  ADD CONSTRAINT agent_runs_id_packet_id_key UNIQUE (id, packet_id);

ALTER TABLE workflow.operational_decisions
  ADD CONSTRAINT operational_decisions_run_packet_fkey
  FOREIGN KEY (run_id, packet_id)
  REFERENCES workflow.agent_runs (id, packet_id)
  ON DELETE SET NULL (run_id);
