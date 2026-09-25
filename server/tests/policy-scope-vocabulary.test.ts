import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { isPolicyScope, POLICY_SCOPES, PolicyScopeSchema } from "../../shared/policyScope.ts";

// Near-misses that must NOT be accepted as a policy scope.
const NEAR_MISSES = [
  "professional", // the retired ADR-012 binary-profile value, not part of this vocabulary
  "PERSONAL", // case sensitivity
  "personal ", // trailing whitespace
  "", // empty string
  "public,personal", // comma-joined: a scope is a single value, not a tag list
  "mixed_scope", // partial match
];

Deno.test("policy scope vocabulary: accepts exactly the four closed values", () => {
  assertEquals([...POLICY_SCOPES], ["personal", "corporate", "mixed", "public"]);
  for (const value of POLICY_SCOPES) {
    assertEquals(isPolicyScope(value), true, `expected "${value}" to be a policy scope`);
  }
});

Deno.test("policy scope vocabulary: rejects near-miss values", () => {
  for (const value of NEAR_MISSES) {
    assertEquals(isPolicyScope(value), false, `expected "${value}" to be rejected`);
  }
});

Deno.test("policy scope vocabulary: the Zod schema and the type guard never disagree", () => {
  for (const value of [...POLICY_SCOPES, ...NEAR_MISSES]) {
    assertEquals(
      PolicyScopeSchema.safeParse(value).success,
      isPolicyScope(value),
      `schema and guard disagree on "${value}"`,
    );
  }
});
