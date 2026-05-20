## 6. Final Recommendation

### Use C# / .NET 8+ with the official MCP C# SDK

**Architecture:**
```
ai-memory/
├── src/
│   ├── AiMemory.Core/           # Domain models, interfaces
│   ├── AiMemory.Infrastructure/ # DB access, SQLite/PG providers
│   ├── AiMemory.Mcp/           # MCP server (tools, resources)
│   └── AiMemory.Api/           # ASP.NET Core host (REST + MCP HTTP)
├── tests/
└── ai-memory.sln
```

**Key packages:**
- `ModelContextProtocol.AspNetCore` — MCP server over HTTP
- `Microsoft.Data.Sqlite` — SQLite with FTS5
- `Npgsql` — PostgreSQL (with pgvector support for future vector search)
- `Microsoft.Extensions.Hosting.WindowsServices` — Windows service hosting
- `Microsoft.Extensions.AI` — Embedding model integration

**Transport strategy:**
- Primary: Streamable HTTP (via ASP.NET Core) — works with GitHub Copilot, Claude Desktop, and any MCP client
- Secondary: stdio (for direct process integration if needed)

---

