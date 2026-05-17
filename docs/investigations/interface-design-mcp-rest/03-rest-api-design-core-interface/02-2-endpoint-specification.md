### 3.2 Endpoint Specification

#### Memories (Semantic)

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/memories` | Teach a fact | `{ content, project?, tags?, source? }` | `{ data: Memory }` |
| GET | `/api/v1/memories/search` | Hybrid search | Query params: `q`, `project?`, `type?`, `limit?`, `tags?` | `{ data: Memory[], meta: { total, scores } }` |
| GET | `/api/v1/memories/:id` | Get by ID | — | `{ data: Memory }` |
| PATCH | `/api/v1/memories/:id` | Correct a fact | `{ content?, tags?, project? }` | `{ data: Memory }` |
| DELETE | `/api/v1/memories/:id` | Soft-delete | — | `204 No Content` |
| GET | `/api/v1/memories` | List with filters | Query params: `project?`, `type?`, `tags?`, `cursor?`, `limit?` | `{ data: Memory[], meta: { cursor } }` |
| POST | `/api/v1/memories/:id/promote` | Force promote episodic→semantic | — | `{ data: Memory }` |

#### Episodes

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/episodes` | Log an episode | `{ content, session_id, project?, tags?, agent_context? }` | `{ data: Episode }` |
| GET | `/api/v1/episodes` | List episodes | Query params: `session_id?`, `project?`, `cursor?`, `limit?` | `{ data: Episode[], meta: { cursor } }` |
| GET | `/api/v1/episodes/:id` | Get episode detail | — | `{ data: Episode }` |

#### Recall & Feedback

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/recall/:event_id/feedback` | Submit feedback | `{ feedback: "helpful" \| "irrelevant" }` | `204` |
| GET | `/api/v1/recall/events` | List recall events | Query params: `memory_id?`, `limit?` | `{ data: RecallEvent[] }` |

#### Consolidation

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/api/v1/consolidate` | Trigger pipeline | `{ dry_run?: bool }` | `{ data: ConsolidationResult }` |
| GET | `/api/v1/consolidate/log` | History | Query params: `cursor?`, `limit?` | `{ data: ConsolidationRun[] }` |

#### Projects

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| GET | `/api/v1/projects` | List projects | — | `{ data: Project[] }` |
| POST | `/api/v1/projects` | Register project | `{ slug, display_name, description?, build_system?, languages? }` | `{ data: Project }` |

#### System

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/api/v1/stats` | System statistics | `{ data: Stats }` |
| GET | `/health` | Health check | `200 OK` |
| GET | `/ready` | Readiness (DB accessible) | `200 OK` or `503` |

