---
name: "ADR-018: Policy-Scope SQL Enforcement Mechanism (Row-Level Security via withPolicyScope)"
asset_type: "adr"
status: "proposed"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md"
created: "2026-09-25"
relates_to:
  - "docs/design/adr/ADR-012-tags-replace-binary-profile.md"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/05-policy-scope-foundation/05-CONTEXT.md"
  - ".planning/phases/05-policy-scope-foundation/05-RESEARCH.md"
---

# ADR-018: Policy-Scope SQL Enforcement Mechanism (Row-Level Security via `withPolicyScope()`)

**Status:** Proposed. The mechanism is proven against `db-test` only. It is **not yet enabled** on production `public.thoughts`, and no retrieval path calls it. Phase 6 wires and enables it (see [Non-Goals / Explicit Phase Boundary](#non-goals--explicit-phase-boundary)).
**Date:** 2026-09-25
**Deciders:** Christopher
**Relates to:** ADR-012 (tags replace binary `profile`), `.planning/REQUIREMENTS.md` (DECISION-01, POLICY-01/02, RETRIEVAL-01..04, CAPTURE-01), `.planning/phases/05-policy-scope-foundation/05-CONTEXT.md` (D-01..D-06), `05-RESEARCH.md` (Patterns 3-4, Pitfalls 1-2, Security Domain)
**Story:** ST-082 (v1.1 Policy-Scope Isolation)

---

## Context

Migration 007 gave every thought a `policy_scope` column: `NOT NULL`, a `CHECK` over `personal | corporate | mixed | public`, and no default. That column is a label only. Nothing filters on it yet. Roughly 15 read, write, and egress sites in Phases 6-9 must enforce it, and this ADR decides the SQL mechanism they are built against.

The decisions this rests on:

- **D-01, the trust boundary.** Scope is **declared by the caller** under the existing single-key trust model. The boundary is the same as today's `project:X,tags:Y` context string and the single `MEMORY_API_KEY`. Any authenticated caller may request any scope by naming it. This milestone adds no second credential and no per-scope role. What policy-scope isolation protects against is **accidental cross-scope bleed**: an unscoped or wrongly scoped request seeing rows it did not ask for. It does not protect against a malicious holder of the API key, who can simply declare any scope.
- **D-02, legacy backfill.** Every thought that existed before 007 was backfilled to `corporate`. Most existing memory is work content, and backfilling to `personal` would hide it from normal retrieval once default-deny is in force.
- **D-05, interim write value.** `capture_thought` writes `corporate` for every new thought. Consolidation promotion carries the source shard's scope forward.
- **Why a spike was required (D-04).** The two research passes disagreed, both at HIGH confidence. STACK.md recommended Postgres row-level security (RLS) driven by a session variable. ARCHITECTURE.md recommended explicit per-query `WHERE` predicates. D-04 settled it empirically: build `withPolicyScope()` plus a forced RLS policy against the real `thoughts` table and the real `postgres.js` pool, and decide from what it does.

---

## Decision

**Use Postgres row-level security as the primary enforcement mechanism.** The policy is keyed on a transaction-local session variable `app.policy_scope`, which is set only through `withPolicyScope()` (`server/src/policyScope.ts`). The policy uses an **allow-list guard**, not an `IS NOT NULL` guard.

This is what `server/tests/policy-scope-rls-spike.test.ts` validated this execution. The spike passes, and it commits and tears down its own state against `db-test`. The exact policy it proved:

```sql
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughts FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_scope_isolation ON thoughts
  USING (
    current_setting('app.policy_scope', true) IN ('personal', 'corporate', 'mixed', 'public')
    AND (
      policy_scope = 'public'
      OR policy_scope = current_setting('app.policy_scope', true)
    )
  );
```

And the exact helper:

```typescript
export async function withPolicyScope<T>(
  scope: PolicyScope,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  client: postgres.Sql = defaultSql,
): Promise<T> {
  return await client.begin(async (tx) => {
    await tx`SELECT set_config('app.policy_scope', ${scope}, true)`;
    return await fn(tx);
  }) as T;
}
```

**This is not currently enforced on production `public.thoughts`.** Row-level security is not enabled on the real table, the policy does not exist there, and no production tool handler or worker imports `withPolicyScope()`. The only place this policy has ever existed is inside the spike test's `try/finally` on `db-test`.

### What the spike proved

All runs used the real `db-test` `public.thoughts` table, with the DDL committed rather than held in a rollback transaction, so `withPolicyScope()` checked out real pooled connections. RLS-sensitive queries ran as a dedicated non-superuser role, `ai_memory_rls_spike`, which the test asserts is `rolsuper = false` and `rolbypassrls = false` before any case runs.

| Case | Setup | Observed |
|---|---|---|
| (b) fresh connection, run first | Reserved connection never scoped. `current_setting` asserted `NULL` | 0 rows, including 0 `public` rows |
| (a) scoped | `withPolicyScope('personal' \| 'corporate' \| 'mixed')` | Exactly `{that scope, public}`, checked by scope and by row id |
| (c) public | `withPolicyScope('public')` | Exactly `{public}` (D-06) |
| (d) reused connection | One reserved connection: `BEGIN`, `set_config('personal', true)`, query, `COMMIT`, then an unscoped query on the **same** connection. GUC asserted `= ''`, and `IS NOT NULL` asserted `true` | 0 rows, including 0 `public` rows |
| Teardown | `finally`, on both pass and fail paths | `pg_class` shows RLS and FORCE both off, `pg_policies` has no `policy_scope_isolation`, `pg_roles` has no spike role, and 0 seeded rows remain |

**Why the allow-list guard is load-bearing, shown empirically.** After a committed `set_config(..., true)`, a pooled connection's `app.policy_scope` reads as `''` (empty string), not `NULL`. A throwaway mutation run swapped the guard to `current_setting(...) IS NOT NULL`. Case (b) still passed, because a fresh connection reads `NULL`. Case (d) **failed**, because the reused connection leaked the `public` row. An `IS NOT NULL` guard is therefore unsafe on a pooled connection, and a test suite that checks only fresh connections would not catch it.

The spike's RED run is also evidence. `withPolicyScope()` was stubbed to skip `set_config`, and case (a) failed on its assertion (`personal` saw `[]`). The teardown-proof assertions still held on that failure path.

### What the spike did NOT prove

- **Only the RLS arm was built.** No explicit-`WHERE` prototype was built or measured. This ADR establishes that RLS *can* implement the matrix correctly through the real pool. It does not establish that RLS is simpler or easier to audit than per-query predicates. Per-query `WHERE` predicates remain an **unvalidated contingency**, not a tested alternative. RLS is preferred because it gives one chokepoint in place of roughly 15 per-path predicates, and it fails closed when a path forgets to scope: that path sees nothing rather than everything.
- **No real retrieval path was exercised.** The spike issues raw `SELECT`s through the helper. It does not run through `list_thoughts` or any other handler, so connection-handling quirks in a real handler (several sequential queries, the handler's own transactions) surface in Phase 6.
- **`INSERT`/`UPDATE`/`DELETE` under the policy were not tested.** Seeding and cleanup ran as the superuser. The policy has no command qualifier and no separate `WITH CHECK`, so its `USING` expression also governs writes. Under enforcement, an unscoped write fails, and a scoped write can only create rows in its own scope or `public`.
- **Concurrency limits.** See the session-variable-leakage row of the threat table.

---

## Cross-Scope Visibility Matrix

This is D-03 plus D-06, verbatim. It is the exact predicate every Phase 6-9 enforcement site is built against.

| Declared scope (`app.policy_scope`) | Sees rows with `policy_scope` in |
|---|---|
| `personal` | `{personal, public}` |
| `corporate` | `{corporate, public}` |
| `mixed` | `{mixed, public}`. `mixed` is its own bucket, **not** the union of `personal` and `corporate` |
| `public` | `{public}` only. `public` is a bucket like the others, not a broadcast scope |
| absent, `NULL`, `''`, or any other value | nothing (fail closed) |

`public` rows are visible to every declared scope automatically. No scope sees another non-public scope's rows.

---

## Trust Boundary / Threat Model

**Trust boundary.** Any request that presents the single `MEMORY_API_KEY` is trusted to *declare* a scope (D-01). The enforcement boundary sits one layer down, between the declared scope and the rows returned. Once a request has declared scope X, no code path may return it a row outside X's visibility set, and a request that declares nothing gets nothing. The session variable is the only carrier of the declared scope into SQL, and `withPolicyScope()` is the only sanctioned writer of that variable.

| Threat | STRIDE | Disposition | Mitigation / status |
|---|---|---|---|
| Default-allow gap: a row with no scope or an invalid scope | Information Disclosure | mitigate (done, Phase 5 / 05-01) | `NOT NULL` plus `CHECK` with no `DEFAULT`, every INSERT site states a scope, and the backfill ran before the constraint was added |
| Session-variable leakage across a pooled connection | Information Disclosure | mitigate (**partially verified**) | `set_config(name, value, true)` inside `client.begin()`, never a bare `SET`. Postgres reverts it at COMMIT/ROLLBACK. **Verified:** sequential reuse of one physical connection (spike case (d)). **Unverified:** genuinely concurrent traffic with differing scopes across the pool's connections (`max: 10`); reuse after several intervening unscoped queries; reconnection after the pool's 30 s `idle_timeout`. Phase 6 must not treat this ADR as evidence of safety under production concurrency |
| RLS bypassed by the table owner | Elevation of Privilege | mitigate | `FORCE ROW LEVEL SECURITY`, so a non-superuser role that owns the table is still filtered |
| RLS bypassed by a superuser | Elevation of Privilege | **open, precondition of Phase 6** | The application's `ai_memory` role is a Postgres superuser, and superusers bypass RLS unconditionally. `FORCE` does not change that. The spike used a dedicated non-superuser role for this reason. See Non-Goals |
| Fail-open predicate on an absent or empty GUC | Elevation of Privilege / Information Disclosure | mitigate (verified) | Allow-list guard `IN ('personal','corporate','mixed','public')`. Rejects `NULL`, `''`, and any stray value. Proven by cases (b) and (d), plus the `IS NOT NULL` mutation run |
| `ON CONFLICT` merge widening `policy_scope` | Elevation of Privilege | mitigate (done, 05-01) | `policy_scope` is absent from every `DO UPDATE SET` list, so the existing row's scope always wins |
| Production not yet enforced | Information Disclosure | **accept, tracked to Phase 6** | Deliberate phase boundary. Until Phase 6, retrieval returns every scope's rows exactly as it did before v1.1 |

---

## Non-Goals / Explicit Phase Boundary

- **Not enabled on production `public.thoughts` in this phase.** Phase 5 ships the column and the proven design only. Enabling `FORCE ROW LEVEL SECURITY` before every path is scoped would make every unscoped path fail closed: `search_thoughts`, `capture_thought`'s read-back, `thought_stats`, `fetch`, `search`, and all three background workers would see zero rows (05-RESEARCH.md Pitfall 1).
- **No retrieval path calls `withPolicyScope()` yet.** That covers `search_thoughts`, `list_thoughts`, `thought_stats`, `fetch`, `search`, `graph_search`, and `graph_traverse`, and none of `entityWorker`, `consolidationWorker`, or `embeddingBackfill` imports it either. **Phase 6 (SQL Retrieval Enforcement, RETRIEVAL-01..04)** is the phase that wires these paths and then enables RLS for real, in the same change.
- **A non-superuser application role is a precondition of Phase 6 enablement.** The application connects as `ai_memory`, which is a Postgres superuser (created through `POSTGRES_USER`). Superusers bypass RLS whatever `FORCE ROW LEVEL SECURITY` says, so the spike proved the policy only through the dedicated non-superuser `ai_memory_rls_spike` role. **Enabling RLS in production while the application still connects as `ai_memory` would be a silent no-op**: every query would still see every row, and the enforcement would look active without being active. Before Phase 6 flips the switch, runtime queries must move onto a role that is neither `rolsuper` nor `rolbypassrls`. Migrations and the AGE extension load may still need an elevated role, so the two must be split. Who introduces that role, and whether it lands in Phase 6 or as a prerequisite story, is open.
- **Graph (AGE) isolation is Phase 7.** Egress gating is Phase 8. The port contract is Phase 9. RLS on `thoughts` does not cover the AGE `memory_graph`, which those phases handle separately.

---

## Consequences

**What Phases 6-9 build against.** The policy expression in [Decision](#decision), the matrix in [Cross-Scope Visibility Matrix](#cross-scope-visibility-matrix), and `withPolicyScope()` as the only way a request declares scope to SQL. Every enforcement site runs its queries through `withPolicyScope()`, and every negative-isolation test asserts against this matrix.

**Phase 6 must also settle what this spike did not.** That means:

- a per-command policy contract (`SELECT` versus `INSERT`/`UPDATE`/`DELETE`, and whether a separate `WITH CHECK` is needed);
- an authorized execution context for background workers that legitimately operate across scopes, such as consolidation promotion and entity or embedding sweeps. Otherwise they silently stop finding work;
- tests of those paths under forced RLS before enablement;
- the non-superuser runtime role above.

**Changing the matrix is costly.** Widening or narrowing D-03/D-06 later means revisiting every enforcement site and its negative-isolation tests, which is the same reversibility class as D-03 itself. Switching mechanism from RLS to per-query `WHERE` after Phase 6 lands would mean writing and testing a predicate at each of roughly 15 sites.

**All v1.1 production data is `corporate`.** CAPTURE-01, which lets the caller declare scope at capture time, is deferred to v2. Throughout this milestone (v1.1), `capture_thought` therefore writes the D-05 interim value `'corporate'` for every new thought, and promotion inherits it. **No `personal`- or `mixed`-scoped thought can exist in production until CAPTURE-01 ships**, so Phases 6-9's per-scope enforcement has no non-`corporate` production data to isolate until then. Phase 6 does not change this. Its requirements (RETRIEVAL-01..04) filter on the retrieval side and do not resolve scope at capture time. Isolation correctness in v1.1 is therefore demonstrated by tests that seed other scopes directly, not by production traffic.

**Default-deny changes retrieval for unscoped callers.** Once Phase 6 enables enforcement, a caller that declares no scope sees nothing rather than everything. That is intended (fail closed), but it is a behavior change for every existing MCP client, and it will need a migration note when Phase 6 ships.
