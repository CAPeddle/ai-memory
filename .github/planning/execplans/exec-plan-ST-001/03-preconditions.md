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
    <ProjectReference Include="..\\..\\src\\AiMemory.Core\\AiMemory.Core.csproj" />
  </ItemGroup>

</Project>
```
