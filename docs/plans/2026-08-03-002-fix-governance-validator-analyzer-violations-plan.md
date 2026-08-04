---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
story: ST-089
created: 2026-08-03
---

# fix: Wire `GovernanceAssetValidator` into the analyzer gate and fix accumulated violations

## Goal Capsule

`dotnet run --project tools/GovernanceAssetValidator -- validate .` — a command documented in CLAUDE.md — did not build at HEAD. The tool was absent from `src/AiMemory.sln` and CI, so `Directory.Build.props`'s four analyzers and `TreatWarningsAsErrors=true` had never been enforced against it. This story fixed ~25 violations across 8 error categories, split the single-file layout into per-type files, added the project to the solution, wired a `dotnet-build` CI job, and ran a red control confirming the gate is live.

---

## Problem Frame

| Rule | Description | Count |
|---|---|---|
| SA1402 / MA0048 | Multiple types in one file / filename must match type | 12 |
| SA1503 | Braces omitted on single-line if | 6 |
| SA1413 | Missing trailing comma in multi-line initializer | 3 |
| MA0051 | Method too long (`Generate`: 116 lines; max 60) | 1 |
| S2325 | `Build`/`Validate` not static (no instance state) | 2 |
| MA0006 | Use `string.Equals` instead of `==`/`!=` | 2 |
| CA1305 | `StringBuilder.AppendLine` needs `IFormatProvider` | 2 |
| CA1859 | Return concrete `List<string>` not interface | 1 |

Confirmed not version or environment drift: reproduces on SDK 8.0.100 and 10.0.110.

---

## Requirements

- **R1** — `dotnet run --project tools/GovernanceAssetValidator -- validate .` builds and runs with no `-p:` overrides.
- **R2** — All violations resolved deliberately; no blanket `<NoWarn>` or `#pragma warning disable`.
- **R3** — Project in `src/AiMemory.sln`; `dotnet build src/AiMemory.sln` builds it.
- **R4** — CI job builds the solution on every push/PR to `main`.
- **R5** — Red control: deliberate violation introduced, build failure confirmed, reverted.
- **R6** — `dotnet test` continues to pass.

---

## Key Technical Decisions

**KTD1** — Split multi-type `Program.cs` into per-type files (SA1402/MA0048).
One type per file is the correct fix per coding standards. Private nested records (`CatalogGenerationResult`, `AssetRecord`) remain nested inside `CatalogValidationEngine`.

**KTD2** — Make `Build` and `Validate` static on `CatalogValidationEngine` (S2325).
Neither method reads instance state. Call sites in `Program.cs` updated to static dispatch.

**KTD3** — Extract helpers from long methods (MA0051).
`Generate` → `DiscoverAndValidateAssets` + `SerializeCatalog`. `ValidateAndBuildAsset` → `CollectMissingFields`. `FrontmatterParser.Parse` → `ParseKeyValuePair`. All methods now under 60 lines.

**KTD4** — Add `GovernanceAssetValidator` directly to `src/AiMemory.sln`.
Direct inclusion keeps `dotnet build src/AiMemory.sln` correct as documented.

**KTD5** — New independent `dotnet-build` CI job (no secrets, independent of Deno jobs).

---

## Scope Boundaries

### Deferred to Follow-Up Work
- ST-090: Seven governance assets with missing frontmatter that cause `validate .` to exit 1 at runtime — now unblocked.

### Out of scope
- Behavioral changes to validator catalog logic
- New NuGet dependencies

---

## Implementation Units

### U1. Split `Program.cs` into per-type files

**Goal:** Resolve SA1402/MA0048.

**Files:**
- `tools/GovernanceAssetValidator/Program.cs` — `Program` class only
- `tools/GovernanceAssetValidator/CatalogValidationEngine.cs` — engine + nested records
- `tools/GovernanceAssetValidator/FrontmatterParser.cs` — `internal static`
- `tools/GovernanceAssetValidator/CatalogBuildResult.cs` — `public sealed record`
- `tools/GovernanceAssetValidator/CatalogValidationResult.cs` — `public sealed record`
- `tools/GovernanceAssetValidator/CatalogSourceFile.cs` — `internal sealed class`
- `tools/GovernanceAssetValidator/CatalogGenerationSection.cs` — `internal sealed class`

