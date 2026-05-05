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

### Task 4.2a: Create repo-local NuGet.config

**Objective:** Isolate package restore from machine-level private feeds by committing a repo-local public-source policy.

**Input:** `Directory.Build.props` must exist (Task 4.2).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the file `NuGet.config` at the repository root with the exact content from §3 Boilerplate (NuGet.config).

**Expected output:** File `NuGet.config` exists at repo root and defines only `nuget.org` as a package source.

**Requirement mapping:** "Repo-local package source policy excludes inherited private feeds" row in §2d.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\NuGet.config"
Select-String -Path "c:\projects\ai-memory\NuGet.config" -Pattern "<clear />|https://api.nuget.org/v3/index.json"
```
Expected result: `True`, and two matching lines returned.

**Failure handling:** If file creation fails, check write permissions to repo root. If later restore commands still contact a private feed, stop and escalate; do not modify machine-level NuGet settings inside `/continue`.

---

### Task 4.3: Create AiMemory.Core project

**Objective:** Create the zero-dependency domain library with a placeholder interface.

**Input:** `Directory.Build.props` and `NuGet.config` must exist (Tasks 4.2, 4.2a).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Ensure directory `src/AiMemory.Core/` exists.
2. Confirm `src/AiMemory.Core/AiMemory.Core.csproj` matches the exact content from §3 Boilerplate (AiMemory.Core.csproj). If the file is missing or differs, replace it with the exact boilerplate.
3. Confirm `src/AiMemory.Core/IMemoryService.cs` matches the exact content from §3 Boilerplate (IMemoryService.cs). If the file is missing or differs, replace it with the exact boilerplate.
4. Run: `dotnet restore src/AiMemory.Core/AiMemory.Core.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json`
5. Run: `dotnet build src/AiMemory.Core/AiMemory.Core.csproj --no-restore`

**Expected output:** Two files exist; project builds cleanly.

**Requirement mapping:** "Three projects exist" and "Core has zero dependencies" rows in §2d.

**Verification:**
```powershell
dotnet restore src/AiMemory.Core/AiMemory.Core.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json
dotnet build src/AiMemory.Core/AiMemory.Core.csproj --no-restore
```
Expected result: Restore and build both succeed, 0 warnings, 0 errors.

**Failure handling:** If restore still contacts a private feed or returns `401`, stop and escalate — do not edit machine-level NuGet config. If build fails due to missing SDK, verify Task 4.1 global.json is correct. If nullable warnings appear, confirm `TreatWarningsAsErrors` in Directory.Build.props and fix the source file.

---

### Task 4.4: Create AiMemory.Server project

**Objective:** Create the web host project with a project reference to Core.

**Input:** `src/AiMemory.Core/AiMemory.Core.csproj` and `NuGet.config` must exist (Tasks 4.3, 4.2a).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `src/AiMemory.Server/`.
2. Create file `src/AiMemory.Server/AiMemory.Server.csproj` with exact content from §3 Boilerplate (AiMemory.Server.csproj).
3. Create file `src/AiMemory.Server/Program.cs` with exact content from §3 Boilerplate (Program.cs).
4. Run: `dotnet restore src/AiMemory.Server/AiMemory.Server.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json`
5. Run: `dotnet build src/AiMemory.Server/AiMemory.Server.csproj --no-restore`

**Expected output:** Two files exist; project builds cleanly.

**Requirement mapping:** "Server references Core" row in §2d.

**Verification:**
```powershell
dotnet restore src/AiMemory.Server/AiMemory.Server.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json
dotnet build src/AiMemory.Server/AiMemory.Server.csproj --no-restore
```
Expected result: Restore and build both succeed, 0 warnings, 0 errors.

**Failure handling:** If restore still contacts a private feed or returns `401`, stop and escalate. If build fails on ProjectReference, verify the relative path `../AiMemory.Core/AiMemory.Core.csproj` resolves correctly from `src/AiMemory.Server/`.

---

### Task 4.5: Create AiMemory.Tests project

**Objective:** Create the test project with xunit.v3, FluentAssertions, NSubstitute, and a reference to Core.

**Input:** `src/AiMemory.Core/AiMemory.Core.csproj` and `NuGet.config` must exist (Tasks 4.3, 4.2a).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create directory `tests/AiMemory.Tests/`.
2. Create file `tests/AiMemory.Tests/AiMemory.Tests.csproj` with exact content from §3 Boilerplate (AiMemory.Tests.csproj).
3. Run: `dotnet restore tests/AiMemory.Tests/AiMemory.Tests.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json`
4. Run: `dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj --no-restore`

**Expected output:** File exists; project builds (NuGet restore will download packages on first build).

**Requirement mapping:** "Three projects exist" and "`dotnet test` runs" rows in §2d.

**Verification:**
```powershell
dotnet restore tests/AiMemory.Tests/AiMemory.Tests.csproj --configfile NuGet.config --source https://api.nuget.org/v3/index.json
dotnet build tests/AiMemory.Tests/AiMemory.Tests.csproj --no-restore
```
Expected result: Restore and build both succeed (packages restored), 0 warnings, 0 errors.

**Failure handling:** If NuGet restore still contacts a private feed or returns `401`, stop and escalate — do not change machine-level NuGet configuration. If a package version is unavailable, escalate — do not change pinned versions without plan review.

---

### Task 4.6: Create solution and verify end-to-end

**Objective:** Wire all three projects into a solution file and confirm full acceptance criteria pass.

**Input:** All three project csproj files must exist (Tasks 4.3–4.5).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. If `c:\projects\ai-memory\ai-memory.sln` exists, delete it before creating the intended solution file under `src\`.
2. Run: `dotnet new sln -n AiMemory -o src`
3. Run: `dotnet sln src/AiMemory.sln add src/AiMemory.Core/AiMemory.Core.csproj src/AiMemory.Server/AiMemory.Server.csproj tests/AiMemory.Tests/AiMemory.Tests.csproj`
4. Run: `dotnet restore src/AiMemory.sln --configfile NuGet.config --source https://api.nuget.org/v3/index.json`
5. Run full build: `dotnet build src/AiMemory.sln --no-restore`
6. Run full test: `dotnet test src/AiMemory.sln --no-restore --no-build`

**Expected output:** Solution file at `src/AiMemory.sln`; root `ai-memory.sln` absent; restore, build, and test pass.

**Requirement mapping:** "Solution builds with `dotnet build`" and "`dotnet test` runs" rows in §2d.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\ai-memory.sln"
Test-Path "c:\projects\ai-memory\src\AiMemory.sln"
dotnet restore src/AiMemory.sln --configfile NuGet.config --source https://api.nuget.org/v3/index.json
dotnet build src/AiMemory.sln --no-restore
dotnet test src/AiMemory.sln --no-restore --no-build
```
Expected result: Root solution path returns `False`; `src\AiMemory.sln` returns `True`; restore, build, and test succeed.

**Failure handling:** If `dotnet sln add` fails on relative paths, use absolute paths. If restore still contacts a private feed or returns `401`, stop and escalate. If build or test fails, check error output and fix in the relevant task's file before re-running.

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
