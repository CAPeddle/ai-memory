# QP-035 — Entity↔Thought Provenance Link

## Story

**ST-035** — Entity↔thought provenance link (entity_mentions back-link table)

## Summary

Add a relational `public.entity_mentions(thought_id, entity_label, entity_name, created_at)` table populated by the existing entity-extraction worker as a side-effect of LLM extraction. Closes the gap that AGE nodes carry only `(label, name)` and have no back-link to the thoughts that mentioned them. Foundational data-plane change — no read tools, no bounding logic, no backfill in this story.

## Provenance

This packet replicates the `/plan-new` output mechanically from a completed brainstorming session on 2026-05-22 (the PO interaction normally driven by `vscode_askQuestions` was conducted via the `superpowers:brainstorming` flow instead). Design and rationale are settled in the spec referenced below; this packet is a thin layer that points `/plan` at the source-of-truth artifacts.

## Decisions (settled in spec — do not re-litigate in `/plan`)

| # | Question | Decision | Source |
|---|----------|----------|--------|
| 1 | Storage location | Relational `entity_mentions` table in `server/db/graph.sql` (Option B), not AGE `Thought` nodes | spec §4.1 |
| 2 | Mention metadata | Just the link — no confidence / offset / surface form | spec §2 (YAGNI) |
| 3 | Transactional semantics | No transaction wraps AGE writes + mentions INSERT; relies on worker retry idempotency | spec §4.3 |
| 4 | Re-extraction behaviour | Delete-then-insert on every extraction so mentions reflect current content, not a union | spec §4.4 |
| 5 | Write batching | One batched INSERT per thought via `unnest` + `ON CONFLICT DO NOTHING`; `writeToGraph` threaded with `thoughtId` | spec §4.2 |
| 6 | Backfill | Forward-only — pre-launch, no historical data to migrate | spec §2 |
| 7 | Read tools | None in this story; deferred to consumer stories | spec §2 |
| 8 | Read-tool shape (binding on future stories) | Composable single-purpose MCP tools, not a `search-and-expand` pipeline | spec §3 |
| 9 | Cardinality / ranking strategy for graph-expanded search | Deferred to ST-034 spike (separate, foundational, pre-feature) | board |

## In Scope

- New `public.entity_mentions` table appended to `server/db/graph.sql` with: composite PK `(thought_id, entity_label, entity_name)`; CHECK constraint on label allow-list (`Person|Function|Error|Topic|Project`); FK to `thoughts(id)` with `ON DELETE CASCADE`; secondary index on `(entity_label, entity_name)`.
- Modify `writeToGraph` in `server/src/entityWorker.ts`: accept `thoughtId`, perform DELETE + batched INSERT after the existing AGE node/edge MERGE loops.
- Apply schema change to running dev DB via `psql` (Dockerfile init only runs on fresh start).
- New test file `server/tests/entity-mentions.test.ts` covering: happy-path write, re-extraction (stale removed, new inserted), CHECK constraint rejection, FK cascade.

## Out of Scope

- New MCP tools (`thoughts_for_entity`, `provenance_for_entity`, `entity_neighbors`, etc.) — these belong to future consumer stories that pick from the L0–L3 menu in spec §5.
- Bounding / ranking strategy for graph-expanded search — owned by ST-034.
- Backfill of pre-existing thoughts — pre-launch, no need.
- Additional mention metadata (confidence, offset, surface form) — speculative; defer to consumer needs.
- Read-path code or graph-expanded search composition — direction set in spec §3, implementation is per-consumer-story.
- Investment in entity extraction quality (richer ontology, evaluation set) — surfaced as ceiling caveat in spec §5; addressed later.

## Design References (read these before `/plan`)

