# Query Packet — ST-013: Split investigation docs into landing pages and focused fragments

> Story: ST-013
> Created: 2026-05-03
> Updated: 2026-05-17
> Source: PO-guided planning session
> Status: Scoped packet for ExecPlan drafting

## Intent

Restructure the investigation corpus so future planning and execution sessions can follow the repository's "point, don't dump" rule when reading design authority. The desired result is a landing-page-plus-fragments model: each current top-level investigation file stays in place as a compact entry point, while the detailed content moves into focused subdocuments under a same-name folder.

## Current State

The repository currently treats eight top-level files under `docs/investigations/` as the design authority for architecture, workflow, storage, and external-reference decisions. Those files are useful, but several of them are large enough that planners must load broad monoliths to answer narrow questions. Governance consumers such as `.github/copilot-instructions.md`, `.github/prompts/plan.prompt.md`, `.github/prompts/plan-new.prompt.md`, `.github/planning/story-board.md`, and `.github/planning/query-packets/QP-011-governance-review-remediation.md` currently point to the monolith layout.

The board changed during scoping: `ST-012` is already reserved for a different governance story, so this work now occupies `ST-013` and remains blocked by `ST-011`.

## Research Findings

1. `docs/investigations/context-engineering-principles.md` explicitly establishes "point, don't dump" as a core rule, but the current investigation set does not apply that rule to itself.
2. `.github/copilot-instructions.md` names the eight current top-level investigation files as the design authority, so any split must preserve those paths or clearly restate how authority is retained.
3. The planning prompts and active governance packet read the workflow and context-engineering investigations at the file level, which is workable today but imprecise once those top-level files become compact landing pages.
4. Backlog stories reference investigation docs from `.github/planning/story-board.md`; references that depend on old section numbers or monolith-style expectations will need refinement once the split lands.
5. The story is broad enough to touch both governance files and the entire investigation corpus, so it should stay sequenced behind `ST-011` to reduce concurrent churn in `.github/prompts/` and `.github/planning/`.

## Design Decisions Locked In

1. This is a separate story, not part of `ST-011`.
2. The story type is `infrastructure`, with `Value: 4`.
3. The story enters Backlog and remains blocked by `ST-011`.
4. All eight current investigation documents are in scope.
5. The split is physical, not merely additive: detailed content moves into per-topic folders under `docs/investigations/`.
6. Each existing top-level investigation file remains in place as a compact landing page.
7. Main governance consumers are in scope for updates so the new structure is immediately usable.
8. The split must preserve the existing investigation set as design authority rather than re-litigating or changing approved technical decisions.

## Scope Locked (2026-05-17)

In scope:
- Include all investigation content under `docs/investigations/`, including top-level investigation files plus nested research trees (for example `Discussions/` and `Youtube/`), in a consistent landing-page-plus-fragments structure
- Use **hybrid fragment granularity**: section-level fragments by default, with subsection splits only for oversized sections
- Preserve and relink the current design-authority paths via compact landing pages (landing-page-first reference policy)
- Update governance consumers so references default to landing pages, and use fragment-level links where precision is clearly beneficial
- Require a **section mapping matrix** as proof that every original major section has a destination and no approved content is dropped
- Produce an ExecPlan precise enough for a cost-efficient executor to perform the split mechanically

Out of scope:
- Changing runtime product code under `src/` or `tests/`
- Revising approved architecture decisions, storage choices, or workflow governance decisions beyond structural reorganization
- Expanding `ST-012` or merging this work into the asset-catalog effort

## Direction Decisions (Locked)

1. **Target story:** Continue with ST-013.
2. **Session objective:** Complete Phase 1 scoping updates and produce a revised Phase 2 ExecPlan draft.
3. **Fragment granularity:** Hybrid (section-level default, subsection split when needed).
4. **Governance-link policy:** Landing-page first; fragment links where precision materially helps.
5. **Completeness proof:** Section mapping matrix is required.
6. **Coverage scope:** Include all investigation content under `docs/investigations/`.
7. **Dependency handling:** Keep execution blocked behind ST-011; planning artifacts may be prepared now.
8. **Board edits allowed in planning run:** Metadata-only cleanup is permitted.

## Risks And Watch Points

1. If landing pages become too verbose, the split will recreate the same context-dump problem in a new shape.
2. If fragment names or links are inconsistent across investigations, planning prompts will become harder to maintain rather than easier.
3. If section-specific board or prompt references are not updated, the split will leave stale references that imply content still exists in the old monolith locations.
4. If `ST-011` changes the same governance files first, this packet and its future ExecPlan will need a refresh before execution starts.
5. The expanded scope (all investigations, including nested trees) increases mechanical workload and verification cost; the plan must rely on inventory-driven steps to prevent omissions.

## Artifacts To Read First During `/plan`

1. `.github/planning/story-board.md`
2. `.github/copilot-instructions.md`
3. `.github/prompts/plan.prompt.md`
4. `.github/prompts/plan-new.prompt.md`
5. `.github/planning/query-packets/QP-011-governance-review-remediation.md`
6. `docs/investigations/memory-architecture-design.md`
7. `docs/investigations/language-stack-recommendation.md`
8. `docs/investigations/sqlite-vs-postgresql.md`
9. `docs/investigations/interface-design-mcp-rest.md`
10. `docs/investigations/workflow-and-prompt-design.md`
11. `docs/investigations/context-engineering-principles.md`
12. `docs/investigations/openclaw-official-docs-review.md`
13. `docs/investigations/openclaw-memory-architecture-analysis.md`

Inventory-driven scope inputs:
14. `docs/investigations/Discussions/`
15. `docs/investigations/Youtube/`

## Suggested Outcome For ST-013

Produce an ExecPlan that defines a repeatable split contract for all investigation content under `docs/investigations/`, creates focused fragment sets with hybrid granularity, preserves the current top-level filenames as entry-point landing pages, applies landing-page-first governance references, and verifies completeness with a section mapping matrix.
