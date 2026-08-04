---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
story: ST-090
product_contract_source: ce-plan-bootstrap
plan_type: chore
created: 2026-08-04
---

# chore: Clear governance frontmatter gaps and wire validator CI gate

## Goal Capsule

Make `dotnet run --project tools/GovernanceAssetValidator -- validate .` exit 0 by resolving the seven governance frontmatter gaps deliberately, then wire that command as a required CI step so future gaps are caught automatically. Two of the seven are live instruction files that need real metadata; five are legacy prompt files pending deletion under ST-066 that must not receive fake `owners`.

---

## Requirements

- **R1** — `dotnet run --project tools/GovernanceAssetValidator -- validate .` exits 0 with zero findings.
- **R2** — Each gap is resolved deliberately: real metadata for live assets, formal retirement marker for ST-066-bound files. No filler.
- **R3** — The five legacy `.prompt.md` files receive a `status: retired` disposition that the validator respects, consistent with ST-066 (which will delete them) — no `owners` field added.
- **R4** — The two live `.instructions.md` files have accurate `name`, `summary`, and `owners` frontmatter.
- **R5** — A `dotnet run --project tools/GovernanceAssetValidator -- validate .` step is added as the last step of the `dotnet-build` CI job.
- **R6** — Red control before ticking R5: strip a required field from one asset, confirm the new CI step turns the build red, revert, confirm green.

---

## Key Technical Decisions

**KTD1** — Resolve legacy prompt file gap via `status: retired` validator exclusion, not fake `owners`.
Adding placeholder `owners` to files ST-066 will delete creates churn and misleads the catalog about governance coverage. `status: retired` is the deliberate disposition that matches the deprecation banners already on these files. The validator is updated to skip retired assets entirely (no catalog entry, no errors). This also fixes code-review finding #5 — the dead `?? "active"` default that made the status check unreachable — by making `status` a meaningful field.
Governs R2, R3.

**KTD2** — Validator `status: retired` skip fires before the owners check, not after.
Retired assets are not in scope for the catalog at all — they should produce neither errors nor catalog rows. The skip is an early-return at the top of `ValidateAndBuildAsset`, ahead of `CollectMissingFields`, so retired assets leave no trace in either the error list or the output catalog.
Governs R1, R3.

