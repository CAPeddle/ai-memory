# ExecPlan — ST-049: Query Routing / Lane Skipping

> Status: ⬜ Not Ready
> Story: ST-049
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The search_thoughts handler always runs both BM25 and vector lanes regardless of the query. For short exact phrases ("ST-005", "parseContext"), BM25 alone is sufficient. For long natural-language queries with no keyword overlap, vector alone is better. Running both wastes latency and embedding API calls.

This story adds a lightweight heuristic router that can skip one lane when it's clearly unnecessary.

**Heuristic design:**
- If the query is ≤ 3 tokens and matches `[A-Z]{2,}-\d+` or `[a-z_]+` (identifier-like) → BM25 only.
- If the query is ≥ 15 tokens and has no exact-match substring results in BM25 → vector only (skip BM25 reranking, use vector scores directly).
- Otherwise → run both (default).

This is purely an optimization; search quality must not degrade.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- Queries like "ST-005" skip vector lane and still return correct result.
- Queries with 15+ tokens skip BM25 lane if BM25 returns no results.
- Golden-set tests (ST-046) still pass — no quality regression.
- A unit test confirms lane-skipping logic.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] No judgment calls
- [x] Requirements mapped
- [x] Verification steps

Status: ⬜ Not ready — requires /plan

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Skip-lane heuristic for known-efficient queries (QP-038 AC-10) | `server/src/queryRouter.ts` | Task 4.1, 4.2 | Test: identifier query skips vector call |

---

## §3. Preconditions

- ST-046 (Golden-Set Tests) provides regression safety net
- No direct code dependency on other stories

---

## §4. Task Definitions

### Task 4.1: Create query router module

**Steps:**

1. Create `server/src/queryRouter.ts`:
   ```typescript
   export type SearchLane = "bm25_only" | "vector_only" | "both";

   const IDENTIFIER_RE = /^[A-Z]{2,}-\d+$/;  // e.g. ST-005, QP-038
   const CODE_SYMBOL_RE = /^[a-z][a-zA-Z0-9_]*$/; // e.g. parseContext

   export function routeQuery(query: string): SearchLane {
     const tokens = query.trim().split(/\s+/);
     if (tokens.length <= 3) {
       const single = tokens.join(" ");
       if (IDENTIFIER_RE.test(single) || CODE_SYMBOL_RE.test(single)) {
         return "bm25_only";
       }
     }
     // Long queries: let both lanes run, but caller can skip BM25
     // if BM25 returns 0 results (handled in search handler)
     return "both";
   }
   ```

2. Unit test `server/tests/query-router.test.ts` with cases.

---

### Task 4.2: Integrate router into search_thoughts handler

**Steps:**

1. In `server/index.ts`, before calling BM25+vector:
   ```typescript
   import { routeQuery } from "./src/queryRouter.ts";

   // Inside search_thoughts handler:
   const lane = routeQuery(query);
   let bm25Results = [];
   let vectorResults = [];

   if (lane !== "vector_only") {
     bm25Results = await bm25Search(query, ctx, limit);
   }
   if (lane !== "bm25_only") {
     vectorResults = await vectorSearch(query, ctx, limit);
   }
   // Fuse only non-empty results
   ```

2. If `lane === "bm25_only"`, return BM25 results directly without RRF (since there's no second lane to fuse with).

---

### Task 4.3: Run golden-set + full test suite

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | None (ST-046 as safety net recommended but not blocking) |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.10.
