# Milestones

## v1.0 ST-088 Host Viability (Shipped: 2026-08-28)

**Phases completed:** 4 phases, 8 GSD-tracked plans (+ 2 pre-GSD phases delivered via `docs/plans/`), 11 tasks
**Git range:** `20aac70`..`86473ac` — 91 commits, 140 files changed, +40112/-247 LOC
**Timeline:** 2026-08-05 → 2026-08-28 (23 days)
**Requirements:** 14/14 v1 requirements complete

**Key accomplishments:**

- Priced and classified all 15 policy-scope enforcement/egress paths, discharging the ADR-016 acceptance gate with a defended 64+ hour enforcement estimate (Phase 1).
- Built the remote-node hub: idempotent node registration and event ingestion, with node credentials fully isolated from platform MCP auth in both directions and no impact on server boot (Phase 2).
- Shipped a reliable Node.js AWCP client — bounded spool with oldest-first eviction and a visible drop counter, ack-gated multi-batch `flush()`, and a durable `client_seq` counter proven to survive a drained or deleted spool (Phase 3).
- Mapped every hub failure mode (400/401/unreachable) to a stated retry/backoff/terminal policy, and found and fixed a genuine infinite-loop bug (a zero-progress "acked" response) along the way (Phase 3).
- Proved zero regression against the pre-existing suite (400/400 identical test identity+outcome) and corpus (33/33 rows unchanged) while adding the new workflow surface (Phase 3).
- Enrolled a real remote node (z2) and demonstrated all eight reliable-delivery behaviours against the dev hub over the tailnet, discharging ADR-016 criterion 6 with real-node evidence rather than database rows (Phase 3).
- Delivered the final ADR-016 recommendation, reconciling all five evidence inputs (pricing, node experiments, execution-blocking finding, blast-radius, code drift): **reject Candidate A**, direct a standalone AWCP peer service — a fourth outcome the criteria didn't anticipate. Accepted (rev 1.5), merged via PR #60 (Phase 4).

**Known gaps (accepted at close):** `/gsd-audit-milestone` scored this `gaps_found` — 8 requirements (SCOPE-01/02, NODE-01/02/03, BLOCK-01, HOST-01/02) show as orphaned/partial purely because Phases 1 and 4 have no `.planning/phases/` directory and Phases 2-3 lack `VERIFICATION.md`. The audit's own verdict: zero broken cross-phase links, all requirements have real delivery evidence (commits, tests, PRs, ADR text) — this is missing GSD tracking artifacts, not undelivered work. Proceeded with `--force` past the milestone-complete tool's unstarted-phase guard on that basis. Two non-blocking warnings also carried forward: **W1** (no read surface for `workflow.execution_nodes`/`run_events` — DB-only) and **W3** (`FEATURE_WORKFLOW` exposed unauthenticated on `0.0.0.0:3000` on the base `mcp` service, no data leak, now owned by ST-102). Known verification overrides: 8 requirement-tracking gaps + 2 warnings, 0 carried forward from a prior close.

---
