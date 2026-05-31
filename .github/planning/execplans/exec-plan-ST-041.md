# ExecPlan — ST-041: Cypher Injection Hardening

> Status: ⬜ Not Ready
> Story: ST-041
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The `graph_traverse` tool in `server/index.ts` accepts arbitrary openCypher queries. The current security mitigation is:

```typescript
const ALLOWED_MATCH_RE = /^match\s/i;
const DOLLAR_QUOTE_RE = /\$\$/g;

// In handler:
if (!ALLOWED_MATCH_RE.test(trimmed)) { /* reject */ }
const safeCypher = trimmed.replace(DOLLAR_QUOTE_RE, "");
```

**Vulnerabilities:**
1. A query like `MATCH (n) DELETE n` passes the regex (starts with MATCH) but contains a mutation keyword.
2. `MATCH (n) SET n.name = 'pwned'` similarly passes.
3. `MATCH (n) CALL apoc.export.csv.all()` (if APOC were loaded) passes.
4. The `$$` stripping prevents dollar-quote injection but doesn't prevent inline mutations after MATCH.

This story replaces the insufficient check with a **keyword deny-list** that tokenizes the query and rejects any occurrence of mutation keywords regardless of position. It also adds a max query length limit.

**Key file:** `server/index.ts` — `graph_traverse` tool registration (around line 385).

**Non-goal:** Changing `graph_search` (it already uses parameterized patterns with allow-listed relationship types — no injection vector there).

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- `graph_traverse` rejects queries containing `CREATE`, `SET`, `DELETE`, `REMOVE`, `MERGE`, `DETACH`, `DROP`, `CALL`, or `LOAD` (case-insensitive, word-boundary match).
- `graph_traverse` rejects queries exceeding 4096 characters.
- `graph_traverse` rejects queries that don't start with `MATCH` (existing behaviour preserved).
- Legitimate `MATCH ... RETURN` queries continue to work.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| `graph_traverse` rejects mutation keywords (QP-038 AC-12) | Keyword deny-list in tool handler | Task 4.1 | Test: `MATCH (n) DELETE n` returns error |

---

## §3. Preconditions

- Docker Compose test stack running
- No DDL or schema changes needed
- Graph must have at least one node for the positive test (the seeded test corpus should provide this)

---

## §4. Task Definitions

### Task 4.1: Replace Cypher validation with keyword deny-list

**Objective:** Reject any Cypher query containing mutation keywords, regardless of position.

**Input:** `server/index.ts` — `graph_traverse` tool handler.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Locate the constants and handler for `graph_traverse` in `server/index.ts` (around line 380):
   ```typescript
   const ALLOWED_MATCH_RE = /^match\s/i;
   const DOLLAR_QUOTE_RE = /\$\$/g;
   ```

2. Replace with a more robust validation:
   ```typescript
   // --- Cypher injection mitigation (graph_traverse) ---
   const CYPHER_MUST_START_WITH = /^match\s/i;
   const CYPHER_DENIED_KEYWORDS = /\b(CREATE|SET|DELETE|REMOVE|MERGE|DETACH|DROP|CALL|LOAD)\b/i;
   const CYPHER_MAX_LENGTH = 4096;
   ```

3. In the `graph_traverse` handler, replace the existing validation block:
   ```typescript
   async ({ cypher }) => {
     try {
       const trimmed = cypher.trim();

       // Length limit
       if (trimmed.length > CYPHER_MAX_LENGTH) {
         return {
           content: [{ type: "text" as const, text: `Error: Query exceeds maximum length of ${CYPHER_MAX_LENGTH} characters.` }],
           isError: true,
         };
       }

       // Must start with MATCH
       if (!CYPHER_MUST_START_WITH.test(trimmed)) {
         return {
           content: [{ type: "text" as const, text: "Only MATCH queries are accepted. Query must start with MATCH." }],
           isError: true,
         };
       }

       // Deny-list: reject mutation keywords anywhere in the query
       const denied = trimmed.match(CYPHER_DENIED_KEYWORDS);
       if (denied) {
         return {
           content: [{
             type: "text" as const,
             text: `Error: Query contains disallowed keyword "${denied[0]}". Only read-only MATCH...RETURN queries are accepted. Mutating statements (CREATE, MERGE, SET, DELETE, REMOVE, DETACH, DROP, CALL, LOAD) are not allowed.`,
           }],
           isError: true,
         };
       }

       // Strip $$ to prevent dollar-quote injection in sql.unsafe block
       const safeCypher = trimmed.replace(/\$\$/g, "");

       const rawRows = await sql.unsafe(`
         LOAD 'age';
         SET search_path = ag_catalog, "$user", public;
         SELECT * FROM cypher('memory_graph', $$ ${safeCypher} $$) AS t(result agtype);
       `);
       const rows = extractAgeRows(rawRows);
       const results = rows.map((r) => String(r.result));
       return { content: [{ type: "text" as const, text: results.length ? results.join("\n") : "No results." }] };
     } catch (err) {
       return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
     }
   }
   ```

4. Remove the old `ALLOWED_MATCH_RE` and `DOLLAR_QUOTE_RE` constants (replaced by the new ones above).

