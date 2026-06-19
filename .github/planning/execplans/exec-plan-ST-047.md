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
- key findings/achievements: All 10 MCP tool descriptions enriched with usage guidance, parameter docs, examples, return expectations, and error/edge-case information. Misleading metadata (search fallback claims, search_thoughts/list_thoughts profile filtering claims) corrected to match runtime behavior. Protocol compatibility test expanded with source-of-truth tool name derivation and targeted regression assertions.
- requirements met vs unmet:
  - [met] All MCP tool descriptions include usage examples and parameter docs (AC-15)
  - [met] Descriptions accurately reflect runtime behavior (no profile-isolation claims where runtime only filters by project)
  - [met] Targeted regression assertions prevent re-introduction of misleading metadata
  - [deferred] consolidate tool annotations — separate story per scope boundary decision
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

**Working directory:** `c:\projects\ai-memory\`

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

2. Keep descriptions concise but complete. The above are templates — adapt to fit within reasonable length.

**Expected output:** All tools have enriched descriptions visible via MCP tools/list.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/mcp-protocol-compat.test.ts
```

---

### Task 4.2: Write description validation test

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/tool-descriptions.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { listTools } from "./_helpers/mcpClient.ts";

   Deno.test("all tools have descriptions with examples", async () => {
     const tools = await listTools();

     for (const tool of tools) {
       const desc = tool.description ?? "";
       assertEquals(
         desc.toLowerCase().includes("example") || desc.toLowerCase().includes("e.g."),
         true,
         `Tool "${tool.name}" description should include an example`,
       );
     }
   });

   Deno.test("all tools have descriptions mentioning errors or returns", async () => {
     const tools = await listTools();

     for (const tool of tools) {
       const desc = tool.description ?? "";
       assertEquals(
         desc.toLowerCase().includes("return") || desc.toLowerCase().includes("error"),
         true,
         `Tool "${tool.name}" description should mention returns or errors`,
       );
     }
   });
   ```

2. If `listTools` doesn't exist in the helper, add it — it calls MCP's `tools/list` method.

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
| **Next task** | Task 4.1 |
| **Known blockers** | None |

---

## §5c. Approach Ledger

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Enrich description strings with examples/errors | git HEAD | 🟢 Active |

---

## §6. Execution Log

---

## §6b. Surprises & Discoveries

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board
3. Present results

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.18.
