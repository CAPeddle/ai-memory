## §11 Sources Referenced

| Source | Used for |
|--------|---------|
| `https://github.com/NateBJones-Projects/OB1` — repo root listing | Identifying OB1 directory structure |
| `OB1/server/index.ts` (via GitHub MCP) | MCP tool definitions, `capture_thought` implementation, `upsert_thought` call, no ingest hooks confirmation |
| `OB1/docs/01-getting-started.md` (via GitHub MCP) | Core `thoughts` table schema, `match_thoughts`, `upsert_thought`, setup flow |
| `OB1/extensions/README.md` (via GitHub MCP) | Extension model: curated learning path, schema-based, separate Edge Functions |
| `OB1/extensions/_template/README.md` (via GitHub MCP) | Extension template: SQL + separate Edge Function pattern confirmed |
| `OB1/schemas/entity-extraction/schema.sql` (via GitHub MCP) | `AFTER INSERT OR UPDATE` trigger `trg_queue_entity_extraction`, `entities` + `edges` + `thought_entities` tables, async queue pattern |
| `OB1/schemas/agent-memory/schema.sql` (via GitHub MCP) | `agent_memory_relations`, relation types, memory sidecar architecture |
| `https://supabase.com/pricing` | Free tier limits (500 MB, inactivity pause), Pro pricing ($25/month) |
| `https://supabase.com/docs/guides/database/extensions` | Confirmed Apache AGE is NOT in Supabase's supported extensions list |
| `docs/investigations/memory-architecture-design.md` | Current architecture baseline |
| `docs/investigations/sqlite-vs-postgresql.md` | Postgres migration path via `IMemoryRepository` abstraction |
| `docs/investigations/interface-design-mcp-rest.md` | Current API design |
| `docs/investigations/Youtube/Nate B Jones on Open Brain vs LLM Wiki.md` | Write-time vs query-time analysis; OB1's query-time philosophy confirmed |
| `.github/planning/execplans/exec-plan-ST-017.md` | Source ExecPlan with research scope and criteria |
