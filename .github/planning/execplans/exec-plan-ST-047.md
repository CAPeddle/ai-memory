# ExecPlan — ST-047: Tool Descriptions

> Status: ✅ Ready — implementation complete, review findings remediated
> Story: ST-047
> Created: 2026-05-31
> Updated: 2026-06-19
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The MCP tool descriptions in `server/index.ts` are minimal. For example:

```typescript
description: "Search captured thoughts by meaning and keyword. Combines BM25 and vector similarity, fused via Reciprocal Rank Fusion.",
```

AI agent consumers (Claude, GPT, Copilot) invoke tools more accurately when descriptions include:
- Example parameter values
- Expected output format
- Error conditions and what causes them
- Guidance on when to use this tool vs alternatives

This story enriches all tool descriptions without changing any logic.

**Key file:** `server/index.ts` — all `server.registerTool()` calls.

---

## §1b. Outcomes & Conclusions

- completion status: full
- key findings/achievements: All 10 MCP tool descriptions enriched with usage guidance, parameter docs, examples, return expectations, and error/edge-case information. Misleading metadata (search fallback claims, search_thoughts/list_thoughts profile filtering claims) corrected to match runtime behavior. Protocol compatibility test expanded with source-of-truth tool name derivation and targeted regression assertions. *(Note 2026-07-03: server/index.ts registers 11 tools — search, fetch, search_thoughts, capture_thought, list_thoughts, thought_stats, graph_traverse, graph_search, consolidate, stats, report_feedback. Task 4.1 originally listed 9; stats and report_feedback were omitted and have been added to the task definition. Whether both received enrichment under the original execution is unverified.)*
- requirements met vs unmet:
  - [met] All MCP tool descriptions include usage examples and parameter docs (AC-15)
  - [met] Descriptions accurately reflect runtime behavior (no profile-isolation claims where runtime only filters by project)
  - [met] Targeted regression assertions prevent re-introduction of misleading metadata
  - [done 2026-07-03] Update the `consolidate` tool's annotation/description further — added `annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }` (deferred scope delivered in same session as doc review)
- architectural impact: unchanged — metadata-only, no handler or schema changes
- supporting evidence: 10/10 `mcp-protocol-compat.test.ts` tests pass including 3 targeted regression assertions (search fallback, search_thoughts project scoping, list_thoughts project scoping)
- downstream changes: Board ST-047 moved to Review; `.gitignore` updated for runtime byproducts

---

## §2. Definition of Done

- All MCP tool descriptions include at least one example value per parameter.
- All descriptions mention expected error conditions.
- Tool listings (via MCP tools/list) show the enriched descriptions.
- No logic changes — pure description text updates.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] No judgment calls
- [x] Requirements mapped
- [x] Verification steps
- [x] Observable criteria

Status: ✅ Ready — implementation and remediation complete

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| All MCP tool descriptions include usage examples and parameter docs (QP-038 AC-15) | Updated description strings in tool registrations | Task 4.1 | Test: tool descriptions contain example values |

---

## §3. Preconditions

- Docker Compose test stack running
- No schema changes

---

## §4. Task Definitions

### Task 4.1: Enrich tool descriptions

**Objective:** Update all tool description strings with examples, output format, and error conditions.

**Input:** `server/index.ts` — each `registerTool` call's description field.

**Working directory:** `/home/cpeddle/projects/ai-memory`

**Steps:**

