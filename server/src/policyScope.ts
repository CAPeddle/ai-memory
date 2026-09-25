import type postgres from "npm:postgres@3.4.4";

import { sql as defaultSql } from "./db.ts";
import type { PolicyScope } from "../../shared/policyScope.ts";

/**
 * Run `fn` inside one transaction on one reserved connection, with the session GUC
 * `app.policy_scope` set to `scope` for that transaction only (ST-082, DECISION-01;
 * see docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md).
 *
 * - `set_config(name, value, true)` is used rather than a templated `SET LOCAL`:
 *   `SET`/`SET LOCAL` cannot take a bind parameter under the extended query protocol
 *   postgres.js's tagged templates always use, and a bare `SET` would leak the value
 *   across the pool (the AGE `search_path` bug documented in
 *   server/db/workflow/001_workflow_schema.sql).
 * - `is_local = true` makes Postgres revert the setting at COMMIT/ROLLBACK, before the
 *   pool can hand the connection to another request. The reverted value is `''`, not
 *   NULL, so any policy predicate must guard with an allow-list, not `IS NOT NULL`.
 * - `client` defaults to the application pool; it exists so a test can inject a
 *   differently-authenticated connection (the app role is a superuser, which RLS
 *   never filters).
 *
 * NOT WIRED: no production tool handler or worker calls this yet. Phase 6 wires the
 * retrieval paths onto it and only then enables row-level security for real.
 */
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
