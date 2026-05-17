### 5.2 MCP SDK Quality vs. Ecosystem Size

TypeScript has more *examples*, but the C# SDK has better *engineering quality* for this team's needs:
- It uses ASP.NET Core hosting — the same pattern they already know
- It integrates with `Microsoft.Extensions.DependencyInjection` — their existing DI framework
- The `[McpServerTool]` attribute pattern mirrors ASP.NET Core controller attributes they're familiar with
- Microsoft co-maintenance means bugs get fixed quickly and the SDK won't be abandoned

Having fewer examples to copy from is a one-time cost during initial setup. The ongoing velocity benefit of using a familiar language far outweighs it.

