import type postgres from "npm:postgres@3.4.4";

import { sql as defaultSql } from "./db.ts";
import type { PolicyScope } from "../../shared/policyScope.ts";

/**
 * Run `fn` inside one transaction on one reserved connection, with the session GUC
 * `app.policy_scope` set to `scope` for that transaction only.
 *
 * RED stub (ST-082 / 05-02 Task 1): the transaction is opened but the scope is not
 * yet applied, so the spike's visibility assertions fail on the assertion itself.
 */
export async function withPolicyScope<T>(
  _scope: PolicyScope,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  client: postgres.Sql = defaultSql,
): Promise<T> {
  return await client.begin(async (tx) => {
    return await fn(tx);
  }) as T;
}
