# Governance Asset Contribution Policy

## Purpose

This policy defines which governance-asset contributions are accepted, rejected, or deferred for this repository.
It applies to prompt, instruction, and skill-style assets covered by ST-012.

## Accepted

The following contribution patterns are accepted:

- Prompt assets that define clear workflow behavior and reference governed artifacts.
- Instruction assets that set repository-wide rules with concrete scope and enforcement intent.
- Skill assets that package optional, domain-specific workflows with clear activation criteria.
- Metadata updates that keep frontmatter complete and aligned with the metadata contract.
- Catalog generator or validator updates that preserve local-command validation and deterministic output paths.

### Accepted examples

- Add frontmatter to an instruction file that currently lacks required fields.
- Add a prompt rule that clarifies how plan-review escalation is triggered.
- Add a skill note that captures recurring governance drift remediation patterns.

## Rejected

The following contribution patterns are rejected:

- Prompt, instruction, or skill files without required frontmatter metadata.
- Asset additions that bypass the catalog source and generated output flow.
- Governance assets that conflict with existing board-driven workflow rules.
- Changes that move validation enforcement to CI for ST-012 scope.
- Duplicate assets that restate existing behavior without adding new scope or evidence.

### Rejected examples

- Add a new prompt file without name, summary, owners, or source_path metadata.
- Edit generated catalog outputs directly instead of using the build script.
- Introduce a workflow that allows /continue to improvise around plan gaps.

## Deferred

The following contribution patterns are deferred pending future stories:

- New reserved category implementations (agent, hook, workflow, plugin) with concrete runtime integration.
- CI-based enforcement or pre-commit hooks for governance-catalog validation.
- Cross-repository metadata federation or external catalog publication.

### Deferred examples

- Add a new agent asset category implementation before a story explicitly scopes it.
- Add GitHub Actions validation for governance-catalog drift in ST-012.
- Publish governance catalog artifacts to an external service.
