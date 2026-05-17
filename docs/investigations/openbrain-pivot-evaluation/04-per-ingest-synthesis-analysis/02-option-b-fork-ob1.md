### Option B — Fork OB1

| Aspect | Assessment |
|--------|-----------|
| Hook mechanism | Can modify `capture_thought` in `server/index.ts` directly to enqueue or invoke synthesis after writing the thought, or reuse the trigger pattern from Option A. This removes the main limitation of the as-is adoption path. |
| LLM integration | Same as Option A — OpenRouter already wired. A fork can centralize capture, extraction, and synthesis orchestration in one codebase. |
| Output format | Same cloud-first constraint as Option A when staying on Supabase: write remote Markdown first, then sync locally. If self-hosting the fork, a Node.js service can write local files directly and eliminate the bridge. |
| Incremental update | Same `compiled_views` state-tracking design work required. Forking makes it easier to add direct hooks but creates upstream maintenance debt. |

**Feasibility rating: Moderate** — more flexible than Option A because the core capture flow can be changed directly. On Supabase it still needs remote storage + local sync; on self-hosted Postgres it can write local files directly, but at the cost of operating the fork and its infrastructure.

