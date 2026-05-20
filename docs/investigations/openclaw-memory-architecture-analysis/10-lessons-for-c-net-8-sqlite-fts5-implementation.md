## 10. Lessons for C# .NET 8+ / SQLite + FTS5 Implementation

### Direct Adaptations (High Value)

1. **Entity/Key/Value schema with FTS5** — The `facts` table design maps directly to SQLite in C#. Use `Microsoft.Data.Sqlite` with FTS5 virtual tables and the trigger-based sync pattern shown above.

2. **14-category taxonomy** — Fixed category enum enforced at the application layer. In C#, model as an enum with `[AllowedValues]` validation.

3. **Activation/Decay system** — Schema-ready columns (`activation`, `decay_score`, `importance`) with cron-based decay. In .NET, use a `BackgroundService` or Hangfire for periodic decay.

4. **Alias-based entity resolution** — Simple aliases table with `COLLATE NOCASE`. Cheap word-boundary matching enables fuzzy entity lookup without embeddings. Model as a separate table with composite key.

5. **Four-phase search pipeline** — Entity+Intent → Entity → FTS → Relations. Implementable as a `SearchPipeline` with scored results merged. Short-circuit when high-confidence match found.

6. **Changelog/audit trail** — `facts_changelog` table captures mutations. Essential for debugging LLM-generated fact writes. Map to an append-only audit table.

7. **Importance-tagged retention** — Daily log entries with `i=0.9` importance scores. Drives TTL-based cleanup. Model as a `float` property with configurable thresholds.

### Architecture Patterns to Adopt

8. **"Right tool for the query" philosophy** — Don't force everything through vector search. Exact lookups (entity/key) should be instant structured queries; only use semantic search for fuzzy recall.

9. **Unified search facade** — One entry point dispatches to multiple backends in parallel. In C#, use `Task.WhenAll` with multiple `ISearchBackend` implementations.

10. **File-based identity + DB-based knowledge** — Keep curated files (MEMORY.md equivalent) for human-editable context. Use SQLite for machine-written structured knowledge.

11. **Lossless context + summary DAG** — Store all messages, build summaries on compaction. Tree structure enables drill-down. Map to a `Summaries` table with `depth` and `parent_id` columns.

12. **Context budgeting** — Allocate token pools to different memory tiers. Priority-tiered: identity first, then working memory, then search results.

### Key Lessons / Warnings

13. **"Structure beats embeddings"** — For 80% of queries (exact lookups, entity facts), a well-indexed SQLite DB with aliases outperforms expensive vector search. Reserve embeddings for genuine fuzzy recall.

14. **Hebbian decay is hard to get right** — OpenClaw has the schema but the ranking integration is still a stub after months. Don't over-invest in decay before core retrieval works.

15. **Fact quality is the bottleneck** — Metabolism produces operational noise ("gateway_status", "model_setting") as facts. Extensive guardrails (13+ rules) needed. In C#, implement a `FactValidationPipeline` with ordered validators.

16. **`superseded_at` invalidation** — Facts are never deleted, just marked superseded. Handles contradictions cleanly. Model as nullable `DateTime? SupersededAt` with filtered queries.

17. **Single DB vs. Multiple DBs** — They tried single-DB consolidation (v2.2), then backed away for domain-specific stores. For a simpler system, starting with one DB is fine but design for later separation.

18. **Security concern: stored prompt injection** — Continuity injects raw past messages without sanitization. Single-user is low risk; multi-user requires scrubbing.

---

