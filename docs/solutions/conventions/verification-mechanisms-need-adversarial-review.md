---
title: "Review the verification mechanism as adversarially as the code — especially when the deliverable is evidence"
date: 2026-07-30
last_updated: 2026-07-31
category: conventions
module: server
problem_type: convention
component: testing_framework
severity: high
applies_when:
  - "Building a spike or investigation whose deliverable is a verdict rather than shipped code"
  - "Writing a test that scans source, config, or schema and asserts an absence"
  - "Writing a boundary, allow/deny, or lint-style check over a surface that grows"
  - "Writing a docblock that asserts a concurrency, isolation, ordering, or atomicity invariant"
  - "Building fixtures where a domain-significant field takes the same value in every test"
symptoms:
  - "A green suite coexists with real defects, four of which review found in code that already had 37 passing tests"
  - "A blocklist-based boundary test omitted the composition root, so importing it would still have passed"
  - "A case-sensitive regex scan silently skipped lowercase `from thoughts` — the exact style it existed to catch"
  - "An isolation experiment asserted `search_path` pollution while exercising the one branch where the hazard is impossible"
  - "A docblock claimed FOR UPDATE prevented completion with unmet criteria; the lock never covered the rows the transaction reads"
resolution_type: test_fix
tags:
  - testing
  - verification
  - allowlist-vs-blocklist
  - boundary-tests
  - red-green-control
  - static-analysis
  - test-fixtures
  - spike-review
related_components:
  - server/tests/workflow-boundary.test.ts
  - server/tests/workflow-failure-isolation.test.ts
  - server/src/workflow/store.ts
  - server/src/workflow/service.ts
---

# Review the verification mechanism as adversarially as the code — especially when the deliverable is evidence

## Context

The ST-084 architecture spike ([PR #34](https://github.com/CAPeddle/ai-memory/pull/34),
branch `claude/st-084-awcp-host-spike`) built a workflow-operations module under
`server/src/workflow/` whose entire purpose was to produce a verdict: can operational
state live in the same Postgres instance as the memory domain without coupling the two?
The answer was carried by the test suite.

[§14 of the spike findings](../../investigations/ST-084-awcp-host-spike-findings.md)
records that the suite had **37 passing tests**, and that seven independent review lenses
then found **four P1 defects** in that green code, plus three claims that were false in
comments while the tests passed. Sorting those seven findings by *where they lived* is
the useful cut:

| Where the finding lived | Findings | Count |
|---|---|---|
| **In the verification layer itself** | import blocklist omitted the composition root; schema-qualification regex was case-sensitive; failure-isolation "experiment 3" asserted the one branch where the hazard is impossible; `completePacket` docblock asserted an invariant the code does not provide | 4 |
| **In production, but structurally invisible to the tests as designed** | promotion hardcoded `policyScope: "personal"` (every fixture used the same scope); `promoted: false` returned when the projection had succeeded but its ref failed to record (nothing failed `attachPromotionRef` independently of the port) | 2 |
| **Process** | the plan carried no `story:` frontmatter | 1 |

So four of the seven findings were defects *in* the verification mechanism, and two more
were production defects the test design was structurally incapable of surfacing. §14
states the conclusion directly: the tests "were not merely incomplete — several
*certified claims they could not actually check*."

**Read "seven" as a denominator with care** — it is §14's count (four P1s plus three false
comment claims), not everything the review produced. §13a of the same document disposes of
further architectural findings the PO required fixed before submission, and one of them
belongs in the second row above: a packet with zero required criteria was completable by the
gate yet never surfaced as ready-for-review, so the gate and the attention queue disagreed
about the same packet while 37 tests stayed green.

**Do not chase a precise ratio here — it moved in both directions and will move again.**
Two further review rounds landed after this doc was written, roughly doubling §13a's
dispositioned findings; but the numerator grew too, because two of the new findings were
themselves verification-layer defects (two concurrency tests that could not discriminate the
property they were written for, and two controls that only ran on a developer machine). The
durable claim is qualitative and unchanged: **a substantial share of what review found was
in the verification layer, not in the production code it was certifying.** (§13a's own prose
says "three architectural findings" above a four-row table — a miscount worth knowing before
you recount from it.)

