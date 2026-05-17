### 3.1 Three Delivery Mechanisms

| Mechanism | MCP Feature | When Used | Context Cost |
|-----------|-------------|-----------|--------------|
| **Resources** (passive injection) | `memory://facts/{project}` | Agent startup / context refresh | Low — curated summary |
| **Tools** (active pull) | `memory_search` | Agent needs specific information | Variable — depends on query |
| **Prompts** (structured request) | `recall_context` | Before starting a new task | Medium — targeted retrieval |

