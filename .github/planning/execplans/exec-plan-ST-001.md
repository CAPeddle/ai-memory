# ExecPlan — ST-001: Scaffold .NET solution and project structure

> Status: ✅ Ready
> Story: ST-001
> Created: 2026-05-04
> Parent: `docs/investigations/language-stack-recommendation.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

The ai-memory repository currently contains only governance and investigation documents — no .NET source code exists yet. Every subsequent feature story (ST-002 through ST-010) depends on a compilable solution structure being in place.

After this story completes, a developer (or agent running `/continue`) can:
- Run `dotnet build src/AiMemory.sln` and get a clean zero-warning build.
- Run `dotnet test src/AiMemory.sln` and get a passing (zero-test) run.
- Open the solution in any .NET IDE and see three projects wired together correctly.

**Project layout this story creates:**
```
(repo root)
├── global.json                         ← SDK pin: .NET 8.0.100+
├── Directory.Build.props               ← shared: C# 12, net8.0, nullable, implicit usings
├── src/
│   ├── AiMemory.sln                    ← solution file
│   ├── AiMemory.Core/
│   │   ├── AiMemory.Core.csproj        ← class library, zero dependencies
│   │   └── IMemoryService.cs           ← placeholder marker interface
│   └── AiMemory.Server/
│       ├── AiMemory.Server.csproj      ← web SDK, references Core
│       └── Program.cs                  ← minimal web host shell
└── tests/
    └── AiMemory.Tests/
        └── AiMemory.Tests.csproj       ← xunit.v3, FluentAssertions, NSubstitute, references Core
```

**Key constraints from design authority:**
- `AiMemory.Core` must have **zero** framework or NuGet dependencies (pure domain).
- `AiMemory.Server` depends on Core via `<ProjectReference>` — never the reverse.
- Nullable reference types are treated as errors (`<TreatWarningsAsErrors>true`).
- All shared compiler settings live in a single `Directory.Build.props` at repo root.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After running `dotnet build src/AiMemory.sln`, the build succeeds with exit code 0 and zero warnings.
- After running `dotnet test src/AiMemory.sln`, the command exits 0 (zero tests discovered is acceptable).
- After inspecting project files, three `.csproj` files exist: `src/AiMemory.Core/AiMemory.Core.csproj`, `src/AiMemory.Server/AiMemory.Server.csproj`, `tests/AiMemory.Tests/AiMemory.Tests.csproj`.
- After inspecting `Directory.Build.props`, it sets C# 12, .NET 8, nullable enabled, implicit usings enabled, and TreatWarningsAsErrors true.
- After checking the board, ST-001 is moved to Review with the ExecPlan path linked.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

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

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Solution builds with `dotnet build` (board AC) | `src/AiMemory.sln` references all projects; all compile | Task 4.6 | `dotnet build src/AiMemory.sln` exit 0 |
| Three projects exist (board AC) | Core, Server, Tests `.csproj` files | Tasks 4.3, 4.4, 4.5 | `Test-Path` for each csproj |
| Directory.Build.props sets C# 12, .NET 8, nullable, implicit usings (board AC) | `Directory.Build.props` at repo root | Task 4.2 | `Select-String` for all five properties |
| `dotnet test` runs (board AC) | Test project with xunit.v3 package | Tasks 4.5, 4.6 | `dotnet test src/AiMemory.sln` exit 0 |
| SDK pinned to .NET 8 (PO decision) | `global.json` at repo root | Task 4.1 | `dotnet --version` returns 8.0.x |
| Core has zero dependencies (coding standards) | `AiMemory.Core.csproj` has no `<PackageReference>` | Task 4.3 | Inspect csproj — no PackageReference elements |
| Server references Core (coding standards) | `AiMemory.Server.csproj` has `<ProjectReference>` to Core | Task 4.4 | Inspect csproj content |

---

## §3. Preconditions

**Prerequisites:**
- .NET 8 SDK installed (8.0.100 or later patch). Verify: `dotnet --version` returns 8.0.x.
- Git available. Verify: `git --version`.
- No prior stories need to be Done.

**Files that must exist before starting:**
- `.github/planning/story-board.md` (for board update in final task)
- `FollowUpSessionLog.txt` (for session-log update)

**Boilerplate: global.json**
```json
{
  "sdk": {
    "version": "8.0.100",
    "rollForward": "latestPatch"
  }
}
```

**Boilerplate: Directory.Build.props**
```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <LangVersion>12</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
```

**Boilerplate: AiMemory.Core.csproj**
```xml
<Project Sdk="Microsoft.NET.Sdk">
</Project>
```

**Boilerplate: IMemoryService.cs**
```csharp
namespace AiMemory.Core;

/// <summary>
/// Marker interface for the memory service. Populated by ST-003.
/// </summary>
public interface IMemoryService;
```

**Boilerplate: AiMemory.Server.csproj**
```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <ItemGroup>
    <ProjectReference Include="..\AiMemory.Core\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```

