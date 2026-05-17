### Option C — Stay Current (C# + SQLite)

SQLite has no native graph extension. Options:
1. **Structural fingerprints (recommended):** Encode graph topology as a vector: extract entity co-occurrence counts from content (entity names, frequencies, adjacency patterns), encode as a float array, store in sqlite-vec alongside semantic embeddings. Cosine similarity over structural fingerprints enables "structurally similar to this document" queries. Covers ~80% of structural similarity use cases with 0% operational overhead.
2. **Recursive CTEs:** SQLite supports `WITH RECURSIVE` — can traverse a `thought_relations` table (entity, relation, target_entity). Sufficient for multi-hop traversal without a graph DB.
3. **Future migration path:** If full AGE graph capability is needed, the `IMemoryRepository` abstraction allows migrating to Postgres with AGE; documented in `docs/investigations/sqlite-vs-postgresql.md`.

**Feasibility rating: Significant** — full subgraph matching requires either structural fingerprints (achievable) or SQLite→Postgres migration. Neither is trivial, but structural fingerprints are pragmatic and the migration path exists. Worth noting: this rating applies equally to all four options, since no option provides functional graph search out of the box.

