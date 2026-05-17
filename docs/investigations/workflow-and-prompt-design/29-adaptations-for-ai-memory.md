## 9. Adaptations for ai-memory

### 9.1 Simplifications from Source Repos

| Source Feature | ai-memory Adaptation |
|---------------|---------------------|
| Multiple SAs for parallel stories | Single SA — WIP limit 1 |
| TDD Agent role | Inline in SA — TDD is a task pattern, not a role |
| Complex lock table (12+ modules) | Simplified lock table (4 modules) |
| Spike Board Impact section | Keep — useful for investigation stories |
| Multiple VS Code sessions | Single session only |

### 9.2 Additions Specific to ai-memory

| Addition | Rationale |
|----------|-----------|
| MCP integration testing tasks | Memory service is consumed via MCP — test the protocol |
| Database migration tracking | SQLite schema evolves — migrations must be ExecPlan tasks |
| Embedding model versioning | Track which model generated which embeddings |
| Memory service dogfooding | Use ai-memory's own `memory_log_episode` during development |

---

