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

**Boilerplate: NuGet.config**
```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
  </packageSources>
</configuration>
```

**Boilerplate: explicit restore command**
```powershell
dotnet restore <project-or-solution-path> --configfile NuGet.config --source https://api.nuget.org/v3/index.json
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
    <ProjectReference Include="..\\AiMemory.Core\\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```

**Boilerplate: Program.cs**
```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.Run();
```

**Boilerplate: AiMemory.Tests.csproj (red state)**
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
    <ProjectReference Include="..\\..\\src\\AiMemory.Core\\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```

**Boilerplate: AiMemory.Tests.csproj (green state)**
```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <IsTestProject>true</IsTestProject>
    <OutputType>Exe</OutputType>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="xunit.v3" Version="3.2.2" />
    <PackageReference Include="FluentAssertions" Version="8.9.0" />
    <PackageReference Include="NSubstitute" Version="5.3.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\\..\\src\\AiMemory.Core\\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```

**Boilerplate: SmokeTests.cs**
```csharp
using FluentAssertions;
using Xunit;

namespace AiMemory.Tests;

public class SmokeTests
{
    [Fact]
    public void Placeholder_WhenExecuted_Passes()
    {
        true.Should().BeTrue();
    }
}
```

**Boilerplate: coding-standards TDD bullet**
```markdown
- Follow TDD for new behavior and bug fixes: start with a failing test (red), make the minimum change to pass (green), then refactor with tests still green
```

**Boilerplate: plan-prompt TDD rule**
```markdown
- **Always** encode test-bearing work with explicit TDD sequencing in the ExecPlan: define the red step first, then the minimum green step, then any refactor checkpoint when applicable
```

**Boilerplate: continue-prompt TDD rule**
```markdown
- **Always** execute explicit red-green test steps in the order written when an ExecPlan defines them; do not skip the failing-test checkpoint unless the plan marks it not applicable
```