**Design decisions:**
- **Word boundary (`\b`)** ensures we don't reject queries containing "DELETED_AT" or "SETTINGS" as property names. Only standalone keywords match.
- **LOAD in deny-list:** Prevents `LOAD CSV` or `LOAD 'extension'` injection. Our own `LOAD 'age'` is in the SQL wrapper (outside the user's Cypher), so it's unaffected.
- **$$ stripping retained:** Belt-and-suspenders. Even though the deny-list catches most attacks, stripping `$$` prevents escaping the Cypher block into raw SQL.

**Expected output:** Mutation queries are rejected with a specific error naming the disallowed keyword.

**Requirement mapping:** §2d row 1 (AC-12)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/cypher-injection.test.ts
```

**Failure handling:** If a legitimate query uses `SET` or `DELETE` as a property value (e.g. `MATCH (n) WHERE n.status = 'DELETE' RETURN n`), the word-boundary regex will match it. This is an acceptable false positive for a security control — the user can use `graph_search` instead or abbreviate the value.

---

### Task 4.2: Write injection prevention tests

**Objective:** Comprehensive test coverage for the Cypher validation.

**Input:** Test infrastructure in `server/tests/`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/cypher-injection.test.ts`:

   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   // --- Mutation keywords should be rejected ---

   const MUTATION_QUERIES = [
     { query: "MATCH (n) DELETE n", keyword: "DELETE" },
     { query: "MATCH (n) SET n.name = 'pwned'", keyword: "SET" },
     { query: "MATCH (n) DETACH DELETE n", keyword: "DETACH" },
     { query: "MATCH (n) REMOVE n.name", keyword: "REMOVE" },
     { query: "MATCH (a), (b) CREATE (a)-[:OWNS]->(b)", keyword: "CREATE" },
     { query: "MATCH (a), (b) MERGE (a)-[:OWNS]->(b)", keyword: "MERGE" },
     { query: "MATCH (n) CALL apoc.do.something()", keyword: "CALL" },
     { query: "MATCH (n) WITH n LOAD CSV FROM 'http://evil.com' AS row RETURN row", keyword: "LOAD" },
     { query: "match (n) drop constraint IF EXISTS", keyword: "drop" },
   ];

   for (const { query, keyword } of MUTATION_QUERIES) {
     Deno.test(`graph_traverse rejects: ${keyword}`, async () => {
       const result = await callTool("graph_traverse", { cypher: query });
       assertEquals(result.isError, true, `Should reject query with ${keyword}`);
       assertEquals(
         result.content[0].text.toLowerCase().includes("disallowed"),
         true,
         "Error should mention 'disallowed'",
       );
     });
   }

   // --- Non-MATCH start should be rejected ---

   Deno.test("graph_traverse rejects non-MATCH start", async () => {
     const result = await callTool("graph_traverse", { cypher: "CREATE (n:Test {name: 'evil'})" });
     assertEquals(result.isError, true);
     assertEquals(result.content[0].text.includes("must start with MATCH"), true);
   });

   // --- Length limit ---

   Deno.test("graph_traverse rejects queries exceeding 4096 chars", async () => {
     const longQuery = "MATCH (n) " + "WHERE n.name = 'x' ".repeat(300) + "RETURN n";
     const result = await callTool("graph_traverse", { cypher: longQuery });
     assertEquals(result.isError, true);
     assertEquals(result.content[0].text.includes("maximum length"), true);
   });

   // --- Legitimate queries should pass ---

   Deno.test("graph_traverse accepts valid MATCH...RETURN query", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) RETURN n LIMIT 5",
     });
     // May return results or "No results." depending on graph state — both are valid
     assertEquals(result.isError, undefined);
   });

   // --- Word boundary: property values containing keywords should NOT trigger ---
   // NOTE: This is a known false-positive limitation. The regex matches word
   // boundaries, so `SET` inside a string literal like WHERE n.x = 'SET' WILL match.
   // This test documents the current behaviour (reject). If future work implements
   // proper token-level parsing, this test should be updated.

   Deno.test("graph_traverse rejects SET even in property context (documented limitation)", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) WHERE n.status = 'DELETE' RETURN n",
     });
     // Current implementation: rejects because DELETE appears as a word
     assertEquals(result.isError, true);
   });
   ```

**Expected output:** All mutation attempts are rejected; legitimate queries pass; edge cases documented.

**Requirement mapping:** §2d row 1 (verification evidence)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/cypher-injection.test.ts
```
Expected: All tests pass (12+ tests depending on MUTATION_QUERIES length).

**Failure handling:** If the graph is empty and `MATCH (n) RETURN n LIMIT 5` returns an error (as opposed to "No results."), check that the AGE extension is loaded and `memory_graph` exists in the test database.

---

### Task 4.3: Full test suite + cross-model review

**Objective:** No regressions + mandatory review.

**Steps:**

1. Run full test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

2. **Cross-model review checklist:**
   - Does the regex `\b` word boundary work correctly for Cypher? (Yes — Cypher keywords are always standalone words separated by whitespace or punctuation.)
   - Could an attacker bypass with Unicode homoglyphs? (Low risk — AGE's parser wouldn't recognize homoglyphs as keywords either, so the attack would fail at execution.)
   - Is there a time-of-check/time-of-use issue? (No — the check and the query execution happen synchronously in the same function.)
   - Does `LOAD` in the deny-list conflict with the `LOAD 'age'` in the SQL wrapper? (No — the deny-list checks only the user's Cypher string, not the surrounding SQL.)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected: All tests pass.

---

## §5. State Recovery Protocol

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Replace Cypher validation |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Keyword deny-list with word-boundary regex + length cap | git HEAD | 🟢 Active |

### Approach Failure Log
(Empty)

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

*(populated during execution)*

---

## §6c. Decision Log

*(populated during execution)*

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification
2. Update board: move to Review
3. Present results to PO
4. Log any compound detections

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.15.
