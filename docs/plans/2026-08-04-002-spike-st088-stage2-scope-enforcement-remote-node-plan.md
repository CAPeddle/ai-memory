---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan
story: ST-088
title: "ST-088 Stage 2 — Policy-Scope Enforcement Pricing, Remote Execution Node, and Final ADR-016 Recommendation - Plan"
date: "2026-08-04"
---

# ST-088 Stage 2 — Policy-Scope Enforcement Pricing, Remote Execution Node, and Final ADR-016 Recommendation - Plan

## Goal Capsule

**Objective:** Discharge the three unproven ST-084 Stage 2 criteria — policy-scope enforcement (criterion 5), remote Ubuntu execution node (criterion 6), and final extraction viability (criterion 7) — and produce a defended ADR-016 host recommendation. The gate PO-added on 2026-08-03 requires that the enforcement surface cost be *priced* (a defended estimate with per-path classification) before Candidate A may be accepted.

**Product authority:** ST-084 Stage 1 findings (`docs/investigations/ST-084-awcp-host-spike-findings.md`), especially §6.1 (the enforcement surface), §7 (Stage 2 contracts), §12a (post-Stage-1 drift corrections). ADR-016 §1 (the gate). Story-board ST-088 notes.

**Open blockers:** None. ST-084 Stage 1 merged and reviewed; contracts defined. ST-082 (build the enforcement) must not collide — this story *prices*, ST-082 *builds*.

---

## Product Contract

### What this spike produces

