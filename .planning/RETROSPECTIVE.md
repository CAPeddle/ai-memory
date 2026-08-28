# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — ST-088 Host Viability

**Shipped:** 2026-08-28
**Phases:** 4 | **Plans:** 8 GSD-tracked (+2 pre-GSD) | **Sessions:** —

### What Was Built
- Policy-scope enforcement pricing across all 15 retrieval/egress paths, discharging the ADR-016 acceptance gate
- A remote-node hub (registration, idempotent event ingestion) fully isolated from platform MCP auth
- A reliable Node.js AWCP client — bounded spool, ack-gated flush, proven duplicate/disconnection/auth-failure handling, validated against a real enrolled node
- The final ADR-016 host recommendation: reject Candidate A, direct a standalone AWCP peer service

### What Worked
- Wave-sequenced execution in Phase 3 (strict dependency ordering on a shared, overlapping file) avoided race conditions across 6 plans touching the same client file.
- Treating the real-node enrollment window as a scarce, protected resource (opened once, used, closed; destructive full-suite runs sequenced to complete before enrollment) preserved criterion-6 evidence that a routine test run would otherwise have destroyed.
- Letting Phase 1 and Phase 4 ship as spikes through `docs/plans/` and the story board — rather than forcing full GSD phase machinery onto small, mostly-documentation units — kept those units fast.

### What Was Inefficient
- Phases 1 and 4 shipping without a `.planning/phases/NN-*` directory meant no `SUMMARY.md`/`VERIFICATION.md` existed for them, which surfaced as 8 "orphaned/partial" requirements at `/gsd-audit-milestone` and tripped the milestone-complete tool's unstarted-phase guard (needed `--force`) — real, delivered work read as ambiguous purely from artifact absence.
- `STATE.md`'s `progress.*` and `milestone_name` frontmatter are derived from a phase-directory disk scan that discards hand-set values and can only ever see phases with a directory — this silently corrupted `milestone_name` and zeroed `completed_phases`/`percent` at least twice before this close (once 2026-08-22, again during this close's own archival step) and required manual repair each time.
- A cross-phase handoff (Phase 3 → Phase 4, the `FEATURE_WORKFLOW` exposure disposition) was named in `03-VERIFICATION.md`'s prose as "Phase 4 owns it" but never actually reached Phase 4's ROADMAP entry — it was caught only by the milestone audit (W3), immediately before it would have archived unowned.

### Patterns Established
- A phase delivered outside GSD's own phase mechanism (spike, pre-GSD, docs-only) should still get a minimal `.planning/phases/NN-*` directory carrying at least a `SUMMARY.md`, purely so milestone-close tooling (the unstarted-phase guard, the audit's 3-source cross-reference) can see it as done rather than absent.
- ROADMAP.md is the progress authority, not `STATE.md` frontmatter — the frontmatter's `progress.*`/`milestone_name` fields are a disk-scan projection, not a source of truth, and get silently recomputed on operations that touch STATE.md.

### Key Lessons
1. Artifact-absence gaps at milestone close (`gaps_found` with a `gate_note` calling out artifact absence specifically) are a tracking-coverage problem, not a delivery problem — verify against the audit's own verdict paragraph and requirement-by-requirement evidence before treating the status label at face value.
2. A cross-phase "next phase owns this" handoff written only as prose inside one phase's verification doc does not reliably propagate to the receiving phase — it needs to land as an actual line item in the receiving phase's ROADMAP entry, or it surfaces only at milestone audit, if at all.
3. When a milestone-completion CLI's `--force` override is needed, re-verify the underlying condition it's overriding (directory presence, in this case) rather than assuming the guard is wrong — here the guard was correct, and the right fix was accepting the override with disclosure, not fighting the tool.

### Cost Observations
- Model mix: — (not tracked this milestone)
- Sessions: —
- Notable: none

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | — | 4 | GSD brownfield-initialized mid-milestone (2026-08-05); Phases 1 and 4 shipped pre-GSD via `docs/plans/` |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 400+ (server/tests/) | not measured | `awcp-node-client.mjs` (zero npm deps, plain Node ESM) |

### Top Lessons (Verified Across Milestones)

1. A phase without a `.planning/phases/NN-*` directory reads as "unstarted" to milestone-close tooling regardless of actual delivery status — give every phase a directory even when work ships elsewhere.
