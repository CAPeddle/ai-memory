# ExecPlan - ST-012: Add discoverable AI-governance asset catalog and validation

> Status: ✅ Ready for /continue
> Story: ST-012
> Created: 2026-05-05
> Parent: docs/investigations/awesome-copilot-applicability-review.md
> PLANS.md: This document must be maintained per .github/planning/execplans/_TEMPLATE.md

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

ST-012 adds a governed discovery layer for AI-governance assets in this repository. After completion, contributors and agents can discover what prompt, instruction, and skill assets exist; see the metadata contract that defines allowed fields and taxonomy; and run one local command that validates metadata completeness and drift.

Current governance files exist but are not discoverable through one machine-readable catalog plus one generated human-readable inventory. The board requires this story to provide: a metadata contract, a machine-readable inventory, validation guidance/automation, and contribution guidance that defines accepted, rejected, and deferred additions.

This plan uses these decisions locked during /plan:
1. Catalog outputs live at .github/planning/assets/asset-catalog.json and .github/planning/assets/asset-catalog.md.
2. Instruction files are brought into the same hybrid metadata model by adding frontmatter now.
3. Validation is implemented as a hybrid flow: a PowerShell wrapper command that calls a .NET validator.

Key files and modules touched by this story:
- .github/planning/assets/asset-catalog.json
- .github/planning/assets/asset-catalog.md
- .github/planning/assets/asset-catalog.schema.json
- .github/planning/assets/asset-catalog-source.json
- .github/planning/scripts/build-governance-catalog.ps1
- .github/planning/scripts/validate-governance-catalog.ps1
- tools/GovernanceAssetValidator/GovernanceAssetValidator.csproj
- tools/GovernanceAssetValidator/Program.cs
- tools/GovernanceAssetValidator.Tests/GovernanceAssetValidator.Tests.csproj
- tools/GovernanceAssetValidator.Tests/CatalogValidationTests.cs
- .github/instructions/coding-standards.instructions.md
- .github/instructions/session-resilience.instructions.md
- .github/prompts/plan.prompt.md
- .github/prompts/continue.prompt.md
- .github/skills/compound-engineering/SKILL.md
- docs/governance/asset-metadata-contract.md
- docs/governance/asset-contribution-policy.md

Definitions used in this plan:
- Asset metadata contract: required fields and allowed values for governance assets.
- Machine-readable catalog: JSON inventory used by scripts/agents.
- Human-readable inventory: generated Markdown view derived from the same source as JSON.
- Drift: mismatch between source metadata and generated catalog outputs.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:
- After running pwsh -File .github/planning/scripts/build-governance-catalog.ps1, both .github/planning/assets/asset-catalog.json and .github/planning/assets/asset-catalog.md are generated from the same source data.
- After running pwsh -File .github/planning/scripts/validate-governance-catalog.ps1, validation exits successfully when metadata and generated outputs are in sync, and returns non-zero when drift is introduced.
- After opening docs/governance/asset-metadata-contract.md, the contract explicitly covers prompts, instructions, skills, and reserved future categories (agents, hooks, workflows, plugins).
- After opening docs/governance/asset-contribution-policy.md, accepted, rejected, and deferred contribution patterns are explicitly listed for prompt/instruction/skill-style assets.
- After running dotnet test tools/GovernanceAssetValidator.Tests/GovernanceAssetValidator.Tests.csproj, validator tests pass.

---

## §2b. Definition of Ready

All checks must be [x] before /continue can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