**Verification:** `dotnet build tools/GovernanceAssetValidator/GovernanceAssetValidator.csproj` exits 0. ✅

---

### U2. Fix method-level and style violations

**Files:** `tools/GovernanceAssetValidator/CatalogValidationEngine.cs`, `FrontmatterParser.cs`, `Program.cs`

**Fixes applied:**
- MA0051: extracted `DiscoverAndValidateAssets`, `SerializeCatalog`, `CollectMissingFields`, `ParseKeyValuePair`
- S2325: `Build`/`Validate` made static; `Program.cs` updated to static dispatch
- SA1413: trailing commas added to 3 multi-line initializers
- SA1503: braces added to 6 single-line if bodies
- MA0006: `string.Equals(..., StringComparison.Ordinal)` for "---" comparisons
- CA1305: `CultureInfo.InvariantCulture` on 2 interpolated `AppendLine` calls
- CA1859: `ReadStringList`/`CollectMissingFields` return/accept `List<string>`

**Verification:** `dotnet build tools/GovernanceAssetValidator/GovernanceAssetValidator.csproj` exits 0, 0 errors. ✅

---

### U3. Add project to solution and wire CI gate

**Files:** `src/AiMemory.sln`, `.github/workflows/ci.yml`

**Changes:**
- `dotnet sln src/AiMemory.sln add tools/GovernanceAssetValidator/GovernanceAssetValidator.csproj`
- Added `dotnet-build` job to `.github/workflows/ci.yml` (runs-on ubuntu-latest, no secrets, builds + tests `src/AiMemory.sln`)

**Red control (R5):** Deliberate SA1503 introduced in `CatalogValidationEngine.cs` line 236 → `dotnet build src/AiMemory.sln` exited non-zero with `SA1503: Braces should not be omitted` → reverted → clean build confirmed.

**Verification:** `dotnet build src/AiMemory.sln` exits 0 (4 projects). `dotnet test` exits 0 (1/1). `dotnet run --project tools/GovernanceAssetValidator -- validate .` reaches runtime. ✅

---

## Verification Contract

1. `dotnet build src/AiMemory.sln` exits 0 — 4 projects, 0 errors. ✅
2. `dotnet run --project tools/GovernanceAssetValidator -- validate .` reaches runtime (exits 1 on 7 asset findings — ST-090 scope). ✅
3. `dotnet test` exits 0 — 1/1 passed. ✅
4. Red control: SA1503 on line 236 confirmed build failure; reverted to green. ✅
5. `dotnet-build` job present in `.github/workflows/ci.yml`. ✅
6. No `<NoWarn>` or `#pragma warning disable` added. ✅

---

## Definition of Done

- [x] `dotnet build src/AiMemory.sln` exits 0 at HEAD
- [x] `dotnet run --project tools/GovernanceAssetValidator -- validate .` reaches runtime
- [x] `dotnet test` exits 0
- [x] `dotnet-build` CI job in `.github/workflows/ci.yml`
- [x] Red control outcome recorded above
- [x] No blanket suppressions for fixed rule classes
- [ ] ST-089 → Done; ST-090 unblocked (board update pending)

---

## Sources & Research

- Board entry ST-089 — `.github/planning/story-board.md`
- Violation list — `dotnet run --project tools/GovernanceAssetValidator -- validate .` output, 2026-08-03
- `tools/GovernanceAssetValidator/Program.cs` — original source
- `Directory.Build.props` — confirms analyzer pins and `TreatWarningsAsErrors=true`
- `src/AiMemory.sln` — confirmed project was absent
- `.github/workflows/ci.yml` — confirmed no existing .NET job
- CLAUDE.md — documents the validate command as standard
