## §3 Options Under Evaluation

| Option | Description |
|--------|-------------|
| **A — Adopt OB1** | Use OB1 as-is. Add per-ingest synthesis and graph search as custom extensions (separate Edge Functions + schema additions) built atop Supabase + TypeScript stack. |
| **B — Fork OB1** | Fork the OB1 repository. Modify core code directly (e.g. add synthesis calls into `capture_thought`). Full freedom to change internals; must maintain divergence from upstream. |
| **C — Stay Current** | Continue building on the existing C#/.NET 8 + SQLite architecture per the investigation docs. Implement both capabilities as services within the existing design. |
| **D — Adopt Approach, Build Fresh** | Take OB1's architectural patterns (Postgres + pgvector, thought-centric flat model, MCP-native, schema-based extensions) but implement from scratch. Two variants: D-C# (keep current C# stack, use Postgres instead of SQLite) or D-TypeScript (adopt OB1 stack). Treated as a single option with noted variants. |

### OB1 architecture summary (from source)

From direct analysis of `https://github.com/NateBJones-Projects/OB1`:

**Core `thoughts` table (from docs/01-getting-started.md):**
```sql
create table thoughts (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  content_fingerprint text,   -- added in step 2.6
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
Functions: `match_thoughts` (vector cosine search), `upsert_thought` (dedup + insert/update).  
Trigger: `thoughts_updated_at` (BEFORE UPDATE, sets updated_at).

**MCP Server (server/index.ts):** Deno Edge Function. Six tools: `search` (ChatGPT compat), `fetch` (ChatGPT compat), `search_thoughts`, `list_thoughts`, `thought_stats`, `capture_thought`. No middleware, no hook system, no plugin registry.

**Extension model:** Schema-based. Each extension runs its own separate Supabase Edge Function (independent of core). Extensions add new PostgreSQL tables and grant `service_role` access. There is NO shared plugin registry — each extension is an independent deployable. Adding tools to the core server requires forking `server/index.ts`.

**Schemas available (optional add-ons):**
- `entity-extraction`: adds `entities`, `edges`, `thought_entities`, `entity_extraction_queue`, `consolidation_log` tables. Includes a PostgreSQL trigger `trg_queue_entity_extraction` (AFTER INSERT OR UPDATE on `thoughts`) that queues thoughts for async entity extraction. Worker must be built separately.
- `agent-memory`: runtime-neutral sidecar with `agent_memories`, `agent_memory_relations`, `agent_memory_recall_traces`, `agent_memory_audit_events`, and related tables. Provides typed memory-to-memory relations.
- `typed-reasoning-edges`, `enhanced-thoughts`, `workflow-status`, `entity-extraction`: additional optional schemas.

**OB1's explicit philosophy:** "Query-time system" — stores faithfully, synthesises at recall only. No write-time compilation anywhere in the codebase.

---