The author wrote both the code and the tests that certified it, and reviewed the diff
before the review ran. All four P1s survived that.

**The blind spot appears to be reproducible, not incidental.** The following comes from
reading this project's prior agent session transcripts rather than from anything in the
tree, so treat it as a strong signal rather than a verified fact: five earlier review
passes over this same diff had both defective test files in scope and read them in full,
and all five cleared them. Two of those passes opened by observing that only tests import
`server/src/workflow/*` — no HTTP handler, MCP tool, CLI, or webhook reaches those
functions — and scored the absence of production wiring as a risk *reducer*.

That framing inverts the actual risk: when tests are the only caller, the test **is** the
entire behavioural contract. On the same reading, the test files were audited as a possible
injection source and cleared the moment they could not be an attack vector; whether an
assertion actually exercised the property it named was never a question those lenses asked.

**A note on the citations that follow.** The habits are the durable part; the code they
point at is not. The citations resolve on branch `claude/st-084-awcp-host-spike` only — PR
#34 was open against a feature branch rather than `main`, and the module itself is stamped
`SPIKE / DISPOSABLE`. If the spike is disposed of, read them as historical illustration;
nothing in the guidance depends on that code still existing.

**Line numbers drift from ordinary review churn, not just from disposal — this doc learned
that the hard way.** Two further review rounds on the same open PR moved roughly nine of its
original `file:line` citations and falsified two of its worked examples, without the branch
ever being rebased or the spike abandoned. Citations below now name **test names, functions,
and files** in preference to line numbers, because those survive a round of review and line
numbers do not. Re-verify after each round rather than at merge.

## Guidance

### 1. Prefer allowlists to blocklists for any boundary check

A blocklist cannot distinguish "not yet enumerated" from "permitted." Over a directory
that grows, that means every future module is allowed by default.

The boundary test's own comment on `ALLOWED_IMPORTS` (`server/tests/workflow-boundary.test.ts`) records
what the earlier form was and why it was wrong: a blocklist of eight known memory modules
that omitted `../index.ts` — the composition root that registers every MCP tool — so the
workflow module could have imported straight from it and the test would still have passed
green.

```ts
// Wrong — a blocklist over a growing directory
const FORBIDDEN = ["../entityWorker.ts", "../searchQuality.ts", /* ...six more */];
assert(!FORBIDDEN.includes(spec));

// Right — an allowlist; anything not named here fails
const ALLOWED_IMPORTS = ["../db.ts", "../logging.ts"];
assert(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec));
```

Adding a dependency is now a deliberate, reviewable edit to `ALLOWED_IMPORTS`
(the `ALLOWED_IMPORTS` array in `server/tests/workflow-boundary.test.ts`) rather than a silent omission from a
list nobody rereads.

### 2. Give every check two proofs: non-vacuity *and* discrimination

These are different properties and they fail independently.

**Non-vacuity** — the check saw input at all. A scan whose regex silently matched nothing
looks exactly like a scan that found no violations.

```ts
assert(checked > 0, "expected to inspect at least one import specifier");
```

**Discrimination** — the predicate actually rejects known-bad input. This is the one the
case-sensitive regex passed vacuity on and still failed: it saw plenty of SQL, and
silently skipped every lowercase `from thoughts` because it had no `/i` flag. The fix was
`/gi`, and the control that would have caught it mechanically now lives beside it in test
`boundary: the schema-qualification scan catches lowercase and unqualified SQL`:

```ts
assertEquals(scan("SELECT * FROM thoughts"), ["thoughts"], "uppercase, unqualified");
assertEquals(scan("select * from thoughts"), ["thoughts"], "lowercase, unqualified");
assertEquals(scan("INSERT INTO public.thoughts"), ["public.thoughts"], "wrong schema");
```

The allowlist has a matching control in `boundary: the allowlist itself rejects a
memory-domain import`, asserting both directions — that `../index.ts` is rejected *and*
that `./types.ts`, `../db.ts` and `npm:` specifiers are still permitted, "or it would be
uselessly strict."

Write the control in the same file as the check. It is the cheapest test in the suite and
it is the only thing standing between a green scan and a scan that does nothing.

### 3. A comment asserting an invariant is a claim that needs a test or a correction