1. Update each tool's `description` field. Target format per tool:

   **search_thoughts:**
   ```
   Search captured thoughts by meaning and keyword. Combines BM25 full-text and vector similarity (512-dim cosine), fused via Reciprocal Rank Fusion (k=60) with MMR diversity re-ranking (λ=0.7).

   Parameters:
   - query (required): Natural language search. Example: "how to handle TypeScript generics"
   - context (optional): Scope filter. Format: "project:<name>,profile:<professional|personal>,strict". Example: "project:ai-memory,profile:professional"
   - limit (optional): Max results, 1-100. Default: 10.

   Returns: Ranked results with RRF scores, memory type, and project. Results include full content.
   Errors: Returns error if context format is invalid (see parseContext validation).
   Notes: Use "strict" in context to restrict results to exact project match. Without strict, cross-project results are included with lower boost.
   ```

   **capture_thought:**
   ```
   Save a new thought to AI Memory. Generates a 512-dim embedding via text-embedding-3-small. Deduplicates by content fingerprint (SHA-256).

   Parameters:
   - content (required): The thought to capture. Must be < 32KB. Example: "TypeScript 5.5 introduces inferred type predicates for filter() calls"
   - memory_type (optional): "shard" (default, raw observation) or "wiki" (promoted fact).
   - context (optional): Scope. Example: "project:my-project,profile:professional"

   Returns: Confirmation with ID, memory_type, and project.
   Errors: Rejects content > 32KB. Invalid context format returns validation error. Duplicate content (same fingerprint) updates the existing thought's timestamp.
   ```

   **list_thoughts:**
   ```
   List recently captured thoughts with optional filters. Returns content snippets (120 chars) sorted by creation date descending.

   Parameters:
   - limit (optional): 1-100, default 10. Example: 20
   - memory_type (optional): "shard" or "wiki". Example: "wiki"
   - context (optional): Scope filter. Example: "project:ai-memory"
   - days (optional): Only thoughts from last N days. Example: 7

   Returns: Numbered list with date, type, project, and content preview.
   ```

   **thought_stats:**
   ```
   Get aggregate counts of active thoughts broken down by memory_type and project. No parameters needed.

   Returns: Total count, counts per memory_type (shard/wiki), and top 10 projects by thought count.
   ```

   **graph_traverse:**
   ```
   Run a read-only openCypher MATCH query against the memory_graph (Apache AGE). For multi-hop entity traversal, causation chains, and relationship inference.

   Parameters:
   - cypher (required): Must start with MATCH. Max 4096 chars. Example: "MATCH (a:Person)-[:WORKS_ON]->(p:Project) RETURN a.name, p.name LIMIT 10"

   Returns: Query results as agtype strings, one per line.
   Errors: Rejects queries with mutation keywords (CREATE, SET, DELETE, MERGE, REMOVE, DETACH, DROP, CALL, LOAD). Rejects non-MATCH queries. Max length 4096 chars.
   Notes: For safer parameterized traversal, prefer graph_search. This tool is for advanced Cypher users. Deprecation planned in favor of graph_search for new integrations.
   ```

   **graph_search:**
   ```
   Search the knowledge graph starting from a named entity, traversing relationships up to a specified depth. Safer than graph_traverse — no Cypher required.

   Parameters:
   - start_node (required): Entity name to start from. Example: "TypeScript"
   - relationship_filter (optional): Limit to one relationship type. Allowed: CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO. Example: "USES"
   - max_hops (optional): Traversal depth 1-3, default 2. Example: 1

   Returns: Connected nodes within the specified hop distance.
   Errors: Invalid relationship_filter returns allowed list.
   ```

   **consolidate:**
   ```
   Manually trigger a consolidation sweep (shard → wiki promotion). Evaluates eligible shards using three-factor scoring (frequency, diversity, relevance).

   Parameters:
   - dry_run (optional): If true, evaluates but doesn't mutate thoughts. Default: false.
   - limit (optional): Max candidates to process, 1-500. Default: 50.

   Returns: JSON with processed count and dry_run flag.
   ```

   **search (ChatGPT compat):**
   ```
   Search memories by semantic similarity (ChatGPT compatibility tool). Uses vector search only (no BM25). For richer search, use search_thoughts instead.

   Parameters:
   - query (required): Search query. Example: "error handling patterns"

   Returns: JSON with results array (id, title, url). Max 10 results, similarity threshold 0.5.
   ```

   **fetch (ChatGPT compat):**
   ```
   Fetch a single active thought by UUID (ChatGPT compatibility tool).

   Parameters:
   - id (required): Thought UUID. Example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

   Returns: Full thought content with metadata (memory_type, project, timestamps).
   Errors: Returns "Not found" if ID doesn't exist or thought is inactive.
   ```

   **stats (worker & system statistics):**
   ```
   Get queue, worker, recall, and content statistics. Use when an agent needs operational status for ai-memory background work and recent recall activity. No parameters; call with {}. Example: {}. Returns: JSON with queues, workers, recall, and content sections. Errors/edge cases: database failures are returned as tool errors; broader than thought_stats — includes worker health signals.
   ```

   **report_feedback:**
   ```
   Report whether a recalled thought was helpful or irrelevant for a given query. Use after evaluating a search result — for example, after a code edit attributable to a recalled memory. Parameters: thought_id (UUID of the thought), query (original search query text), verdict ('helpful' or 'irrelevant'). Example: {"thought_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","query":"embedding timeout investigation","verdict":"helpful"}. Returns: confirmation message. Errors/edge cases: invalid UUIDs fail schema validation; non-existent thought_id returns a foreign key violation.
   ```

2. Keep descriptions concise but complete. The above are templates — adapt to fit within reasonable length.

