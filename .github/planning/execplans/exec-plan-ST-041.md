# ExecPlan — ST-041: Cypher Injection Hardening

> Status: ✅ Ready for /continue
> Story: ST-041
> Created: 2026-05-31
> Approved: 2026-06-10
> Parent: .github/planning/query-packets/QP-041-cypher-injection-hardening.md
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

This story replaces the insufficient check with a **token-aware keyword deny-list** that rejects executable mutation keywords while permitting keyword text inside quoted strings and comments. It also adds a max query length limit.

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
- `graph_traverse` fails closed on malformed literal/comment input (for example unterminated strings or block comments) and does not execute the query.
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
- [x] Final verification task includes cross-model critical review by a different model before story transition to Review

Status: ✅ Ready — approved 2026-06-10

---

## §2c. Plan Review Notes

- 2026-06-10: PO locked deny-list behavior to token-aware validation (do not reject mutation keywords when they appear only in quoted strings/comments).
- 2026-06-10: PO kept max query length cap at 4096 characters.
- 2026-06-10: Scope lock confirmed: graph_traverse hardening + focused tests only. Rate limiting and all non-ST-041 work remain out of scope.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Reject executable mutation keywords (QP-041 AC-1) | Token-aware deny-list in `graph_traverse` | Task 4.1 | `tests/cypher-injection.test.ts` mutation cases fail closed |
| Enforce query length cap at 4096 (QP-041 AC-2) | Length guard in `graph_traverse` | Task 4.1 | `tests/cypher-injection.test.ts` long-query rejection |
| Preserve MATCH-only gate (QP-041 AC-3) | Start-token validation in `graph_traverse` | Task 4.1 | `tests/cypher-injection.test.ts` non-MATCH rejection |
| Fail closed on malformed literal/comment input (derived from QP-041 token-aware policy) | Masking helper rejects ambiguous parse state before execution | Task 4.1, Task 4.2 | `tests/cypher-injection.test.ts` unterminated quote/comment rejection |
| Preserve read-only MATCH query success (QP-041 AC-4) | Validation allows safe read-only Cypher | Task 4.2 | `tests/cypher-injection.test.ts` accepted read-only and literal/comment edge cases |
| Cross-model critical review before Review transition (planning rule) | Explicit reviewer task with contract checklist | Task 4.3 | Logged cross-model review result in §6 and PASS before board move |

---

## §3. Preconditions

- Docker Compose test stack running
- No DDL or schema changes needed
- Focused tests must not rely on ambient graph state for validation-only assertions; if a positive execution-path fixture is required, create or seed the minimal graph fixture inside the test/helper.

---

## §4. Task Definitions

### Task 4.1: Replace Cypher validation with token-aware deny-list

**Objective:** Reject mutation keywords only when they are executable Cypher tokens (not text inside string literals/comments).

**Input:** `server/index.ts` — `graph_traverse` tool handler.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Locate the constants and handler for `graph_traverse` in `server/index.ts` (around line 380):
   ```typescript
   const ALLOWED_MATCH_RE = /^match\s/i;
   const DOLLAR_QUOTE_RE = /\$\$/g;
   ```

2. Replace with a token-aware validation shape:
   ```typescript
   // --- Cypher injection mitigation (graph_traverse) ---
   const CYPHER_MUST_START_WITH = /^match\s/i;
   const CYPHER_DENIED_KEYWORDS = /\b(CREATE|SET|DELETE|REMOVE|MERGE|DETACH|DROP|CALL|LOAD)\b/i;
   const CYPHER_MAX_LENGTH = 4096;
   ```

3. Add a small helper in `server/index.ts` that returns a copy of the query with string literal and comment spans replaced by whitespace while preserving character offsets. Cover:
  - Single-quoted strings (`'...'`) with escaped quotes
  - Double-quoted strings (`"..."`) if present
  - Line comments (`-- ...`) and block comments (`/* ... */`)
  - Unterminated string/comment sequences must be treated as invalid input and reported before any DB call

4. Before shipping the validation path, check whether the AGE `cypher(...)` call can be executed with bound SQL parameters for the user-supplied query string.
   - If parameter binding is supported by the current SQL client + AGE call shape, use it instead of interpolating user Cypher into `sql.unsafe`.
   - If parameter binding is not supported in this path, retain the narrow wrapper but add explicit invariant tests proving the wrapper cannot be escaped by quote or dollar-quote content in user input.

