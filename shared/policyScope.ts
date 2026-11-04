import { z } from "zod";

/**
 * Closed policy-scope vocabulary (ST-082 / v1.1 Policy-Scope Isolation, POLICY-01).
 *
 * Mirrors the CHECK list on public.thoughts.policy_scope (server/db/007_policy_scope.sql)
 * and workflow.work_packets.policy_scope. A scope is exactly one of these four values:
 * matching is exact, with no case-folding, trimming, or list splitting.
 */
export const POLICY_SCOPES = ["personal", "corporate", "mixed", "public"] as const;

export type PolicyScope = typeof POLICY_SCOPES[number];

export function isPolicyScope(value: string): value is PolicyScope {
  return (POLICY_SCOPES as readonly string[]).includes(value);
}

export const PolicyScopeSchema = z.enum(POLICY_SCOPES);