**KTD3** — Remove the `?? "active"` status default in `ValidateAndBuildAsset` at the same time.
Once `status: retired` is a real exclusion gate, the fallback silently accepts assets with no `status` field as active and bypasses the required-field check. Removing the default enforces `status` as required for non-excluded assets — consistent with `RequiredFields` — and eliminates the dead-code contradiction flagged in the code review.
Governs R1, R2. (session-settled: user-approved — fixes dead-check defect identified in ST-089 code review finding #5; alternative of keeping the default would leave the enforcement gap intact)

**KTD4** — CI step uses `dotnet run --project ...` (not a published binary or test adapter).
The validator is a tool project, not a test project. `dotnet run` is the correct entry point and matches the documented command in CLAUDE.md. No changes to the solution's test infrastructure.
Governs R5.

---

## Scope Boundaries

### In scope
- Validator `ValidateAndBuildAsset` logic: `status: retired` early-return, remove `?? "active"` default.
- Frontmatter on seven affected files (five retired prompt files, two live instructions files).
- One new CI step in `.github/workflows/ci.yml` (`dotnet-build` job).
- Red control to verify the gate is live.

### Deferred to Follow-Up Work
- ST-066: actual migration/deletion of the five legacy prompt files. ST-090 only marks them retired so the validator is satisfied; ST-066 owns the rewrite and deletion.
- Code-review findings #1–#4, #6–#12 from the ST-089 review (SDK pin, Release/Debug, exception handling, JsonOptions, etc.) — separate story.

### Out of scope
- Adding tests for `GovernanceAssetValidator` (no test project exists; tracked as a testing gap in the ST-089 review).
- Changing the validator's discovery patterns, source metadata, or catalog output format.

---

## Implementation Units

### U1. Add `status: retired` exclusion to validator and remove dead status default

**Goal:** The validator skips assets with `status: retired` entirely (no errors, no catalog row), and removes the `?? "active"` fallback so `status` is enforced as required for active assets.

**Requirements:** R1, R2, R3 (KTD1, KTD2, KTD3)

**Dependencies:** none

**Files:**
- `tools/GovernanceAssetValidator/CatalogValidationEngine.cs`

**Approach:**
1. In `ValidateAndBuildAsset`, read `status` from frontmatter without the `?? "active"` default: `var status = ReadString(frontmatter, "status");`
2. Add an early return immediately after reading `status` (before `CollectMissingFields`): if `string.Equals(status, "retired", StringComparison.OrdinalIgnoreCase)` → return `null` and add nothing to `errors`. Returning `null` from `ValidateAndBuildAsset` already causes the caller (`DiscoverAndValidateAssets`) to skip the asset — no catalog row, no error entry.
3. Leave `CollectMissingFields` unchanged — `status` remains in the checks array, and without the `?? "active"` default it will correctly report missing `status` on non-retired assets.

**Patterns to follow:** existing `return null` paths in `ValidateAndBuildAsset` (e.g., the unsupported `asset_type` check at line ~221).

**Test scenarios:**
- Asset with `status: retired` and missing `owners` → validator reports zero errors for that asset, asset absent from catalog output.
- Asset with `status: retired` and complete metadata → same: no catalog row, no error.
- Asset with no `status` field → validator reports `Missing required metadata field(s): status` (the default removal makes this enforceable).
- Asset with `status: active` and complete metadata → included in catalog normally.
- `Test expectation: none` for the `StringComparison.OrdinalIgnoreCase` branch — covered by the retired-asset scenarios above.

**Verification:** `dotnet build src/AiMemory.sln` exits 0, 0 errors.

---

### U2. Add `status: retired` to five legacy prompt files

**Goal:** The five `.github/prompts/*.prompt.md` files gain a `status: retired` frontmatter field, making their retirement formal and validator-visible without adding fake `owners`.

**Requirements:** R2, R3

**Dependencies:** U1 (validator must understand `status: retired` before these files are touched; otherwise `dotnet run ... validate .` would still report errors)

**Files:**
- `.github/prompts/plan.prompt.md`
- `.github/prompts/plan-new.prompt.md`
- `.github/prompts/continue.prompt.md`
- `.github/prompts/recover.prompt.md`
- `.github/prompts/governance-review.prompt.md`

**Approach:**
Each file already has a `name` and `description` in its YAML frontmatter block and carries a deprecation banner in the body. Add `status: retired` to the existing frontmatter block. Do not add `owners`. Example for `plan.prompt.md`:

```yaml
---
name: "Plan"
description: "..."
agent: "agent"
status: retired
---
```

The `asset_type` is inferred by the validator from the directory (`prompt`) — no field needed. The `owners` field is deliberately absent; the validator's U1 early-return skips the owners check for retired assets.

**Patterns to follow:** existing frontmatter blocks in the same files.

**Test scenarios:**
- After adding `status: retired` to all five, run `dotnet run --project tools/GovernanceAssetValidator -- validate .` → zero errors from the five prompt files. (Full zero-finding verification is U4's gate.)

**Verification:** `dotnet run --project tools/GovernanceAssetValidator -- validate .` no longer emits errors for any `.github/prompts/*.prompt.md` file.

---

### U3. Add real metadata to two live instructions files

**Goal:** The two `.github/instructions/*.instructions.md` files that auto-load into Copilot sessions get accurate `name`, `summary`, and `owners` frontmatter so the validator includes them in the catalog correctly.

**Requirements:** R1, R2, R4

**Dependencies:** none (independent of U1/U2)

**Files:**
- `.github/instructions/compound-engineering-wsl2.instructions.md`
- `.github/instructions/dev-environment.instructions.md`

**Approach:**
Both files currently have only `applyTo: "**"` in their frontmatter. Extend each frontmatter block with the required fields. The `asset_type` is inferred as `instruction` from the directory — no field needed. The `source_path` is inferred from the relative file path — no field needed.

Proposed metadata:

**`compound-engineering-wsl2.instructions.md`:**
```yaml
---
name: "Compound Engineering WSL2 Remote"
summary: "Path-translation rules for ce-* skills running in a WSL2 remote opened from VS Code on Windows"
status: active
owners:
  - ai-memory-maintainers
applyTo: "**"
---
```

**`dev-environment.instructions.md`:**
```yaml
---
name: "Dev Environment"
summary: "Native Deno and Docker Compose commands for the ai-memory dev and test stacks"
status: active
owners:
  - ai-memory-maintainers
applyTo: "**"
---
```

Note: `status: active` is now a required field (KTD3 removes the `?? "active"` default), so it must be explicit.

**Test scenarios:**
- After adding metadata, `dotnet run --project tools/GovernanceAssetValidator -- validate .` reports no errors for either instructions file.
- Catalog output includes both files with correct `name`, `summary`, `owners`, `asset_type: instruction`.

**Verification:** `dotnet run --project tools/GovernanceAssetValidator -- validate .` exits 0 for the instructions files. Catalog JSON includes both assets.

---

### U4. Wire validator into CI and run red control

**Goal:** Add `dotnet run --project tools/GovernanceAssetValidator -- validate .` as the final step of the `dotnet-build` CI job; confirm via red control that it gates a build.

**Requirements:** R5, R6

**Dependencies:** U1, U2, U3 (validator must exit 0 before the step can land — adding it while it exits 1 would break every CI run)

**Files:**
- `.github/workflows/ci.yml`

**Approach:**
Add a new step at the end of the `dotnet-build` job's `steps:` list, after the existing `dotnet test` step:

```yaml
- name: Validate governance asset catalog
  run: dotnet run --project tools/GovernanceAssetValidator -- validate .
```

No `--no-build` flag — the tool project is not part of the solution build's output; `dotnet run` handles the build transparently. The step runs from the repo root (`$GITHUB_WORKSPACE`), which is the `repoRoot` argument the validator receives via `.`.

**Red control (required before ticking R6):**
1. Strip `owners` from one of the two instructions files (e.g., remove the `owners:` list from `compound-engineering-wsl2.instructions.md`).
2. Commit to the branch.
3. Confirm CI `dotnet-build` job fails on the new step with a finding reported.
4. Revert the change.
5. Confirm CI returns green.

Per [docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md](../solutions/conventions/verification-mechanisms-need-adversarial-review.md).

**Test scenarios:**
- After landing U4, pushing a branch with a deliberate frontmatter gap → `dotnet-build` CI job fails at the validate step with a non-zero exit code and the missing-field message visible in logs.
- Reverting the gap → CI returns green.
- `Test expectation: none` for the `dotnet run` invocation itself — the tool's correctness is validated by U1–U3's verification steps.

**Verification:**
- `dotnet run --project tools/GovernanceAssetValidator -- validate .` exits 0 from repo root.
- CI `dotnet-build` job passes end-to-end on the branch.
- Red control executed and documented per AC.

---

## Verification Contract

1. `dotnet run --project tools/GovernanceAssetValidator -- validate .` exits 0, zero findings.
2. `dotnet build src/AiMemory.sln` exits 0, 0 errors.
3. `dotnet test src/AiMemory.sln` exits 0, 1/1 passed.
4. CI `dotnet-build` job passes with the new validate step present.
5. Red control: deliberate frontmatter gap → CI fails on validate step → revert → CI green. Documented in commit message or session log.

---

## Definition of Done

- [ ] Validator exits 0 with zero findings on the repo.
- [ ] Five legacy prompt files carry `status: retired`; no `owners` field added.
- [ ] Two live instructions files have complete, accurate frontmatter (`name`, `summary`, `status: active`, `owners`).
- [ ] `dotnet-build` CI job includes a `Validate governance asset catalog` step as its final step.
- [ ] Red control executed and confirmed.
- [ ] All Verification Contract gates pass.
- [ ] Story: ST-090 trailer on the squash commit.

---

## Sources & Research

- Story board entry: `.github/planning/story-board.md` § ST-090
- Validator output (2026-08-03): seven findings confirmed by `dotnet run --project tools/GovernanceAssetValidator -- validate .`
- Code review findings (ST-089 review, 2026-08-03): finding #5 (dead status check) resolved by KTD3
- ST-066 disposition: `.github/planning/story-board.md` § ST-066 — migration of the five legacy prompt files is unstarted; retirement marker is the safe interim disposition
- Referenced solution: `docs/solutions/conventions/verification-mechanisms-need-adversarial-review.md` (red control protocol for U4)
