## 11. Initial Story Backlog (Seed)

These stories should populate the board when the workflow is first activated:

| ID | Title | Type | Value | Primary dependency |
|----|-------|------|-------|--------------------|
| ST-001 | Scaffold .NET solution and project structure | infrastructure | 5 | none |
| ST-002 | Implement SQLite schema + FTS5 + migrations | infrastructure | 5 | ST-001 |
| ST-003 | Implement IMemoryRepository (SQLite) | feature | 4 | ST-002 |
| ST-004 | Implement embedding service (OpenAI) | feature | 4 | ST-001 |
| ST-005 | Implement hybrid search (FTS5 + vector + RRF + MMR) | feature | 5 | ST-003, ST-004 |
| ST-006 | Implement REST API endpoints | feature | 4 | ST-003, ST-005 |
| ST-007 | Implement MCP server (facade over service layer) | feature | 5 | ST-006 |
| ST-008 | Implement consolidation pipeline | feature | 3 | ST-005 |
| ST-009 | Create workflow governance files (.github/) | infrastructure | 5 | none |
| ST-010 | Integration testing (E2E round-trip) | debt | 4 | ST-007 |

**Recommended execution order (by value + dependencies):**
1. ST-009 (governance) — enables all other stories
2. ST-001 (scaffold) — enables all implementation
3. ST-002 (schema) — enables repository
4. ST-004 (embeddings) — enables search
5. ST-003 (repository) — enables service layer
6. ST-005 (search) — core value
7. ST-006 (REST) — first usable interface
8. ST-007 (MCP) — agent integration
9. ST-010 (E2E tests) — confidence
10. ST-008 (consolidation) — advanced feature

---

