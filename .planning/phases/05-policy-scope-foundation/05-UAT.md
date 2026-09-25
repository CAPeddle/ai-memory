---
status: testing
phase: 05-policy-scope-foundation
source: [05-VERIFICATION.md]
started: 2026-09-25T22:04:47Z
updated: 2026-09-25T22:04:47Z
---

## Current Test

number: 1
name: SC #2 spike realism — accept spike against real thoughts table/pool/helper (not via list_thoughts) as satisfying "one real query path"
expected: |
  PO either accepts this reading (override snippet in 05-VERIFICATION.md) or requires a spike case through a real handler before Phase 6.
awaiting: user response

## Tests

### 1. SC #2 spike realism (D-04 names list_thoughts; spike did not route through it)
expected: PO accepts via override, or requires a handler-level spike case before Phase 6.
result: [pending]

### 2. Prohibition (05-01): no table-level DEFAULT for the interim policy_scope value
expected: Confirm held (judge verdict: HELD).
result: [pending]

### 3. Prohibition (05-02): ADR-018 is an authored deliverable, not a spike by-product
expected: Confirm held (judge verdict: HELD).
result: [pending]

### 4. Prohibition (05-02): ADR-018 does not claim enforcement is live
expected: Confirm held (judge verdict: HELD — "not yet enabled", deferred to Phase 6).
result: [pending]

### 5. Production pre-migration count before 007 deploys
expected: Run total/personal_tagged/work_tagged count against any real DB before 007 reaches it; if personal_tagged > 0, accept D-02 reclassification to corporate or reopen D-02.
result: [pending]

### 6. ADR-018 status
expected: PO deliberately sets status (currently proposed) — accept, or keep proposed with rationale.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
