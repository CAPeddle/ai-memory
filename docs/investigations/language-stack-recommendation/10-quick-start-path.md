## 10. Quick-Start Path

To validate the recommendation immediately:

```bash
dotnet new web -n AiMemory.Api
cd AiMemory.Api
dotnet add package ModelContextProtocol.AspNetCore
dotnet add package Microsoft.Data.Sqlite
```

```csharp
// Program.cs — proof of concept in ~30 lines
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer()
    .WithTools<MemoryTools>();

var app = builder.Build();
app.MapMcp();                    // MCP over Streamable HTTP at /mcp
app.MapGet("/health", () => "ok");
app.Run();
```

This gives you a running MCP server with HTTP transport in under 5 minutes — using patterns the team already knows from ASP.NET Core.

---