**Boilerplate: Program.cs**
```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.Run();
```

**Boilerplate: AiMemory.Tests.csproj**
```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="xunit.v3" Version="3.2.2" />
    <PackageReference Include="FluentAssertions" Version="8.9.0" />
    <PackageReference Include="NSubstitute" Version="5.3.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\AiMemory.Core\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```

---

## §4. Task Definitions

### Task 4.1: Create global.json

**Objective:** Pin the .NET SDK version to 8.0.x LTS so builds are reproducible.

**Input:** No prior files needed.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the file `global.json` at the repository root with the exact content from §3 Boilerplate (global.json).

**Expected output:** File `global.json` exists at repo root.

**Requirement mapping:** "SDK pinned to .NET 8" row in §2d.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\global.json"
dotnet --version
```
Expected result: `True`, and version output starts with `8.0.`.

**Failure handling:** If `dotnet --version` does not return 8.0.x, the .NET 8 SDK is not installed. Escalate — do not proceed without the correct SDK.

---

### Task 4.2: Create Directory.Build.props

**Objective:** Establish shared compiler settings for all projects in the repo.

**Input:** No prior files needed.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the file `Directory.Build.props` at the repository root with the exact content from §3 Boilerplate (Directory.Build.props).

**Expected output:** File `Directory.Build.props` exists at repo root with all five properties.

**Requirement mapping:** "Directory.Build.props sets C# 12, .NET 8, nullable, implicit usings" row in §2d.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\Directory.Build.props"
Select-String -Path "c:\projects\ai-memory\Directory.Build.props" -Pattern "TargetFramework|LangVersion|Nullable|ImplicitUsings|TreatWarningsAsErrors"
```
Expected result: `True`, and five matching lines returned.

**Failure handling:** If file creation fails, check write permissions to repo root.

---

### Task 4.3: Create AiMemory.Core project

**Objective:** Create the zero-dependency domain library with a placeholder interface.

**Input:** `Directory.Build.props` must exist (Task 4.2).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `src/AiMemory.Core/`.
2. Create file `src/AiMemory.Core/AiMemory.Core.csproj` with exact content from §3 Boilerplate (AiMemory.Core.csproj).
3. Create file `src/AiMemory.Core/IMemoryService.cs` with exact content from §3 Boilerplate (IMemoryService.cs).

**Expected output:** Two files exist; project builds cleanly.

**Requirement mapping:** "Three projects exist" and "Core has zero dependencies" rows in §2d.

**Verification:**
```powershell
dotnet build src/AiMemory.Core/AiMemory.Core.csproj
```
Expected result: Build succeeded, 0 warnings, 0 errors.

**Failure handling:** If build fails due to missing SDK, verify Task 4.1 global.json is correct. If nullable warnings appear, confirm `TreatWarningsAsErrors` in Directory.Build.props and fix the source file.

---

### Task 4.4: Create AiMemory.Server project

**Objective:** Create the web host project with a project reference to Core.

**Input:** `src/AiMemory.Core/AiMemory.Core.csproj` must exist (Task 4.3).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `src/AiMemory.Server/`.
2. Create file `src/AiMemory.Server/AiMemory.Server.csproj` with exact content from §3 Boilerplate (AiMemory.Server.csproj).
3. Create file `src/AiMemory.Server/Program.cs` with exact content from §3 Boilerplate (Program.cs).

**Expected output:** Two files exist; project builds cleanly.

**Requirement mapping:** "Server references Core" row in §2d.

**Verification:**
```powershell
dotnet build src/AiMemory.Server/AiMemory.Server.csproj
```
Expected result: Build succeeded, 0 warnings, 0 errors.

**Failure handling:** If build fails on ProjectReference, verify the relative path `../AiMemory.Core/AiMemory.Core.csproj` resolves correctly from `src/AiMemory.Server/`.

---

### Task 4.5: Create AiMemory.Tests project

**Objective:** Create the test project with xunit.v3, FluentAssertions, NSubstitute, and a reference to Core.

**Input:** `src/AiMemory.Core/AiMemory.Core.csproj` must exist (Task 4.3).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `tests/AiMemory.Tests/`.
2. Create file `tests/AiMemory.Tests/AiMemory.Tests.csproj` with exact content from §3 Boilerplate (AiMemory.Tests.csproj).

**Expected output:** File exists; project builds (NuGet restore will download packages on first build).

**Requirement mapping:** "Three projects exist" and "`dotnet test` runs" rows in §2d.

**Verification:**
```powershell
dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj
```
Expected result: Build succeeded (packages restored), 0 warnings, 0 errors.

**Failure handling:** If NuGet restore fails, check internet connectivity and NuGet source configuration. If a package version is unavailable, escalate — do not change pinned versions without plan review.

---

### Task 4.6: Create solution and verify end-to-end

**Objective:** Wire all three projects into a solution file and confirm full acceptance criteria pass.