`completePacket` in `server/src/workflow/store.ts` originally carried a docblock asserting
that `SELECT ... FOR UPDATE` prevented completion with unmet criteria. The lock covers the
`work_packets` row. It does not cover the `verification_criteria` or `evidence_items` rows
the same transaction reads, and under READ COMMITTED those re-snapshot per statement.

The docblock has since been corrected twice, and it now says so itself — which is the part
worth copying (`server/src/workflow/store.ts`, `completePacket`):

> **What the locking actually guarantees — stated precisely, because two earlier versions
> of this comment got it wrong in different ways.** `FOR UPDATE` locks the one
> `work_packets` row. It does **not** lock `verification_criteria` or `evidence_items` …
> The criterion-insert window is nevertheless **closed**, not by this lock alone but
> because `addCriterion` now takes the *same* row lock and refuses once the packet is
> complete.

**What happened between those two versions is a sharper lesson than the original claim.**
Two concurrency tests were added to cash the prose claim — green, on-topic, and written
specifically for it. *They still could not discriminate the lock.* Deleting `FOR UPDATE`
from `completePacket` left them both passing, because the `UPDATE` that follows takes the
same row lock and blocks on its own. Verified by deletion on 2026-07-30.

So: **a test can be green, on-topic, purpose-written to cash a claim, and still not be
evidence for it.** No test of that shape could have been, because no observable behaviour
distinguished the two variants. The property was untestable until something else contended
for the same row — which only happened once `addCriterion` started taking that lock too.
Only then did a real control become possible: `concurrency: completion cannot miss a
criterion inserted while it waits (FOR UPDATE control)` in
`server/tests/workflow-failure-isolation.test.ts` holds the row, starts `completePacket`,
inserts a required criterion from the lock-holding connection, and turns on *where*
completion blocks. Delete `FOR UPDATE` and it goes red.

Note the sequence, because it is the whole point: there was no earlier test to tighten.
The invariant had only ever been asserted in prose, so this was never a loose test being
narrowed — it was an unbacked claim that took two attempts to cash.

(The SERIALIZABLE caveat did not disappear; it moved. It now attaches to a *different*
residual — a concurrent evidence DELETE, which is a different writer on a different table
that the packet lock genuinely does not cover.)

Prose is not enforcement. Write the test, narrow the claim, or record the gap as a
residual risk — all three are fine. Silently overclaiming is not.

### 4. Fixture monoculture hides defects — and varying the fixture is only half the fix

Promotion hardcoded `policyScope: "personal"` instead of reading the packet's real scope.
Every test fixture created personal-scoped packets, so the hardcode was indistinguishable
from correct behaviour.

Fixing this took two changes, not one. Vary the input **and** assert on the value crossing
the boundary — a spy on the port, not just an absence of errors. The test `promotion
carries the packet's REAL policy scope, not a hardcoded default` loops all four scopes and
asserts against `NoopMemoryAdapter.promotionCalls` (`server/src/workflow/ports.ts`):

