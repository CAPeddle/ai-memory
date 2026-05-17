## §10 Impact Assessment on Backlog Stories

### If Option C (Recommended) — no pivot

All existing backlog stories remain valid as designed. No changes required.

| Story | Status | Note |
|-------|--------|------|
| ST-002 | Valid | SQLite schema + FTS5 + migrations — proceed as planned |
| ST-003 | Valid | `IMemoryRepository` SQLite implementation — proceed as planned |
| ST-004 | Valid | `IEmbeddingService` OpenAI — proceed as planned |
| ST-005 | Valid | Hybrid search (FTS5 + vector + RRF + MMR) — proceed as planned |
| ST-006 | Valid | Consolidation pipeline (episodic → semantic) — proceed as planned |
| ST-007 | Valid | ASP.NET Core REST endpoints — proceed as planned |
| ST-008 | Valid | MCP facade over REST — proceed as planned |
| ST-009 | Valid | Full integration tests — proceed as planned |
| ST-010 | Valid | E2E tests + CI pipeline — proceed as planned |

**New stories to add** (downstream from this spike):
- **ST-018**: Per-ingest synthesis — graph schema (entities, edges, thought_entities as SQLite tables) + structural fingerprint vectors in sqlite-vec
- **ST-019**: Per-ingest synthesis — `ISynthesisService` + Markdown view writer (Obsidian-compatible output)

### If Option D-C# (runner-up) — Postgres pivot only

ST-002 (SQLite schema) becomes ST-002-revised (Postgres schema + EF Core migrations). ST-003–ST-010 largely survive with updated data access layer (Npgsql vs SQLite). The `IMemoryRepository` abstraction already accounts for this (see `docs/investigations/sqlite-vs-postgresql.md`). Net cost: ~2–3 stories revised, new setup infrastructure story for Postgres + self-hosting.

### If Options A or B (not recommended) — full platform pivot

ST-002 through ST-010 would be invalidated. The C# implementation stories would be replaced with TypeScript/Supabase equivalents:
- New: Supabase schema migration story
- New: TypeScript MCP server extension for per-ingest synthesis
- New: Entity extraction worker story
- New: Graph traversal story
- New: Obsidian bridge story (for local file writes from cloud)

The pivot would require 6–8 new stories and discard the current investigation and governance infrastructure, which is written for C#/.NET.

---