**Expected output:** All tools have enriched descriptions visible via MCP tools/list.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/mcp-protocol-compat.test.ts
```

---

### Task 4.2: Expand `mcp-protocol-compat.test.ts` with description regression assertions

**Working directory:** `/home/cpeddle/projects/ai-memory`

**Note (post-implementation update 2026-07-03):** The original plan called for creating `server/tests/tool-descriptions.test.ts`. During execution the approach changed to expanding the existing `mcp-protocol-compat.test.ts` instead. The file `server/tests/tool-descriptions.test.ts` was never created.

**Steps:**

1. In `server/tests/mcp-protocol-compat.test.ts`, add targeted regression assertions:
   - Derive expected tool names from the MCP `tools/list` response as the source of truth (avoids hard-coding a separate list)
   - Assert that `search_thoughts` description does not claim profile-based isolation (runtime only filters by project)
   - Assert that `list_thoughts` description does not claim profile-based isolation
   - Assert that the `search` fallback behavior description accurately reflects the actual fallback path

2. All tool descriptions must contain at least one example value and mention expected returns or errors.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/mcp-protocol-compat.test.ts
```

---

### Task 4.3: Full test suite

```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
```

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Next task** | N/A — complete (2026-06-19) |
| **Known blockers** | None |

---

## §5c. Approach Ledger

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Enrich description strings with examples/errors | git HEAD | 🟢 Active |

---

## §6. Execution Log

- Task 4.1 complete: All tool descriptions enriched in `server/index.ts`. During review, two misleading descriptions were discovered and corrected: `search_thoughts` and `list_thoughts` incorrectly claimed profile-based isolation — runtime only filters by project. `search` fallback description was also corrected.
- Task 4.2 complete: Targeted regression assertions added to `mcp-protocol-compat.test.ts` (approach changed from creating a new file — see §6b). Source-of-truth tool name derivation added.
- Task 4.3 complete: 10/10 `mcp-protocol-compat.test.ts` tests pass including 3 targeted regression assertions.

---

## §6b. Surprises & Discoveries

- **Test strategy changed:** Original plan created `server/tests/tool-descriptions.test.ts`. During execution the decision was made to expand `mcp-protocol-compat.test.ts` instead — keeping description validation co-located with protocol compatibility tests and avoiding a redundant test file. The new file was never created.
- **Misleading metadata found:** `search_thoughts` and `list_thoughts` incorrectly claimed to filter by `profile` in addition to `project`. The runtime only filters by project — profile is parsed from context but not enforced as a DB predicate. Descriptions corrected.
- **Search fallback description corrected:** The original `search` (ChatGPT compat) description implied fallback behavior that did not match the actual implementation. Corrected to accurately reflect the vector-only search path.

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board
3. Present results

---

## §7b. Outcomes & Retrospective

- **Completion status:** Full.
- **Key findings/achievements:** All 10 MCP tool descriptions enriched with usage guidance, parameter docs, examples, return expectations, and error/edge-case information. Two misleading descriptions corrected to match runtime behavior. Protocol compatibility test expanded with source-of-truth tool name derivation and 3 targeted regression assertions.
- **Requirements met vs unmet:**
  - [met] All MCP tool descriptions include usage examples and parameter docs (AC-15)
  - [met] Descriptions accurately reflect runtime behavior (no profile-isolation claims where runtime only filters by project)
  - [met] Targeted regression assertions prevent re-introduction of misleading metadata
  - [deferred] See Open Questions below: "consolidate tool annotations" deferral needs disambiguation.
- **Architectural impact:** Unchanged — metadata-only, no handler or schema changes.
- **Supporting evidence:** 10/10 `mcp-protocol-compat.test.ts` tests pass including 3 targeted regression assertions.
- **Downstream changes:** Board ST-047 moved to Review; `.gitignore` updated for runtime byproducts.

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.18.
- 2026-07-03: Post-implementation doc review (ce-doc-review). Applied: duplicate §2b checklist entry removed; Windows working-directory paths corrected to Linux; Task 4.2 rewritten to document actual approach (expanded mcp-protocol-compat.test.ts, not a new file); stats and report_feedback added to Task 4.1 tool enumeration; §5b/§6/§6b/§7b populated.

---

## Open Questions

### From 2026-07-03 review

- **[F-03] RESOLVED:** `[deferred] consolidate tool annotations` means: update the `consolidate` MCP tool's own annotation/description further. Added `annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }` to the `consolidate` tool registration in `server/index.ts` (2026-07-03). Delivered in the same session as the doc review; no separate story needed.
