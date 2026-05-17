## 9. API Surface

### 9.1 MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `memory_teach` | Store a user-taught fact | `content`, `project?`, `tags?` |
| `memory_log_episode` | Record a session observation | `content`, `session_id`, `project?`, `tags?` |
| `memory_search` | Search all memories | `query`, `project?`, `type?`, `limit?`, `tags?` |
| `memory_correct` | Correct/update a fact | `memory_id`, `new_content` |
| `memory_delete` | Soft-delete a memory | `memory_id` |
| `memory_list` | List memories with filters | `project?`, `type?`, `tags?`, `page?` |
| `memory_inspect` | Get full details of a memory | `memory_id` |
| `memory_feedback` | Report recall usefulness | `recall_event_id`, `feedback` |
| `memory_promote` | Force-promote episodic → semantic | `episodic_id` |
| `memory_consolidate` | Trigger consolidation pipeline | `dry_run?` |
| `memory_projects` | List known projects | — |
| `memory_stats` | Usage statistics | `project?` |

### 9.2 REST API Endpoints

```
POST   /api/v1/memories              — Create (teach or log)
GET    /api/v1/memories/search       — Hybrid search
GET    /api/v1/memories/:id          — Get by ID
PATCH  /api/v1/memories/:id          — Update / correct
DELETE /api/v1/memories/:id          — Soft delete

POST   /api/v1/episodes              — Log episode
GET    /api/v1/episodes?session=X    — Get session episodes

POST   /api/v1/recall/:id/feedback   — Submit feedback
GET    /api/v1/recall/events         — List recall events

POST   /api/v1/consolidate           — Trigger consolidation
GET    /api/v1/consolidate/log       — Consolidation history

GET    /api/v1/projects              — List projects
POST   /api/v1/projects              — Register project

GET    /api/v1/stats                 — System statistics
```

### 9.3 MCP Resources (Read-Only Context)

| Resource URI | Description |
|--------------|-------------|
| `memory://facts/{project}` | All active semantic facts for a project |
| `memory://recent-episodes` | Last N episodes across all projects |
| `memory://stats` | Memory system statistics |

---