5. In the `graph_traverse` handler, validate against the masked query text:
   ```typescript
   async ({ cypher }) => {
     try {
       const trimmed = cypher.trim();
     const masked = maskCypherLiteralsAndComments(trimmed);

       // Length limit
       if (trimmed.length > CYPHER_MAX_LENGTH) {
         return {
           content: [{ type: "text" as const, text: `Error: Query exceeds maximum length of ${CYPHER_MAX_LENGTH} characters.` }],
           isError: true,
         };
       }

       // Must start with MATCH after leading whitespace/comments are masked
       if (!CYPHER_MUST_START_WITH.test(masked)) {
         return {
           content: [{ type: "text" as const, text: "Only MATCH queries are accepted. Query must start with MATCH." }],
           isError: true,
         };
       }

       // Deny-list: reject executable mutation keywords only
       const denied = masked.match(CYPHER_DENIED_KEYWORDS);
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

6. Remove the old `ALLOWED_MATCH_RE` and `DOLLAR_QUOTE_RE` constants (replaced by the new ones above).

**Design decisions:**
- **Token-aware masking before deny-list** honors PO scope lock: keywords in literals/comments do not trigger rejection.
- **Word boundary (`\b`)** ensures standalone keyword matching (e.g., avoids matching `DELETED_AT`).
- **LOAD in deny-list:** Prevents `LOAD CSV`-style injection; this does not affect wrapper SQL `LOAD 'age'`.
- **SQL wrapper boundary:** prefer bound parameters if the AGE call shape supports them; otherwise keep the narrowest possible wrapper and prove escaping invariants with focused tests.
- **Fail-closed parser rule:** if masking cannot deterministically classify the query, reject it instead of attempting execution.

**Expected output:** Mutation queries are rejected with a specific error naming the disallowed keyword.

**Requirement mapping:** §2d row 1 (QP-041 AC-1)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/cypher-injection.test.ts
```

**Failure handling:** If the masking helper mis-parses malformed quote/comment sequences, fail closed by returning a validation error and do not execute the query.

---

### Task 4.2: Write injection prevention tests

**Objective:** Comprehensive test coverage for executable-keyword rejection and literal/comment safety.

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

   Deno.test("graph_traverse rejects when MATCH is not the leading executable token", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "WITH 1 AS ignored MATCH (n) RETURN n",
     });
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
     // This assertion should validate the guard only; do not depend on pre-existing graph rows.
     assertEquals(result.isError, undefined);
   });

   // --- Token-aware behavior: keywords in literals/comments should not trigger ---

   Deno.test("graph_traverse allows keyword inside string literal", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) WHERE n.status = 'DELETE' RETURN n",
     });
     assertEquals(result.isError, undefined);
   });

   Deno.test("graph_traverse allows keyword inside comment", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) -- DELETE should be ignored\nRETURN n LIMIT 1",
     });
     assertEquals(result.isError, undefined);
   });

   Deno.test("graph_traverse rejects unterminated string literal", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) WHERE n.status = 'DELETE RETURN n",
     });
     assertEquals(result.isError, true);
   });

   Deno.test("graph_traverse rejects unterminated block comment", async () => {
     const result = await callTool("graph_traverse", {
       cypher: "MATCH (n) /* DELETE should not parse RETURN n",
     });
     assertEquals(result.isError, true);
   });
   ```

**Expected output:** All mutation attempts are rejected; legitimate queries pass; malformed literal/comment input fails closed; edge cases documented.

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

2. **Mandatory cross-model critical review (different model than executor):**
  - Ask a different model to review the shipped implementation against this ExecPlan's §2 Definition of Done and §2d matrix.
  - Reviewer must explicitly answer:
    - Do tests validate the contract, not only happy-path pass/fail?
    - Are there executable mutation paths or parser edge cases still untested?
    - Does runtime behavior match token-aware scope lock (literals/comments allowed, executable keywords denied)?
  - If any contract gap is found, fix and re-run verification before story move to Review.

3. **Cross-model review checklist guidance:**
   - Does the regex `\b` word boundary work correctly for Cypher? (Yes — Cypher keywords are always standalone words separated by whitespace or punctuation.)
  - Could an attacker bypass with Unicode homoglyphs? (Low risk — AGE parser should reject them as keywords, but reviewer should still confirm no bypass through masking logic.)
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
| 1 | Token-aware deny-list + 4096 length cap | git HEAD | 🟢 Active |

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
- 2026-06-10: Re-scoped to dedicated QP-041 and PO scope lock (token-aware deny-list, 4096 cap, graph_traverse-only boundary).
