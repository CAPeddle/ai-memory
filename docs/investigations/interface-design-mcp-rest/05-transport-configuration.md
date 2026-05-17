## 5. Transport Configuration

### 5.1 Dual Transport Support

The service supports two MCP transports simultaneously:

| Transport | Use Case | Configuration |
|-----------|----------|---------------|
| **stdio** | Direct GitHub Copilot integration (VS Code) | Launch as subprocess per `mcp.json` |
| **Streamable HTTP** | Remote agents, multi-client, debugging | Single server process on `localhost:5280/mcp` |

### 5.2 VS Code MCP Configuration

```json
// .vscode/mcp.json (for stdio transport)
{
  "servers": {
    "ai-memory": {
      "type": "stdio",
      "command": "dotnet",
      "args": ["run", "--project", "src/AiMemory.Server", "--", "--stdio"],
      "env": {
        "AI_MEMORY_DB_PATH": "${userHome}/.ai-memory/memory.db"
      }
    }
  }
}
```

```json
// Alternative: HTTP transport (server already running)
{
  "servers": {
    "ai-memory": {
      "type": "http",
      "url": "http://localhost:5280/mcp"
    }
  }
}
```

### 5.3 Deployment Modes

| Mode | How | When |
|------|-----|------|
| **Development** | `dotnet run` in terminal | Active development |
| **stdio per-editor** | VS Code spawns process via `mcp.json` | Normal Copilot use |
| **Background service** | Windows Service or Task Scheduler | Always-on REST API |
| **Docker** | Container with volume-mounted DB | Team/CI environments |

---

