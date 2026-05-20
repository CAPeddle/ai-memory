### Option A — Adopt OB1

| Aspect | Assessment |
|--------|-----------|
| Hook mechanism | `capture_thought` itself has no middleware hook, but OB1's `entity-extraction` schema already proves the ingest-time pattern: an `AFTER INSERT OR UPDATE` trigger on `thoughts` can queue work for asynchronous processing. A synthesis extension can use the same trigger+queue design, then run a dedicated Edge Function worker to process queued thoughts. |
| LLM integration | OpenRouter API is already wired. A synthesis worker can call the same provider with a synthesis prompt and persist compiled output remotely. |
| Output format | Edge Functions cannot write directly to local filesystems, but they can write Markdown-compatible output to Supabase Storage or a `compiled_views` table. A local sync daemon or pull step can then materialize that content into an Obsidian vault. This is a bridge cost, not a hard blocker. |
| Incremental update | Add a `compiled_views` table keyed by view name with `last_compiled_thought_id` or `last_compiled_at`. Worker processes only queued changes and updates the affected view payloads. |

**Feasibility rating: Significant** — viable, but still requires a new queue-processing worker, remote compiled-view storage, and a local sync bridge for Obsidian. **Answer to the PO's open question:** yes, OB1's Supabase schemas + Edge Functions can support per-ingest synthesis if remotely stored Markdown and a sync bridge are acceptable. The constraint is workflow shape and operational overhead, not core capability.

