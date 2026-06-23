---
title: parseContextOrError null-safety crash — "isError" in null throws TypeError
date: 2026-06-23
category: runtime-errors
module: server/mcp-tool-handlers
problem_type: runtime_error
component: service_object
severity: high
symptoms:
  - "capture_thought calls without a context parameter crash with TypeError: Cannot use 'in' operator to search for 'isError' in null"
  - "Same crash pattern affects search_thoughts and list_thoughts handlers"
  - "All ST-029 integration tests failed at the capture_thought seeding step"
  - "curl to /mcp returned the TypeError in the MCP error envelope, confirming server-side crash"
  - "Bug reproduced on main via git stash — pre-existing, not introduced by ST-029"
root_cause: logic_error
resolution_type: code_fix
tags:
  - null-safety
  - type-guard
  - mcp
  - in-operator
  - optional-argument
  - parsecontext
  - iserror
---

# parseContextOrError null-safety crash — "isError" in null throws TypeError

## Problem

Three MCP tool handlers (`search_thoughts`, `capture_thought`, `list_thoughts`) in `server/index.ts` used `"isError" in scopeResult` to check whether `parseContextOrError(context)` returned an MCP error envelope. When the optional `context` argument is omitted (the common case), `parseContextOrError(undefined)` returns `null`, and the JavaScript `in` operator throws `TypeError: Cannot use 'in' operator to search for 'isError' in null`. Every tool call that omitted `context` crashed at the handler entry point.

## Symptoms

- `TypeError: Cannot use 'in' operator to search for 'isError' in null` thrown from `search_thoughts`, `capture_thought`, and `list_thoughts` handlers whenever `context` was not supplied
- Integration tests for the new ST-029 Feedback API failed en masse: every test helper that called `capture_thought` (used to seed thoughts) without a `context` parameter crashed before reaching the feature under test
- Raw `curl` calls to `/mcp` invoking any of the three tools without `context` returned the `TypeError` in the MCP error envelope, confirming the failure was server-side
- Bug was pre-existing (not introduced by ST-029): `git stash` of the ST-029 changes reproduced the identical crash on the prior commit

## What Didn't Work

- **Treating it as a test-code bug first.** The initial symptom was a flood of failed integration tests, so the first instinct was that the test helpers were parsing the MCP response envelope incorrectly. Rewriting response parsing in the helpers did nothing — the server was never returning a successful response to `capture_thought` in the first place. A `curl` against `/mcp` revealed the `TypeError` was coming from the handler, not the test. Lesson: when every test fails at a shared seeding step, reach for `curl` against the live endpoint before editing test harness code — it localizes the fault to server vs. test in one round.
- **Inline null guard at each call site (first fix attempt).** Adding `if (scopeResult && "isError" in scopeResult) return scopeResult;` to all three handlers worked, but code review flagged it as repeated, fragile boilerplate — the next person to add a tool handler would copy-paste the unguarded `"isError" in` form and reintroduce the crash. The pattern needed to live in one place.

## Solution

Extract a single type guard into `parseContext.ts` that performs the null check internally, and call it at every site.

**Before (each of 3 handlers, `server/index.ts`):**
```typescript
const scopeResult = parseContextOrError(context);
if ("isError" in scopeResult) return scopeResult;   // throws when scopeResult === null
```

**After — `server/src/parseContext.ts`:**
```typescript
export function isMcpContextError(
  result: ContextScope | null | { content: Array<{ type: "text"; text: string }>; isError: true },
): result is { content: Array<{ type: "text"; text: string }>; isError: true } {
  return result !== null && "isError" in result && result.isError === true;
}
```

**After — each of 3 handlers (`server/index.ts`):**
```typescript
const scopeResult = parseContextOrError(context);
if (isMcpContextError(scopeResult)) return scopeResult;
const scope = scopeResult;   // ContextScope | null — use optional chaining; null means "no scope"
```

The return type of `parseContextOrError` was already a three-way union (`ContextScope | null | {…; isError: true }`); the bug was purely that callers narrowed it with a raw `in` check instead of a null-safe guard. The type guard is the single, importable source of truth for that narrowing.

## Why This Works

The JavaScript `in` operator requires its right-hand operand to be an object; `null` is not an object, so `"isError" in null` throws per spec rather than evaluating to `false`. The guard's `result !== null` short-circuit runs before `in` ever sees a non-object, cleanly distinguishing `null` ("no scope"), the error envelope ("bad scope"), and `ContextScope` (normal handler logic).

## Prevention

**1. Never use the `in` operator directly against a nullable — encapsulate it in a type guard.**

A bare `in` check looks safe to a reader ("if the property isn't there, it's false") but throws on `null`/`undefined`. The type guard makes the null check non-optional and reusable:

```typescript
// Bad — throws on null, and is copy-pasted at every call site:
if ("isError" in result) return result;

// Good — one guard, null-safe, type-narrowing (illustrative):
export function isMcpContextError(result: SomeType | null): result is ErrorEnvelope {
  return result !== null && "isError" in result && result.isError === true;
}
if (isMcpContextError(result)) return result;
```

**2. Test the "no argument" path, not just the edge cases.**

The bug survived because tests always passed a `context` string (or always omitted it in helpers that happened to hit a different code path). Add an explicit test that calls each tool with the optional argument omitted — the common production case:

```typescript
Deno.test("tool handler succeeds with context omitted (the common path)", async () => {
  const res = await callTool("search_thoughts", { query: "x" });   // no context key
  assert(!isMcpContextError(res));
});
```

**3. When a helper returns a union including `null`, ship the narrowing helper next to it.**

`parseContext` / `parseContextOrError` / `isMcpContextError` now live in one file as a matched set — anyone importing the producer gets the consumer for free, removing the temptation to hand-roll an `in` check.

## Related Findings (same session)

Co-discovered issues sharing the root theme of under-tested common paths and inconsistent validation units:

- **Character-vs-byte validation mismatch:** `z.string().max(4096)` counts UTF-16 code units while the DB `CHECK (octet_length(query) <= 4096)` counts bytes. Multibyte queries passed Zod but failed at DB insert. Fixed with a handler-level `new TextEncoder().encode(query).length` byte check, consistent with `capture_thought`'s 32KB pattern.
- **Missing migration bootstrap detection:** `detectBootstrapVersions` in `server/src/migrate.ts` had probes for migrations 1-4 but not 5. Fixed by adding a `feedback_events` table probe and updating test expectations.
- **Missing schema.sql canonical baseline:** `feedback_events` was added to `005_feedback_events.sql` but not to `server/db/schema.sql`. Fixed by adding section §10.
- **Duplicated test helpers:** `extractThoughtId` was duplicated across test files. Fixed by extracting to `server/tests/_helpers/thoughts.ts`.

## Related Docs

- `docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md` — adjacent; cites parseContext.ts as semantic authority for project-based filtering