```ts
for (const scope of ["corporate", "mixed", "public", "personal"] as const) {
  // ...create a packet with this scope, resolve a decision through the port...
  assertEquals(noop.promotionCalls[0].policyScope, scope,
    `promotion must forward the packet's ${scope} scope, never a default`);
}
```

Varying the fixture alone would have proved nothing here: without the spy, all four scopes
still promote successfully. The observation point has to sit where the value actually
crosses.

The strongest version of this fix was not a test at all. `PromotionInput.policyScope`
(`PromotionInput.policyScope` in `server/src/workflow/ports.ts`) was narrowed from `string` to the closed
`PolicyScope` union (`server/src/workflow/types.ts`), backed by a database `CHECK`
constraint on `policy_scope` (`server/db/workflow/001_workflow_schema.sql`) — so a future regression
fails at compile time or at the write, neither of which can be silently green.
**Where a constraint can replace an assertion, prefer the constraint.**

**Positive example of fixture design:** `baseInput()` in
`baseInput()` in `server/tests/workflow-attention.test.ts` deliberately seeds one *unsatisfied*
required criterion, so the baseline packet is not already in its terminal state and each
test observes only the rule it exercises. The zero-criteria case gets its own dedicated
test rather than riding the default. A default that already sits at the interesting
boundary hides every rule that would move it there.

### 5. A control that runs on one machine controls nothing

Added after two further review rounds, because it is the same failure one level out: a
check that cannot fire in the environment that gates merge is not a check.

Two of this file's own controls wrote fixture files. CI runs `deno test` with no
`--allow-write` (`.github/workflows/ci.yml`), so both threw `NotCapable` there while passing
locally — green where it was cheap, absent where it mattered. The enumeration control was
rebuilt to need no writes at all: it points the same enumeration function at a *different
real directory* and requires that directory's contents back, which proves the function reads
what it is handed rather than carrying a hardcoded list. The typed-failure test moved to the
migrations suite, where it drives the real runner instead of a hand-rolled transaction.

The check on a check: **would this run, unchanged, in CI?** Permissions, network, database
availability, and writable paths all differ there. A control that silently no-ops in the one
environment that gates merge is worse than no control, because its name still appears in the
passing list.

A near neighbour worth the same suspicion: **a test that cannot re-establish its own
precondition.** If a test's setup is destroyed the first time it succeeds — because it wrote
to shared state it also reads — it passes once and then silently tests nothing forever.

### 6. When the deliverable is evidence, the verification mechanism is the product

For a spike, the output is not code that ships — it is an architectural verdict, and the
green suite is the artifact being trusted. That inverts the usual review priority: the
tests deserve the adversarial pass normally reserved for production code, because a defect
in the tests silently changes the verdict while a defect in a disposable module does not.

## Why This Matters

Every one of these defects presented as a passing test. That is a distinct failure mode
from missing coverage: a missing test is visibly absent, whereas a check that certifies
what it cannot evaluate is worse than no check at all, because the suite's green condition
becomes evidence for a conclusion nothing supports. Review effort then goes to the
production diff, since the test file "already passes."

The blast radius scales with how much the check is trusted. The hardcoded
`policyScope: "personal"` widened a security boundary — corporate, mixed, and public
decisions projected into the memory domain labelled personal — and it did so while a
`workflow-boundary.test.ts` suite specifically about domain boundaries was green. A
boundary test that permits the composition root is worse than no boundary test, because
the next author reads it and concludes the boundary is enforced.

Cost asymmetry: a red/green control is roughly ten lines with no fixtures and no database.
`workflow-boundary.test.ts` now carries four of them — over the import allowlist, the
import-form scanner, the directory enumeration, and the schema-qualification scan — and
they would have caught several of these findings mechanically, at review time, without a
reviewer needing to notice anything.

## When to Apply

- **Any spike or investigation whose deliverable is a verdict rather than shipped code.**
  Budget review time for the tests, not just the module.
- **Any test that scans source, config, or schema and asserts an absence.** Every
  absence-assertion needs a non-vacuity guard and a discrimination control.
- **Any boundary, allow/deny, or lint-style check over a surface that grows.** Invert it to
  an allowlist before it silently weakens.
- **Any docblock that asserts a concurrency, isolation, ordering, or atomicity invariant.**
  Either it has a test scoped to exactly what it claims, or the claim gets narrowed.
- **Any suite where a domain-significant field takes the same value in every fixture.** That
  field is untested; vary it and assert on it where it crosses a boundary.
- **When "no production code calls this yet" shows up in a review.** That is a reason to
  audit the tests harder, not to relax — the test is the whole contract.
- When the author of the code also wrote the tests that certify it — which for agent-written
  work is essentially always.

## Examples

### Blocklist → allowlist, with the control that proves it fires

```ts
// Wrong — silently permits ../index.ts and every module added tomorrow
const FORBIDDEN = ["../entityWorker.ts", "../searchQuality.ts", "../embeddings.ts" /* ... */];
for (const spec of imports) assert(!FORBIDDEN.includes(spec));

// Right — fails closed, plus a control proving the predicate rejects known-bad input
const ALLOWED_IMPORTS = ["../db.ts", "../logging.ts"];
for (const spec of imports) {
  checked++;
  assert(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec));
}
assert(checked > 0, "expected to inspect at least one import specifier");

// ...and separately, the control:
for (const spec of ["../index.ts", "../entityWorker.ts", "../../index.ts"]) {
  assert(!(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec)));
}
for (const spec of ["./types.ts", "../db.ts", "npm:postgres@3.4.4"]) {
  assert(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec));
}
```

Live in `server/tests/workflow-boundary.test.ts`.

### A scan that ignored the style it existed to catch

```ts
// Wrong — no /i, so `from thoughts` in lowercase is skipped in silence
[...code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/g)]