1. **Policy-scope enforcement pricing** — a per-path classification of every memory-side retrieval path against `scope.tags` enforcement feasibility, with an effort estimate for each, summed into a defended total. This is the ADR-016 gate item. It does not implement enforcement (ST-082's job).
2. **Remote-node protocol implementation** — a minimal Node/shell client on z2 (the Ubuntu execution node), plus the hub-side `execution_nodes` and `run_events` tables and the auth/spool/replay/heartbeat/checkpoint cycle. Experiments 4–6 from Stage 1 run against a real node.
3. **Actual execution blocking** — proven (or reported UNPROVEN with the same honesty as Stage 1): does `blocking` state actually halt or gate work, or only flag an attention item?
4. **Final extraction viability assessment** — does inheriting ai-memory's engine reduce AWCP complexity enough to justify Candidate A's domain-fit cost vs a clean Candidate C?
5. **ADR-016 final disposition** — accept Candidate A / accept A with required changes / recommend Candidate C — with the policy-scope enforcement cost as the deciding evidence for §6.1.

### Scope boundaries

**In scope:**
- Pricing the 15 memory read paths, `fetch`, both graph tools, entity-worker and consolidation LLM egress, embedding backfill, and `recall_events`/`recall_queries` (all enumerated in §7.2 and §6.1)
- Remote-node client (Node.js/shell, zero npm deps), hub-side tables, auth, spool, replay, heartbeat, checkpoint, request-repo-rescan
- Experiments 4–6: disconnection, duplicate delivery, invalid-auth
- Final ADR-016 recommendation written into the ADR itself

**Out of scope:**
- Implementing enforcement (`scope.tags` WHERE clauses, graph gating) — that is ST-082
- Production deployment, backup/DR, dashboard, VS Code extension
- Any corporate external write (hard constraint from ADR-016 context)
- Changing the scope column schema (already `CHECK`-constrained, `NOT NULL`, no `DEFAULT` — proven in Stage 1)

---

## Implementation Units

### U1 — Price the policy-scope enforcement surface (criterion 5)

**Purpose:** Produce the defended estimate that discharges the ADR-016 gate. Read-only analysis; no code changes.

**Deliverable:** A pricing table in the Stage 2 findings section (appended to `docs/investigations/ST-084-awcp-host-spike-findings.md` §12b or a new §13) covering every path enumerated in §7.2, classified as:
- **Straightforward** — add `AND scope_tag = $scope` to an existing WHERE clause; no structural change
- **Requires new parameter** — tool/function currently takes no context; adding enforcement requires a new parameter and caller-side plumbing
- **Structurally blocked** — path cannot enforce a WHERE predicate (graph tools: AGE nodes carry no scope column and cannot join to `thoughts` within an openCypher MATCH); must be gated (deny the call if a scope filter is active)
- **Egress path** — not a retrieval path; enforcement means "do not send to provider if scope denies"

**Paths to classify** (from §6.1 and §7.2):
1. `search_thoughts` BM25 lane — `server/index.ts` ~L180-230
2. `search_thoughts` vector lane — `server/index.ts` ~L350-365
3. `search_thoughts` RRF fusion pass — `server/src/searchQuality.ts`
4. `search_thoughts` MMR re-rank — `server/src/searchQuality.ts`
5. `fetch` — `server/index.ts` ~L265; **first priority** (defeats all lane filters)
6. `list_thoughts` — `server/index.ts` ~L608+
7. `thought_stats` — `server/index.ts`
8. `capture_thought` read-back — `server/index.ts` ~L496+
9. `graph_traverse` — structurally blocked (AGE nodes: no scope column)
10. `graph_search` — structurally blocked (same reason)
11. Entity-worker egress (`server/src/entityWorker.ts:66`) — hardcoded OpenRouter URL; egress path
12. Consolidation LLM egress (`server/src/consolidationLLM.ts:37`) — hardcoded OpenRouter URL; egress path
13. Embedding backfill (`server/src/embeddingBackfill.ts`) — egress path
14. `recall_events` — carries raw query text; no scope column; gating required
15. `recall_queries` — same as above

**Estimate shape:** S/M/L per path (S = 1-2h, M = half-day, L = full day+). Sum the M+L paths to get the enforced-surface cost for the ADR-016 gate.

**Verification:** Pricing table exists; every path classified; total effort stated; the "structurally blocked" paths have a documented mitigation strategy (gate vs. disable vs. schema change deferred to ST-082).

---

### U2 — Hub-side remote-node tables and auth endpoint (criterion 6, part 1)

**Purpose:** Add the two tables deferred from Stage 1 and a node-registration/heartbeat endpoint. Hub only; no node client yet.

**Tables** (per §7.1 contract):
- `workflow.execution_nodes` — `node_id`, `bearer_token_hash` (bcrypt), `registered_at`, `last_seen_at`, `status` (active/paused/offline), `hostname`, `platform`
- `workflow.run_events` — `event_id`, `node_id`, `client_seq`, `event_type`, `payload` JSONB, `received_at`; unique constraint `(node_id, client_seq)` for idempotent replay

**Endpoint:** `POST /workflow/nodes/register` — validates per-node bearer (distinct from `MEMORY_API_KEY`; must not be in `startupValidation.ts`'s `REQUIRED_ENV`), upserts the node row, returns `node_id`.

**Endpoint:** `POST /workflow/nodes/:node_id/events` — validates per-node bearer, bulk-inserts events with `ON CONFLICT (node_id, client_seq) DO NOTHING`, returns ack list. This is the hub's idempotency contract — the node drops spool entries only on ack, never on send.

**Control messages** (allow-listed per §7.1): `request-status`, `request-checkpoint`, `request-repo-rescan`, `pause-reporting`, `resume-reporting`.

**Files:**
- `server/db/workflow/003_execution_nodes.sql`
- `server/db/workflow/004_run_events.sql`
- `server/src/workflow/remoteNodeHub.ts` (new)
- `server/tests/workflow-remote-node-hub.test.ts` (new)

**Verification:** Migration applies cleanly; unique constraint rejects duplicate `(node_id, client_seq)`; invalid bearer is rejected 401; valid registration upserts the node row.

---

### U3 — Remote-node client (criterion 6, part 2)

**Purpose:** A minimal Node.js (no npm deps) or POSIX shell+curl client that runs on z2 (Ubuntu 24.04.4, no Deno). Implements spool, heartbeat, checkpoint, and repo-rescan.

**Spool:** append-only JSONL at `~/.awcp/spool.jsonl`, one event per line, fsynced. Bounded: oldest entries dropped when size exceeds limit, with a counter persisted alongside. Replay is oldest-first; entry dropped only after hub ack.

**Files:**
- `server/scripts/awcp-node-client.js` (plain Node.js, ESM, zero npm deps) — or `server/scripts/awcp-node-client.sh` if Node is not available on the target; prefer Node for the spool logic

**Verification:** Client registers with hub, sends a heartbeat event, hub records it in `run_events`; a spool entry is dropped only after ack; replay sends unsent entries on restart.

---

### U4 — Disconnection/duplicate/invalid-auth experiments (criterion 6, part 3)

**Purpose:** Run experiments 4–6 from the Stage 1 plan against the real node client and hub.

**Experiment 4 — disconnection:** client spools events while hub is unreachable; on hub recovery, client replays and hub accepts all with idempotent `ON CONFLICT DO NOTHING`; no events lost.

**Experiment 5 — duplicate delivery:** client sends the same `(node_id, client_seq)` twice (simulating a retry before ack); second insert is silently ignored; hub returns the same ack; client drops the spool entry once.

**Experiment 6 — invalid auth:** node sends a request with a wrong or missing bearer; hub returns 401; client does not drop the spool entry; event remains for retry.

**Verification:** All three experiments have passing tests in `server/tests/workflow-remote-node-hub.test.ts`; findings recorded in the Stage 2 findings doc.

---

### U5 — Actual execution blocking assessment (criterion from §8)

**Purpose:** Prove or honestly report UNPROVEN whether `blocking` WorkPacket state gates actual work, beyond the attention item at `server/src/workflow/attention.ts:51`.

**Read:** `server/src/workflow/attention.ts`, `server/src/workflow/workPacket.ts`, `server/src/workflow/runCoordinator.ts` (if it exists), and any callers of `blocking` state.

**Finding shape:** Either "proven — blocking state prevents X via Y mechanism at file:line" or "UNPROVEN — blocking is modelled state whose only implemented consequence is the attention item; no execution node yet exists against which actual halting could be measured."

**Verification:** Finding recorded honestly in the Stage 2 doc; no overclaiming.

---

### U6 — Final extraction viability and ADR-016 recommendation (criterion 7)

**Purpose:** Weigh whether the ai-memory engine reuse actually reduces AWCP complexity enough to justify Candidate A's domain-fit cost. Then write the final ADR-016 host recommendation.

**Inputs:**
- U1 pricing table (the cost Candidate A carries for §6.1)
- Experiments 4–6 results (criterion 6 evidence)
- Stage 1 reuse evidence: only infrastructural reuse materialised (Postgres pooling, transactions, migration pattern, container topology); the memory engine itself was unused
- §12a drift: §8's boot-wiring caveat discharged by ST-086; §6.2's "bad migration can't kill server" no longer true (fail-startup)
- ADR-016 §1 acceptance criteria 1–7

**Recommendation shape** (one of three outcomes from §7):
1. **Accept Candidate A** — enforcement cost is priced and bounded; team judges it acceptable given the operational simplicity advantage
2. **Accept A with required changes** — specific preconditions (e.g., ST-082 must land before any corporate-scoped deployment)
3. **Recommend Candidate C** — enforcement cost is large enough that a clean codebase saves more than migration effort costs

**Files:**
- Append Stage 2 findings to `docs/investigations/ST-084-awcp-host-spike-findings.md` (new §13)
- Update `docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` §1 gate progress and §3 trade-offs; change status from Proposed/Conditional to the concluded state

**Verification:** ADR-016 status is no longer Proposed/Conditional; the gate progress section records criterion 5–7 outcomes; the recommendation is defended by the pricing table and experiment evidence.

---

## Key Technical Decisions

- **Pricing first (U1 before U2-U5):** The ADR-016 gate depends on U1's output. If pricing reveals the enforcement cost is prohibitive, the recommendation may be Candidate C and U2-U5 become evidence of remote-node feasibility rather than host-acceptance criteria. U1 is read-only and can be done immediately without any code change.
- **Node client in plain Node.js, not Deno:** z2 has no Deno (§7.1). Zero npm deps constraint means the client is either vanilla Node ESM or POSIX shell + curl. Node is preferred for the spool JSONL logic.
- **Per-node bearer separate from MEMORY_API_KEY:** Must not be added to `startupValidation.ts` REQUIRED_ENV (would prevent boot when no node is configured). Validated by its own function alongside `requireApiKey`.
- **Graph tools are structurally blocked, not just unfixed:** AGE nodes carry only `(label, name)`. Enforcement requires either extraction-time scope tagging of graph nodes (schema change) or gating the tools entirely when a scope filter is active. This is a pricing input, not a Stage 2 build item.
- **`recall_events`/`recall_queries` have no scope column:** These carry raw query text. Enforcement means gating (deny when scope active) or schema extension. ST-082 owns the build; this story prices and classifies.
- **Stage 2 findings appended to existing doc:** Append new sections (§13+) rather than rewriting Stage 1 sections. Stage 1 text stands as written; §12a already records post-Stage-1 drift corrections.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Pricing reveals enforcement is so expensive that Candidate C becomes the honest recommendation | That is a valid outcome; record it honestly. The burden of proof sits with the spike, not the preference. |
| z2 is unavailable or has changed since Stage 1 (z2 reachability was confirmed but nothing more) | Verify z2 reachability as the first step of U3. If unreachable, record UNPROVEN for criterion 6 experiments with the same honesty as Stage 1. |
| `REQUIRED_ENV` break: adding node bearer there prevents boot when no node configured | Per §7.1 contract: must not be in `REQUIRED_ENV`. Validate this in the hub endpoint, not at startup. |
| ST-082 lands before this story and implements enforcement | Per story-board ST-088 notes: "if ST-082 lands first the estimate becomes an actual, which is better evidence, not a conflict." Update U1 pricing to reflect actual rather than estimated cost. |

---

## Acceptance Criteria Mapping

| Story AC | Covered by |
|---|---|
| Criterion 5 — policy-scope enforcement (priced; ADR-016 gate discharged) | U1 |
| Criterion 6 — remote Ubuntu execution node (auth, heartbeat, checkpoint, spool, replay, experiments 4–6) | U2, U3, U4 |
| Actual execution blocking proven or honestly UNPROVEN | U5 |
| Criterion 7 — final extraction viability + ADR-016 final recommendation | U6 |
| ADR-016 acceptance pre-condition discharged (§6.1 enforcement surface priced) | U1 + U6 |

---

## Execution Notes

- **Move ST-088 to In Progress on the board before starting.**
- **Read findings §12a before trusting any Stage 1 claim** — two of the three §6 concerns had already moved by the time Stage 1 was reviewed.
- **U1 is the critical path.** If it can be completed in isolation, the ADR-016 recommendation can be formed even if U2-U5 slip. Do not let remote-node implementation work delay the pricing table.
- **One In Progress slot.** Do not start a second story until this one is done or stalled on an external dependency.
- **Commit convention:** `feat(workflow): ...` or `docs(adr): ...` with `Story: ST-088` trailer on every commit.