(Empty - populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Metadata contract exists for prompts, instructions, skills, and future categories (board ST-012) | docs/governance/asset-metadata-contract.md includes current + reserved categories | Task 4.1 | Select-String for category names in contract doc |
| Machine-readable inventory exists (board ST-012) | .github/planning/assets/asset-catalog.json | Task 4.4 | Test-Path and JSON parse command succeeds |
| One generated human-readable inventory exists from same source (QP-012 + board ST-012) | .github/planning/assets/asset-catalog.md generated by same validator flow | Task 4.4 | build script output + header marker check |
| Validation catches metadata/drift issues locally (board ST-012) | validate-governance-catalog.ps1 + .NET validator return non-zero on drift | Task 4.3, Task 4.5 | red/green validation run results |
| Contribution guidance defines accepted/rejected/deferred additions (board ST-012) | docs/governance/asset-contribution-policy.md | Task 4.2 | Select-String for Accepted/Rejected/Deferred sections |
| Hybrid metadata model with in-file metadata for supported formats (QP-012) | frontmatter present in prompts, instructions, and skill docs; catalog source references file metadata | Task 4.2, Task 4.4 | frontmatter pattern checks in representative files |
| Instruction files explicitly included in metadata model (QP-012 open question resolved) | instruction files contain frontmatter and appear in generated catalog | Task 4.2, Task 4.4 | catalog includes instruction entries |
| Validation remains local command only (QP-012 enforcement boundary) | scripts under .github/planning/scripts; no CI workflow files changed | Task 4.5 | git status check shows no .github/workflows changes |
| Validation implementation is hybrid (PO decision) | pwsh wrappers call .NET validator executable path | Task 4.3, Task 4.5 | script content includes dotnet invocation |

---

## §3. Preconditions

Prerequisites:
- .NET SDK 8.0.100+ available: dotnet --version
- PowerShell 7+ available: pwsh --version
- Existing governance assets present under .github/prompts, .github/instructions, .github/skills

Files that must exist before starting:
- .github/planning/story-board.md
- .github/planning/query-packets/QP-012-governance-asset-catalog-validation.md

Boilerplate: frontmatter template for governance assets
```yaml
---
name: "Asset Name"
summary: "One-line purpose"
asset_type: "prompt|instruction|skill"
status: "active"
owners:
  - "team-or-person"
source_path: "relative/path.md"
---
```

Boilerplate: validator wrapper command
```powershell
pwsh -File .github/planning/scripts/validate-governance-catalog.ps1
```

Boilerplate: build command
```powershell
pwsh -File .github/planning/scripts/build-governance-catalog.ps1
```

Boilerplate: TDD sequence for validator behavior
1. Red: add or run a failing test/assertion proving drift is detected
2. Green: implement minimal validator change so drift detection passes intended cases
3. Refactor: clean structure without changing outcomes; tests remain green

---

## §4. Task Definitions

### Task 4.1: Create governance metadata contract artifacts

**Objective:** Define the contract and schema for governed asset metadata and taxonomy.

**Input:** Board ST-012 acceptance criteria and QP-012 decisions.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Create directory .github/planning/assets if missing.
2. Create docs/governance/asset-metadata-contract.md with sections: Purpose, In-Scope Asset Types, Reserved Future Categories, Required Metadata Fields, Optional Fields, and Generation Rules.
3. In the same doc, explicitly define categories: prompt, instruction, skill, agent (reserved), hook (reserved), workflow (reserved), plugin (reserved).
4. Create .github/planning/assets/asset-catalog.schema.json describing catalog structure and required fields.
5. Create .github/planning/assets/asset-catalog-source.json as canonical source file for reserved categories and generation metadata (do not hardcode generated catalog rows here).

**Expected output:** Contract doc, schema file, and source metadata file exist with explicit taxonomy and required fields.

**Requirement mapping:** Metadata contract, taxonomy breadth, and machine-readable contract structure.

**Verification:**
```powershell
Test-Path docs/governance/asset-metadata-contract.md
Test-Path .github/planning/assets/asset-catalog.schema.json
Test-Path .github/planning/assets/asset-catalog-source.json
Select-String -Path docs/governance/asset-metadata-contract.md -Pattern "prompt|instruction|skill|agent|hook|workflow|plugin"
```
Expected result: all paths return True and category names are found.

**Failure handling:** If any file cannot be created due to path errors, stop and correct path creation before continuing. Do not rename artifact paths without plan-review.

---

### Task 4.2: Add contribution guidance and normalize in-file metadata

**Objective:** Add explicit contribution policy and include instruction files in the frontmatter model.

**Input:** Task 4.1 outputs and existing governance asset files.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Create docs/governance/asset-contribution-policy.md with explicit sections: Accepted, Rejected, Deferred.
2. Add concrete examples under each section for prompts, instructions, and skills.
3. Add frontmatter metadata blocks to each .github/instructions/*.instructions.md file.
4. Verify frontmatter is also present in representative prompt and skill files (plan.prompt.md, continue.prompt.md, .github/skills/compound-engineering/SKILL.md); if missing, add frontmatter.
5. Keep existing content semantics unchanged; only prepend metadata blocks and minimal wording needed by contract.

**Expected output:** Policy doc exists and governed asset files contain frontmatter metadata including instructions.

**Requirement mapping:** Contribution guidance, hybrid metadata model, explicit instruction inclusion.

**Verification:**
```powershell
Test-Path docs/governance/asset-contribution-policy.md
Select-String -Path docs/governance/asset-contribution-policy.md -Pattern "Accepted|Rejected|Deferred"
Select-String -Path .github/instructions/*.md -Pattern "^---" -CaseSensitive
Select-String -Path .github/prompts/plan.prompt.md,.github/prompts/continue.prompt.md,.github/skills/compound-engineering/SKILL.md -Pattern "^---" -CaseSensitive
```
Expected result: all targeted files show frontmatter start markers and policy sections are found.

**Failure handling:** If a file format conflict appears (for example parser confusion in prompt docs), stop and escalate via plan-review rather than inventing a different metadata format.

---

### Task 4.3: Implement hybrid validator using explicit TDD red-green

**Objective:** Build the .NET validator and wrapper scripts, using TDD red-green sequencing.

**Input:** Contract/schema files and normalized metadata files from Tasks 4.1 and 4.2.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Create tools/GovernanceAssetValidator and tools/GovernanceAssetValidator.Tests projects.
2. Create initial tests in tools/GovernanceAssetValidator.Tests/CatalogValidationTests.cs for: missing required metadata field, duplicate asset id, and drift between generated markdown and json.
3. Run dotnet test tools/GovernanceAssetValidator.Tests/GovernanceAssetValidator.Tests.csproj and confirm at least one test fails (Red checkpoint).
4. Implement minimal validator logic in tools/GovernanceAssetValidator/Program.cs to satisfy failing tests.
5. Re-run dotnet test and confirm all tests pass (Green checkpoint).
6. Refactor validator code for readability only; re-run tests and keep green.
7. Create .github/planning/scripts/build-governance-catalog.ps1 to call the validator in build mode.
8. Create .github/planning/scripts/validate-governance-catalog.ps1 to call the validator in validate mode and propagate non-zero exit codes.

**Expected output:** Validator app, validator tests, and wrapper scripts exist; explicit red then green evidence is captured.

**Requirement mapping:** Hybrid validation implementation, local deterministic command, TDD sequencing requirement.

**Verification:**
```powershell
dotnet test tools/GovernanceAssetValidator.Tests/GovernanceAssetValidator.Tests.csproj
Select-String -Path .github/planning/scripts/build-governance-catalog.ps1,.github/planning/scripts/validate-governance-catalog.ps1 -Pattern "dotnet"
```
Expected result: tests pass at final state and wrapper scripts contain dotnet invocation.

**Failure handling:** If tests cannot be made to fail in Red step, stop and escalate because TDD sequence is not being executed correctly. If tests fail after Green attempt twice, escalate via plan-review.

---

### Task 4.4: Generate catalog outputs from shared source flow

**Objective:** Produce JSON and Markdown inventories from the same generation flow.

**Input:** Working validator and wrapper scripts from Task 4.3.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Run pwsh -File .github/planning/scripts/build-governance-catalog.ps1.
2. Ensure generated outputs are written to .github/planning/assets/asset-catalog.json and .github/planning/assets/asset-catalog.md.
3. Confirm instruction assets appear in generated outputs.
4. Confirm reserved future categories appear in generated output metadata section without requiring concrete file instances.

**Expected output:** Both catalog files are generated in target paths from same command.

**Requirement mapping:** Machine-readable inventory, human-readable generated inventory, instruction inclusion, future taxonomy.

**Verification:**
```powershell
Test-Path .github/planning/assets/asset-catalog.json
Test-Path .github/planning/assets/asset-catalog.md
Select-String -Path .github/planning/assets/asset-catalog.json -Pattern '"asset_type"\s*:\s*"instruction"'
Select-String -Path .github/planning/assets/asset-catalog.md -Pattern "instruction|agent|hook|workflow|plugin"
```
Expected result: both files exist and required category strings are present.

**Failure handling:** If generation writes to any path other than planned outputs, stop and fix script configuration before proceeding.

---

### Task 4.5: Validate drift behavior and local-command boundary

**Objective:** Prove validation catches drift and remains local-only.

**Input:** Generated catalog outputs from Task 4.4.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Run pwsh -File .github/planning/scripts/validate-governance-catalog.ps1 and confirm success on clean state.
2. Introduce controlled drift by editing one generated file (for example, remove one catalog entry line in asset-catalog.md).
3. Re-run validation and confirm non-zero failure (Red checkpoint for drift behavior).
4. Rebuild catalog using build-governance-catalog.ps1.
5. Re-run validation and confirm success (Green checkpoint for drift behavior).
6. Verify no CI workflow files were added/modified for this story.

**Expected output:** Validation command fails on drift and passes after regeneration; no CI enforcement artifacts added.

**Requirement mapping:** Validation guidance/automation and local-only enforcement boundary.

**Verification:**
```powershell
pwsh -File .github/planning/scripts/validate-governance-catalog.ps1
# introduce controlled drift manually
pwsh -File .github/planning/scripts/validate-governance-catalog.ps1
pwsh -File .github/planning/scripts/build-governance-catalog.ps1
pwsh -File .github/planning/scripts/validate-governance-catalog.ps1
git status --short .github/workflows
```
Expected result: first validate succeeds, drift validate fails, final validate succeeds, and workflows status output is empty.

**Failure handling:** If validation does not fail on drift, stop and escalate because drift detection requirement is unmet.

---

### Task 4.6: Close out story governance artifacts

**Objective:** Move ST-012 to Review and refresh session handoff state after all acceptance checks pass.

**Input:** Tasks 4.1-4.5 completed and verified.

**Working directory:** c:\projects\ai-memory\

**Steps:**
1. Update .github/planning/story-board.md by moving ST-012 from Backlog to Review.
2. Mark ST-012 acceptance criteria checkboxes as complete.
3. Add Completed date for ST-012.
4. Replace FollowUpSessionLog.txt with current session summary and ST-012 resume guidance.

**Expected output:** ST-012 appears in Review with completed criteria; FollowUpSessionLog reflects ST-012 completion and PO review step.

**Requirement mapping:** Workflow governance closeout and review handoff.

**Verification:**
```powershell
Select-String -Path .github/planning/story-board.md -Pattern "ST-012"
Select-String -Path FollowUpSessionLog.txt -Pattern "ST-012|Review"
```
Expected result: board and session log both reference ST-012 in review-ready state.

**Failure handling:** If board edits conflict with unrelated unstaged changes, stage and commit only ST-012 files and retry verification.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.3 - Implement hybrid validator using explicit TDD red-green |
| **Last successful command** | Select-String -Path .github/planning/scripts/build-governance-catalog.ps1,.github/planning/scripts/validate-governance-catalog.ps1 -Pattern "dotnet" |
| **Expected outputs produced** | tools/GovernanceAssetValidator; tools/GovernanceAssetValidator.Tests; build/validate wrapper scripts under .github/planning/scripts |
| **Next task** | Task 4.4 - Generate catalog outputs from shared source flow |
| **Known blockers** | None |
| **Last updated** | 2026-05-05T13:21:27.6829544+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-05T13:15:17.7529022+02:00 | Task 4.1 | completed | Created contract/schema/source files; Test-Path checks True; Select-String matched prompt/instruction/skill/agent/hook/workflow/plugin | Execute Task 4.2 |
| 2026-05-05T13:16:39.0481358+02:00 | Task 4.2 | completed | Added contribution policy and instruction frontmatter; verification found Accepted/Rejected/Deferred sections and frontmatter markers | Execute Task 4.3 |
| 2026-05-05T13:21:27.6829544+02:00 | Task 4.3 | completed | Red checkpoint failed (3 tests), then green checkpoint passed; refactor checkpoint remained green; wrapper scripts verified for dotnet invocation | Execute Task 4.4 |

### Avoidance

- 2026-05-05: Keep ST-012 validation local-only. Do not add CI workflows or pre-commit enforcement in this story.
- 2026-05-05: Follow explicit TDD red-green checkpoints for validator behavior; do not skip red checkpoints.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Hybrid validation (PowerShell wrappers + .NET validator) with generated JSON + Markdown catalogs | Before Task 4.3 implementation | 🟢 Active |
| 2 | PowerShell-only fallback validator if .NET validator cannot satisfy deterministic checks | Before Task 4.3 implementation | ⬜ Reserve |

### Approach Failure Log
(Empty - no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true -> propose rollback
- 3 failed attempts at same task -> MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution - timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

- 2026-05-05T13:21:27.6829544+02:00: Validator accepts `description` as fallback for `summary` and infers `asset_type` from path when missing to remain compatible with existing prompt/skill frontmatter while still enforcing missing-field and drift checks.

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification for all §2 acceptance criteria.
2. Update board: move ST-012 to Review.
3. Present results to PO with artifact links.
4. Record any governance drift discovered during execution in §6b.

---

## §7b. Outcomes & Retrospective

(Summarize at completion: what was achieved, what remains, lessons learned.)

Achieved: -
Remains: -
Lesson: -

---

## Revision Notes

- 2026-05-05: Initial ST-012 ExecPlan authored from approved QP-012 and PO phase-2 decisions (catalog paths, instruction metadata frontmatter, hybrid validator implementation).