// Right
[...code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi)]
```

One flag. It passed a non-vacuity guard the whole time — the scan *was* matching uppercase
SQL — which is precisely why only a discrimination control catches it.

### A test that asserted the branch where the hazard cannot occur

The original "experiment 3" ran a **failing** Apache AGE query and asserted the pooled
connection was left with a polluted `search_path`. A failed statement rolls its `SET` back,
so that branch cannot pollute; the test exercised the one case where the hazard is
impossible while claiming to demonstrate it. The hazard itself is covered in
[Always schema-qualify SQL — AGE leaves a sticky `search_path` on pooled connections](./schema-qualify-sql-age-search-path-pollution.md);
what matters here is the *shape* of the fix. One test making an unprovable claim became
three, each proving one thing (all in `server/tests/workflow-failure-isolation.test.ts`):

- **3a** — a failed statement rolls its `SET` back. The corrected version of the original
  claim.
- **3b** — genuine pollution via `sql.reserve()`, then the paired assertion that makes it
  mean something: the qualified query resolves **and** the unqualified one fails. Without
  the second half, the path might simply have contained `workflow` anyway.
- **3c** — the isolation claim, stated honestly: the workflow module issues no Cypher, so
  an AGE outage is invisible to it. Explicitly *not* a `search_path` test.

Note what made the original untestable-as-written: pollution is only observable on a
*pooled*, *multi-statement*, *succeeding* path. A test that gets any one of those three
conditions wrong is structurally incapable of failing.

### Residual: the fix went one level deep, not two — now closed

This section originally recorded a live residual: the hardened import predicate ran over a
hardcoded six-name `WORKFLOW_FILES` array, so the *import* check failed closed while the
*file list* it iterated still failed open — a new file in `server/src/workflow/` was never
scanned and no test noticed.

That is closed. `readTsSources` in `server/tests/workflow-boundary.test.ts` enumerates the
directory and throws if it finds nothing, with a control that points the same function at a
different real directory and requires its contents back.

The general rule it illustrates — **ask what the check iterates over, not just what it
asserts** — generalised beyond verification mechanisms and now lives in its own learning:
[Fix the assumption, not the symptom](./fix-the-assumption-not-the-symptom.md) (Guidance #3
and Instance 4). That doc treats this residual as one of four instances of a fix landing at
the reported site while the same assumption survived one branch over.

## Related

- [Explicit test requirements in plans](../workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md)
  — the **plan-time** control for the same symptom: specify up front what each test must
  assert, so vague plans stop producing vague tests. This doc is the **review-time**
  control: audit whether the check, as written, is even capable of failing. Neither
  substitutes for the other — ST-084's blocklist was a well-specified assertion target that
  still decayed silently. That doc's rule #5 ("Use semantic regex patterns over exact
  prose.") now carries a caveat pointing back here, because a pattern-based check over a
  growing surface is the blocklist hazard in another costume.
- [Always schema-qualify SQL — AGE leaves a sticky `search_path` on pooled connections](./schema-qualify-sql-age-search-path-pollution.md)
  — the SQL convention from this same spike. The two docs share one incident from opposite
  ends: that doc records the `search_path` hazard; this one records why the test certifying
  it could not have detected it.
- [Verify claimed work before rebuilding](../workflow-issues/verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md)
  — the same maxim aimed at handoff narratives rather than code: a written claim about state
  is a hypothesis to test, not a fact to act on. Habit #3 above is that principle pointed at
  source comments.
- `.github/instructions/coding-standards.instructions.md` already mandates red-green TDD,
  but scoped to *production behaviour*. Habit #2 extends the same discipline to the check
  itself. The "Deno / Server Testing" section (lines 125-136) governs test *hygiene* —
  isolation, cleanup, flakiness — and never test *validity*: a test can satisfy every rule
  there and still certify a claim it cannot check.
- [ST-084 spike findings §14](../../investigations/ST-084-awcp-host-spike-findings.md) — the
  incident write-up this learning was extracted from, including the full defect table.