- **Primary:** [docs/design/specs/2026-05-22-entity-thought-provenance.md](../../../docs/design/specs/2026-05-22-entity-thought-provenance.md) — full design with Why for every decision, the L0–L3 structural-similarity menu this enables, and three open questions explicitly parked for consumer stories.
- **Template for ExecPlan task structure:** [docs/design/plans/2026-05-22-entity-thought-provenance.md](../../../docs/design/plans/2026-05-22-entity-thought-provenance.md) — subagent-driven plan (per [[plans-are-subagent-driven]] memory) with 7 tasks, each with self-contained subagent dispatch prompt + orchestrator review checklist + commit guidance. `/plan` should mirror this structure into the ExecPlan rather than re-deriving it.
- **Existing entity worker** (extends): [server/src/entityWorker.ts](../../../server/src/entityWorker.ts) (ST-022, Done)
- **Existing schema** (modifies): [server/db/graph.sql](../../../server/db/graph.sql) lines 1–126
- **Existing test pattern** (sibling, MCP-level): [server/tests/entity-worker.test.ts](../../../server/tests/entity-worker.test.ts)
- **Cross-store architecture summary:** [CLAUDE.md](../../../CLAUDE.md) "High-level architecture (cloud MCP)"
- **Related backlog:** ST-034 (cardinality spike), ST-019 (Phase 3 consumer), ST-026 (Phase 3 consumer)

## Acceptance Criteria (mirrored from board)

1. New `public.entity_mentions` table with composite PK, CHECK constraint, FK + `ON DELETE CASCADE`, secondary index per spec §4.1.
2. Entity worker writes mention rows per thought, batched, alongside AGE `MERGE`.
3. Delete-then-insert on every extraction (re-extraction freshness verified by test).
4. `writeToGraph` signature includes `thoughtId`; caller in `processQueue` passes `thought_id`.
5. Integration test: capture → wait → mentions rows exist (TDD red-then-green driver for the worker change).
6. Integration test: re-extraction (content + fingerprint change) removes stale, inserts new.
7. Integration test: CHECK constraint rejects unknown label.
8. Integration test: FK cascade on `DELETE FROM thoughts`.
9. Out-of-scope verified by absence: `git diff server/index.ts` empty (no MCP tools); no read-path code; no bounding logic; no backfill.

## Open Questions For `/plan`

The design is settled; remaining questions are about ExecPlan structure, not design:

1. **Commit trailer convention.** With ST-035 now created, commits during execution can use `Story: ST-035` + `Task: §N.N` trailers per [.github/instructions/session-resilience.instructions.md](../../instructions/session-resilience.instructions.md). The brainstorming-flow plan currently omits trailers (no story existed when it was written) — `/plan` should re-instate trailers in the ExecPlan task commits.
2. **Subagent-driven ExecPlan structure.** Per the [[plans-are-subagent-driven]] feedback memory (2026-05-22), the ExecPlan should mirror the `docs/design/plans/2026-05-22-entity-thought-provenance.md` shape: per-task subagent dispatch prompt + orchestrator review checklist + commit, rather than the existing `_TEMPLATE.md` inline-step shape. `/plan` should confirm this with the PO if the current ExecPlan template needs updating to support it.
3. **Verification-by-absence formalisation.** Several ACs (no new MCP tools, no read-path code, no bounding logic, no backfill) are negative — best verified by `git diff` showing untouched files. `/plan` should turn these into explicit AC checklist commands (`git diff -- server/index.ts` returns empty, etc.) rather than relying on the executor to interpret "no X."
4. **Schema-apply step on existing dev DB.** The Dockerfile only runs init scripts on fresh DB. The plan includes a `docker compose cp` + `psql -f` step to apply on existing containers. `/plan` should confirm this is the right approach vs. (a) requiring a clean `docker compose down -v` reset, or (b) adding a proper migration tool. For a single forward-only change pre-launch, the manual apply is pragmatic; longer-term this may warrant a migrations story.

## Next Step

PO: invoke `/plan` with this query packet path to produce `.github/planning/execplans/exec-plan-ST-035.md`. Because the design is settled and a subagent-driven plan already exists, `/plan` should be a short session focused on translating that plan into the project's ExecPlan format (with story/task trailers and AC checklists), not a fresh design round.
