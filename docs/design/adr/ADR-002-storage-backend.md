---
name: "ADR-002: Primary Storage Backend"
asset_type: "adr"
status: "superseded"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-002-storage-backend.md"
created: "2026-05-15"
superseded_by: "docs/design/adr/ADR-011-storage-strategy.md"
superseded_date: "2026-05-16"
investigation: "docs/investigations/sqlite-vs-postgresql.md"
---

# ADR-002: Primary Storage Backend

**Status:** Superseded — see [ADR-011: Storage Strategy](ADR-011-storage-strategy.md)  
**Date:** 2026-05-15 | **Superseded:** 2026-05-16  
**Deciders:** PO (sole maintainer)

---

## Supersession Note

This ADR is superseded in full by **ADR-011**. The SQLite-first decision was predicated on local-first deployment, zero external service dependencies, and Windows native hosting — all of which changed when the architecture moved to a cloud-hosted Docker container with a forked OB1 TypeScript/Deno server.

SQLite is no longer part of the storage architecture:
- The cloud MCP server uses **PostgreSQL 15 + pgvector + Apache AGE v1.7.0**
- The local synthesis service has no persistent storage of its own; it pulls from the cloud MCP endpoint

The `IMemoryStore` abstraction principle (decouple engine from backend) carries forward into ADR-011.

---

## Original Decision (Archived)

**SQLite 3 with FTS5, WAL mode, and sqlite-vec** was selected as the v1.0 default for a local-first Windows deployment.

Migration triggers that would have activated PostgreSQL:
- Multi-user service
- 100K+ vectors requiring sub-10ms HNSW performance not achievable with sqlite-vec
- Cloud deployment with managed database

All three triggers have now fired simultaneously. The architecture has migrated to PostgreSQL as its starting point per ADR-011.

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — SQLite as v1.0 default; PostgreSQL as documented upgrade path |
| Superseded | 2026-05-16 | Replaced by ADR-011; SQLite dropped; PostgreSQL 15 + pgvector + AGE is the base |
