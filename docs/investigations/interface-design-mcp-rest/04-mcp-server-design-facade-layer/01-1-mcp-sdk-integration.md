### 4.1 MCP SDK Integration

Using `ModelContextProtocol.AspNetCore` for HTTP transport alongside the REST API in the same ASP.NET Core host:

```csharp
// Program.cs — MCP + REST in one host
var builder = WebApplication.CreateBuilder(args);

// Shared services
builder.Services.AddSingleton<IMemoryService, MemoryService>();
builder.Services.AddSingleton<ISearchEngine, HybridSearchEngine>();

// MCP server registration
builder.Services.AddMcpServer()
    .WithTools<MemoryTools>()
    .WithResources<MemoryResources>();

var app = builder.Build();

// REST endpoints
app.MapRestEndpoints();

// MCP endpoint (Streamable HTTP transport)
app.MapMcp("/mcp");

// Also support stdio transport for direct Copilot connection
if (args.Contains("--stdio"))
{
    await app.RunMcpServerAsync();
}
else
{
    app.Run();
}
```