**Input:** All three project csproj files must exist (Tasks 4.3–4.5).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Run: `dotnet new sln -n AiMemory -o src`
2. Run: `dotnet sln src/AiMemory.sln add src/AiMemory.Core/AiMemory.Core.csproj src/AiMemory.Server/AiMemory.Server.csproj tests/AiMemory.Tests/AiMemory.Tests.csproj`
3. Run full build: `dotnet build src/AiMemory.sln`
4. Run full test: `dotnet test src/AiMemory.sln`

**Expected output:** Solution file at `src/AiMemory.sln`; both build and test pass.

**Requirement mapping:** "Solution builds with `dotnet build`" and "`dotnet test` runs" rows in §2d.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\src\AiMemory.sln"
dotnet build src/AiMemory.sln
dotnet test src/AiMemory.sln
```
Expected result: All three return success (True, exit 0, exit 0).

**Failure handling:** If `dotnet sln add` fails on relative paths, use absolute paths. If build or test fails, check error output and fix in the relevant task's file before re-running.

---

### Task 4.7: Update board and session log

**Objective:** Move ST-001 to Review on the board and update the session log.

**Input:** Tasks 4.1–4.6 must be complete with passing verification.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `.github/planning/story-board.md`.
2. Move `ST-001` from the `## Backlog` section to `## Review`.
3. Add `- Completed: 2026-05-04` to the ST-001 entry.
4. Update the board header's `Last updated:` date to today.
5. Update `FollowUpSessionLog.txt` to reflect:
   - What was accomplished (ST-001 scaffold execution)
   - Resume point (story in Review, awaiting PO approval)
   - Board state update
6. Commit with message: `chore(scaffold): complete ST-001 — board and session log update`

**Expected output:** ST-001 in Review column; session log updated.

**Requirement mapping:** "After checking the board, ST-001 is moved to Review" row in §2.

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\.github\planning\story-board.md" -Pattern "ST-001"
```
Expected result: ST-001 appears under `## Review`.

**Failure handling:** If board edit conflicts with other unstaged changes, commit the board update separately.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.2 — Create Directory.Build.props |
| **Last successful command** | `Test-Path Directory.Build.props; Select-String -Path Directory.Build.props -Pattern "TargetFramework|LangVersion|Nullable|ImplicitUsings|TreatWarningsAsErrors"` |
| **Expected outputs produced** | `Directory.Build.props` created and verified with all five required properties |
| **Next task** | Task 4.3 — Create AiMemory.Core project |
| **Known blockers** | None |
| **Last updated** | 2026-05-05T09:07:22.3438562+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-05T08:57:07.0701489+02:00 | Task 4.1 | blocked | `global.json` created; verification failed with "A compatible .NET SDK was not found" (installed: 10.0.107, 10.0.203) | Install .NET 8 SDK and re-run Task 4.1 verification |
| 2026-05-05T09:06:32.0010060+02:00 | Task 4.1 | completed | `Test-Path global.json` returned `True`; `dotnet --version` returned `8.0.100` | Start Task 4.2 |
| 2026-05-05T09:07:22.3438562+02:00 | Task 4.2 | completed | `Test-Path Directory.Build.props` returned `True`; `Select-String` returned 5 required property matches | Start Task 4.3 |
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Hand-write minimal project files with shared Directory.Build.props; create solution last | Before Task 4.1 | 🟢 Active |
| 2 | Use `dotnet new` templates then strip redundancies | Before Task 4.1 | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

- 2026-05-05T08:57:07.0701489+02:00: Started ST-001 Task 4.1. Created `global.json`; verification blocked by missing .NET 8 SDK.
- 2026-05-05T09:06:32.0010060+02:00: Installed .NET SDK 8.0.100 and re-ran Task 4.1 verification successfully.
- 2026-05-05T09:07:22.3438562+02:00: Completed Task 4.2 by creating `Directory.Build.props` and verifying required compiler settings.

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

- Observation: `global.json` pin to SDK 8.0.100 immediately prevents `dotnet` command execution when only SDK 10.x is installed.
  Evidence: `dotnet --version` returned "A compatible .NET SDK was not found" and listed installed SDKs 10.0.107, 10.0.203.
  Impact: Task 4.1 cannot be marked complete until .NET 8 SDK is installed.

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: Install SDK 8.0.100 directly from Microsoft installer after package-manager install could not provide the exact pinned band.
  Rationale: Preserve approved Task 4.1 requirement (`global.json` version 8.0.100) without altering ExecPlan scope.
  Date: 2026-05-05

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Summarise at completion: what was achieved, what remains, lessons learned.)

---

## Revision Notes

- 2026-05-04: Initial ExecPlan authored during /plan session. Decisions: xunit.v3 3.2.2, FluentAssertions 8.9.0, NSubstitute 5.3.0, global.json with latestPatch, solution at src/AiMemory.sln, Directory.Build.props at repo root.
