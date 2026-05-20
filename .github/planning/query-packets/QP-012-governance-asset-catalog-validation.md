# Query Packet — ST-012: Governance asset catalog and validation

> Story: ST-012
> Created: 2026-05-04
> Updated: 2026-05-05 (Phase 2 direction locked)
> Source: board-next planning target plus PO scoping during `/plan`
> Status: Scoped + Phase 2 decisions locked — ready for ExecPlan finalization

## Intent

Create a governed asset-discovery layer for ai-memory that makes prompt, instruction, skill, and future agent-style assets easy to find, easy to validate, and easy to extend safely. The primary PO goal for this story is not raw inventory generation. The primary goal is to define clear repository-level contribution policy for prompt/instruction/skill-style artifacts, then back that policy with a metadata contract, a machine-readable catalog, a generated human-readable view, and a local validation command.

## Collaborative Scoping Decisions (2026-05-04)

The following decisions were locked during Phase 1 scoping with the PO:

### Priority order
- Lead with contribution policy first.
- Validation is still in scope, but only as a local repo command or script, not CI enforcement.
- The story should produce a usable governance layer now rather than just documentation that defers implementation.

### Taxonomy breadth
- The catalog should cover a **full future taxonomy**, not only the asset types already populated in the repo.
- Current repo assets still anchor the implementation, but the metadata contract must also define categories for future asset types such as agents, hooks, workflows, and plugins.
- The executor should not create or populate those future asset types unless explicitly required by the plan; the story is about defining the taxonomy and governance contract, not expanding the repo surface area prematurely.

### Human-readable output
- The story must produce **one generated human-readable inventory** derived from the same underlying source data as the machine-readable catalog.
- Multiple generated views are out of scope.

### Metadata model
- Use a **hybrid metadata model**.
- Asset files should carry metadata where the file format already supports it cleanly, such as frontmatter-bearing prompt and skill files.
- A central generated registry should remain the discovery and validation surface.
- The plan must explicitly address instruction files, which currently do not use frontmatter.

### Scope boundary
- Include prompts, instructions, skills, and future agent-style governance assets in the contract and catalog.
- Exclude planning artifacts such as ExecPlans, query packets, audit reports, and the story board from the ST-012 asset inventory.
- The story may still reference planning artifacts in contribution guidance if needed, but they are not catalog entries.

### Enforcement boundary
- Validation stops at a **local validation script or command**.
- No CI workflow, required pre-commit hook, or server-side enforcement is in scope for this story.
- The validation workflow should catch metadata completeness problems and drift between metadata, the machine-readable catalog, and the generated human-readable view.

## Repository Context Snapshot

Current observed asset surface relevant to this story:

- Prompt files exist under `.github/prompts/` and already use frontmatter.
- Instruction files exist under `.github/instructions/` and currently do not use frontmatter.
- A skill folder exists at `.github/skills/compound-engineering/` and its `SKILL.md` already uses frontmatter.
- Planning files exist under `.github/planning/`, but they are intentionally excluded from the catalog scope for this story.

This means the story cannot assume a single existing metadata shape across all governed asset types. The ExecPlan must give explicit instructions for how the hybrid contract works for each in-scope class.

## Deliverables

1. A documented metadata contract for ai-memory governance assets, including current asset types and reserved future taxonomy categories.
2. One machine-readable asset catalog or registry that represents the governed inventory and intended-use metadata.
3. One human-readable generated inventory derived from the same source data.
4. Repository contribution guidance defining what prompt/instruction/skill-style additions are accepted, rejected, or deferred.
5. One local validation script or command that checks metadata completeness and drift between the contract, the machine-readable catalog, and the generated human-readable inventory.

## Scope

In scope:
- Define the repository-level governance asset taxonomy for current and future asset classes
- Establish the metadata contract for prompts, instructions, skills, and future agent-style assets
- Decide and document how instruction files participate in the hybrid metadata model
- Create a machine-readable asset registry or catalog
- Create one generated human-readable discovery document from the same source data
- Add contribution guidance with accepted, rejected, and deferred addition patterns
- Add a local validation script or command for metadata and catalog drift checks

Out of scope:
- Adding CI enforcement or required automated gates outside a local validation command
- Creating new future asset categories just to fill out the taxonomy
- Cataloging planning artifacts such as ExecPlans, query packets, audit reports, or the board
- Broad repo restructuring unrelated to governance asset discovery
- Full public marketplace packaging or external distribution patterns

## Design Constraints For Phase 2

1. Metadata should be treated as the source of truth, with the generated human-readable inventory acting as a published view.
2. The plan must preserve the repo's workflow-first governance model and not weaken the existing `/plan` and `/continue` controls.
3. The local validation command should be deterministic and repo-local so a future executor can run it mechanically.
4. The plan must avoid forcing broad file-format changes without explicit task instructions, especially for instruction files that currently lack frontmatter.
5. The future taxonomy must be explicit enough to guide later additions, but not so elaborate that ST-012 becomes a speculative framework-design story.

## Risks And Watch Points

1. A full future taxonomy could sprawl if the plan does not clearly separate current implemented asset types from reserved future categories.
2. A hybrid metadata model can become ambiguous if the contract does not specify which fields live in-file versus in the central registry.
3. Generated human-readable output can drift quickly unless regeneration and validation steps are fully explicit.
4. Contribution guidance can become hand-wavy unless it defines concrete accepted, rejected, and deferred patterns with examples.

## Phase 2 Decisions Locked (2026-05-05)

1. Machine-readable registry path: `.github/planning/assets/asset-catalog.json`.
2. Generated human-readable inventory path: `.github/planning/assets/asset-catalog.md`.
3. Instruction metadata model: add frontmatter to instruction files now.
4. Validation implementation: hybrid local command using PowerShell wrappers that call a .NET validator.

## Recommended Next Step

Compact context, then begin Phase 2 using only this query packet as input. The next artifact should be `.github/planning/execplans/exec-plan-ST-012.md` authored against the existing ExecPlan template and marked Ready only after the §2b Definition of Ready is fully satisfied.