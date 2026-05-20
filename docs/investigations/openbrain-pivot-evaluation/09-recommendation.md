## §9 Recommendation

**Recommend Option C — Stay Current — because it still provides the simplest path to per-ingest synthesis, requires no stack switch, preserves direct local Obsidian writes, and keeps the lowest operational complexity, even after accounting for OB1's viable cloud-side synthesis path, lower hobby-scale cost floor, and real OpenRouter leverage.**

The revised investigation shows that OB1-based options are more viable than the first draft suggested, but still not strong enough to displace the current architecture.

- **Per-ingest synthesis**: OB1 can support this through the trigger pattern already present in `entity-extraction`: queue on insert/update, process in an Edge Function worker, write Markdown-compatible output remotely, then sync to the local Obsidian vault. That answers the PO's open question positively. The reason Option C still wins is not that OB1 is incapable, but that OB1 needs more moving parts: worker, remote compiled-view storage, and local sync bridge. On C#, the same capability is a single application-level event plus direct file output.

- **OpenRouter leverage**: OpenRouter makes A/B better than the earlier versions of this spike gave them credit for. It offers a single OpenAI-compatible API, 400+ models, 60+ providers, provider routing, and fallback behavior that fit OB1's cloud-worker shape well. Concrete current examples on OpenRouter include `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4`, and `google/gemini-2.5-flash`. That improves model switching, resilience, and experimentation speed for OB1-based options. It still does not overturn the recommendation, because Option C's main edge is not model access breadth; it is direct local execution with fewer moving parts.

- **Graph/structural similarity**: OB1's `entity-extraction` schema provides an `edges` table and a PostgreSQL trigger that queues thoughts. But the actual extraction worker is missing from the repo. Supabase does not support Apache AGE. On SQLite, structural fingerprinting (embedding graph topology as vectors via sqlite-vec, already planned) covers the primary use case, with a documented migration path to Postgres + AGE if full graph traversal is later required.

- **Cost**: The OB1 cost floor is closer to ~$2–5/month for hobby-scale use on Supabase Free + OpenRouter. The earlier $25+/month shorthand applies to the Pro-tier or full-baseline case, where the workload approaches the stated 100K-memory target or requires always-on behavior. Option C still wins because it remains fully local and can still run at $0–3/month without any pause behavior.

**Runner-up:** Option D-C# (adopt Postgres + pgvector approach but build fresh in C#) is the strongest alternative. It provides the best graph path (AGE via self-hosted Postgres) and would be recommended if the PO later decides: (a) graph traversal via openCypher is a hard requirement, AND (b) $6–11/month for a VPS is acceptable. The OB1 `entity-extraction` schema and `typed-reasoning-edges` schema are valuable reference material for designing the graph layer under any option.

**What to borrow from OB1 without switching platforms:**
1. The `AFTER INSERT OR UPDATE` trigger pattern from `schemas/entity-extraction/schema.sql` — adapt for SQLite (as an `AFTER INSERT` trigger on `memories` that updates a processing queue table).
2. The `thought_entities` → `entities` → `edges` graph schema — implement as SQLite tables with recursive CTE traversal.
3. The structural fingerprint concept (not in OB1 but implied by their relation model) — encode as a sqlite-vec vector alongside semantic embeddings.
4. The schema-based extension pattern — group optional capability schemas (graph, synthesis, agent memory) as opt-in migrations in `src/AiMemory.Core/Migrations/`.

---

