---
title: "A control that fails for the wrong reason is not a control"
date: 2026-08-20
category: conventions
module: server
problem_type: convention
component: testing_framework
severity: high
applies_when:
  - "Reverting a fix so its new test goes red, to prove the bug existed"
  - "Adding a test to a file you did not write, whose import list is not yours"
  - "Asserting on an operator-facing string a fix reworded — error text, exit-code message, CLI help"
  - "Running a suite twice to attribute a change in outcome to a branch"
  - "Declaring a change 'not test-bearing' because it only altered a message or log line"
symptoms:
  - "A control fails to COMPILE rather than to assert — `TS2459`, because reverting the fix also removed the function's export"
  - "A new test fails with `TS2304: Cannot find name 'assertStringIncludes'` — the symbol was never imported into that file"
  - "The obvious assertion on a reworded message passes identically before and after, because the old message already contained the value"
  - "A single stashed control run passes, causation is declared, and a later run on an intermittent subject falsifies it"
  - "Two fixes are declared 'not test-bearing'; discriminating assertions turn out to exist for both"
resolution_type: test_fix
tags:
  - testing
  - verification
  - red-green-control
  - discrimination
  - control-validity
  - assertion-design
related_components:
  - testing_framework
---


# A control that fails for the wrong reason is not a control

## Context

This repo's standing rule for a bug fix is: **write a test that proves the bug first,
watch it fail, then fix it.** The rule is sound and the vocabulary for it already
existed — `CONCEPTS.md` defines *Red/Green Control* (a companion
test written to prove another check is capable of failing at all), *Non-Vacuity Guard*
(assert the check inspected something, separately from what it found), and
*Discrimination* (the check produces different outcomes for the compliant and
non-compliant cases).

ST-092 ([PR #52](https://github.com/CAPeddle/ai-memory/pull/52), branch
`feat/st-092-node-client-hardening`, **open and unmerged at the time of writing**)
followed that rule across three fixes and one attempt to attribute a suite failure,
producing four episodes and three distinct ways of satisfying it while proving nothing.
In the three fix episodes a red was observed and accepted, and in two of them the red
was not evidence about the bug. The fourth had no red at all — a control run came back
green, and the green was accepted as evidence, which is the same error wearing the
opposite colour.

The gap was never the concept. `CONCEPTS.md:101-104` says Discrimination "is proven by
removing the thing under test and confirming the check goes red". As that sentence
stood when this session began, it constrained neither **how much** you remove nor
**what kind of red** counts, and both holes were walked through in the same session.
It has since been amended — see the note below — so a reader checking the entry today
will find the constraints already there.

## Guidance

**Before accepting a red as a control, write down the failure you expect — which
assertion, which observed value — then check the observed red against these five
conditions. A red that fails any of them is not yet a control.**

1. **The red must be an assertion failure, not a compile, import, or resolution
   error.** A `TS2459`/`TS2304`/`ModuleNotFound` red arrived *before* the assertion ran.
   It proves the module surface or the harness wiring, and says nothing about the
   behaviour under test.

2. **The revert must change only the behaviour under test.** If reverting to prove a
   bug also removes an `export`, renames a symbol, or changes a signature, the test
   stops compiling for a reason unrelated to the bug. Revert the logic; keep the
   surface.

   ```bash
   # After reverting, before running: confirm the revert touched only logic.
   git diff -- server/scripts/awcp-node-client.mjs
   # An `-export function` line in that diff means the next red will be a compile error.
   ```

3. **The old artifact must actually fail the assertion.** Do not reason about what the
   assertion "ought to" catch — run it against the pre-fix code. When the obvious
   assertion passes both ways, the discriminator is somewhere else, and it is usually
   an **absence** (`!message.includes(...)`) or a **newly added clause**, not the
   presence of something the old version already had.

4. **Assert the harness is wired.** An `assertStringIncludes` that is not in the file's
   import list from `https://deno.land/std@0.224.0/assert/mod.ts` reds out identically
   to a genuine failure at a glance in a long run log. Read the failure text, not the
   `FAILED` count.

5. **If the subject is timing-dependent, one run each way is not a comparison.** A
   single stashed-work control run against a flaky test is `n=1` on both arms. Either
   run enough repetitions to characterise the distribution, or read the cause out of
   the failure output and stop making causal claims from the timeline.

**And a sixth, which is about what you decide to test at all:** "not test-bearing"
is a claim that must be defended, not asserted. Error-message text an operator acts on
is behaviour — pointing them at the wrong directory to delete is a real defect. Before
writing "not test-bearing" in a verification record, spend one minute looking for a
discriminating assertion. In ST-092 both fixes declared non-test-bearing turned out to
have one.

### The `CONCEPTS.md` amendment this produced

The Discrimination entry now carries the two constraints this session showed it was
missing: *the removal must be minimal, touching only the behaviour under test, and the
resulting red must be an assertion failure on the specific claim.* A red produced
before the assertion executes demonstrates nothing about discrimination.

The same run added **Wrong-Reason Red** as a term, because none of the existing
verification entries named a control that errors before reaching its assertion. Both
edits are in the tree; this section records what changed rather than proposing it.

## Why This Matters

The failure mode is invisible in the artifact that records it. A verification record
that says "written first, observed failing, then fixed" is indistinguishable between a
valid control and an invalid one — both produce a `FAILED` line. The record therefore
launders a non-proof into evidence, and the next reader has no way to tell.

The cost compounds in three directions:

- **A non-discriminating assertion ships a test that will never fail again.** It sits
  in the suite forever, consuming runtime and inspiring confidence, while the behaviour
  it names is unguarded. `ST-092`'s corrupt-counter case is exact: asserting the message
  contains the configured home passes against the old code too, so the fix could have
  been reverted at any time with a green suite.
- **A compile-error red hides a real one.** If the leak had *not* existed, the
  whole-function revert would have produced exactly the same `TS2459`, and the test
  would have been declared proven either way.
- **An uncontrolled control writes a false causal claim into the permanent record.**
  In ST-092 a conclusion — "this branch's added tests expose the entity-worker failure"
  — was written into
  `docs/verification/ST-092-declared-test-identity-delta.md`
  on the strength of one passing stashed run, and was falsified by the next round. It
  had to be amended rather than rewritten, because the gap between the two readings is
  itself the finding.

What survived that episode is the part that was read from evidence rather than inferred
from a timeline: the `entity-worker-observability :: records errors when item processing
fails` test asserts `errors === 1` and observed `2` because it never clears
`entity_extraction_queue`, so retry-scheduled items from earlier tests are counted by
its run. That is a real, pre-existing isolation defect belonging to the entity-worker area, not to
ST-092.

**Status, updated 2026-08-21 — and the ambiguity is worth preserving rather than flattening.**
It is now **filed as ST-093** and still **unfixed**. The board entry lives on an unmerged
branch — `docs/st-093-entity-queue-isolation`, commit `f41980b` — so from any other checkout
that commit is unreachable and the branch name resolves to nothing. That is the situation
being described, not a broken citation: the claims validator flags both, correctly, and the
flag disappears when the branch merges. Whether it is "storied" depends on where you look: the board on an unmerged
branch has the entry, `.github/planning/story-board.md` on this branch does not, and
[the ST-092 delta doc](../../verification/ST-092-declared-test-identity-delta.md) says
"now filed as ST-093" without saying where. A reader following that link before the branch
merges hits a story number the board does not know. Round 4 of the same delta doc also
implicates a *second* test in this file — `creates worker_runs record and emits lifecycle
events`, on its `items_processed` assertion — so ST-093's scope is the file, not the one
test named above.

## When to Apply

Apply the five checks whenever you are about to claim a test proves a bug:

- Any time you revert a fix to watch its test go red.
- Any time the fix changes an operator-facing string — error text, exit-code message,
  log line, CLI help. These are the cases most likely to attract a "not test-bearing"
  dismissal, and the ones where the obvious assertion most often passes both ways.
- Any time you add a test to a file you did not write, where the import list is not
  yours.
- Any time you run a suite twice to attribute a change in outcome — especially a full
  suite, where subject tests may be order- or timing-sensitive.
- Any time a verification record will state "observed failing before the fix."

You can skip the ceremony when the assertion is over a pure function's return value and
the revert is a one-line logic change you can read in full — but that is exactly the
situation the `defaultSleep` case looked like, and it still went wrong.

## Examples

### Class 1 — the red arrived before the assertion ran

**Subject.** `defaultSleep` in
`server/scripts/awcp-node-client.mjs:132`
attached an `AbortSignal` "abort" listener with `{ once: true }`. `{ once: true }`
self-removes only when the event actually *fires*, and on the ordinary timer path abort
never fires — so `runAgent`'s single long-lived `AbortController` accumulated one dead
listener per heartbeat tick, plus a `MaxListenersExceededWarning` past ten. The fix
removes the listener on the timer path as well
(`awcp-node-client.mjs:147`, paired with the `addEventListener` at `:150`).

**Before — invalid control.** The whole fixed function was reverted. But the fix had
also added `export`, so the revert removed the export too:

```
TS2459 [ERROR]: Module '.../awcp-node-client.mjs' declares 'defaultSleep' locally,
but it is not exported.
```

That red proves the module surface. It says nothing about listener accounting, and it
would have appeared identically if there had been no leak.

**After — valid control.** Keep the `export`; revert only the listener logic. The test
then fails on its assertion: `removed` was `0` against an expected `10`.

The test itself is the other half of the move — a real `AbortSignal` exposes no
listener count, so
`server/tests/awcp-node-client.test.ts:2569-2596`
hand-rolls a fake and casts it (abridged — the source spreads the arrow bodies and the
final assertions over several lines each, and carries an explanatory comment this
rendering drops):

```ts
let added = 0;
let removed = 0;
const signal = {
  aborted: false,
  addEventListener: () => { added++; },
  removeEventListener: () => { removed++; },
};
for (let i = 0; i < 10; i++) {
  await defaultSleep(1, signal as unknown as AbortSignal);
}
assertEquals(added, 10, "each sleep must register exactly one abort listener");
assertEquals(removed, 10, "and each must remove it again when its timer completes normally");
```

Asserting the **pair** is what makes it a leak test rather than an "it still sleeps"
test.

**Same class, different surface.** Two other new tests in that session failed with
`TS2304: Cannot find name 'assertStringIncludes'` — the symbol simply was not in the
file's import list. Also a red before any assertion ran; also mistakable for a proof.
`assertStringIncludes` is now imported at
`server/tests/awcp-node-client.test.ts:32`.

### Class 2 — the obvious assertion does not discriminate

**Subject A: `allocateSeq`'s corrupt-counter refusal.** Before PR #52's round-2 fix the
message ended:

```
... Restore the counter to the highest client_seq this node has already sent,
or delete ~/.awcp/ to enrol as a new node.
```

and it now interpolates the configured home instead
(`awcp-node-client.mjs:701`, `` `...or delete ${config.home} to enrol as a new node.` ``).
An operator running with `AWCP_HOME` pointed elsewhere either deletes an unrelated
directory or finds nothing there and concludes the advice is wrong.

The **obvious** assertion — "the message contains the configured home" — passes against
the old code too, because the old message already interpolated `config.seqPath`
(`awcp-node-client.mjs:697`), which sits *under* that home. The only assertion that
separates old from new is the absence
(`server/tests/awcp-node-client.test.ts:2617-2621`):

```ts
assertStringIncludes(message, home);
assert(
  !message.includes("~/.awcp"),
  "the refusal must not name a home the client may not be using",
);
```

(Note: `~/.awcp` still appears elsewhere in the module — e.g. a docblock at
`awcp-node-client.mjs:41`. The fix removed it from the *error message*, not the file.)

**Subject B: `AwcpLockError`'s live-holder branch.** Same shape. Asserting the message
names the lock path passes both ways — the old message already read
`` `it is already running as pid ${holderPid} (lock: ${lockPath}).` ``. The fix appends
the pid-reuse recovery (`awcp-node-client.mjs:175-178`), and only that added sentence
discriminates
(`server/tests/awcp-node-client.test.ts:2644-2645`; the trailing comments below are
added here for contrast and are not in the source):

```ts
assertStringIncludes(message, config.lockPath);   // passes before AND after
assertStringIncludes(message, "remove that lock file"); // the discriminator
```

Both of these fixes were first declared **"not test-bearing"** on the grounds that they
only changed prose. Both had a discriminating assertion available. The phrase was doing
the work of "I don't want to write this test."

### Class 3 — the control run was itself uncontrolled

A full-suite test — `entity-worker-observability :: records errors when item processing
fails`, asserting `errors === 1`, observing `2` — started failing partway through the
story. To decide whether the branch caused it, **one** control full-suite run was made
with the work stashed at the pre-change commit. It passed. Causation was concluded and
written into the verification record.

A later run, with *more* tests added, showed the test passing again — the opposite of
what the causal story predicted. The runs recorded in the delta document's own table:

| Run | round-2 tests | round-3 tests | `records errors` |
|---|---|---|---|
| simplify pass | no | no | ok |
| round 2 (first) | yes | no | FAILED |
| round 2 (final) | yes | no | FAILED |
| control at pre-change commit | no | no | ok |
| round 3 | yes | yes | **ok** |

The subject is intermittent. One sample each way was noise dressed as a comparison.

**What to do instead** is visible in what survived: the real defect was read out of the
failure output, not inferred from the timeline. The run log showed
`[entityWorker] retryable failure (attempt 3/5, retry in 4s)` for an id the test never
created — the test never clears `entity_extraction_queue`, so retry-scheduled items
from earlier tests are processed by its run. That reading needed zero extra runs, and it
is the only part of the round-2 diagnosis that was still true in round 3.

## Related

- [Review the verification mechanism as adversarially as the code](verification-mechanisms-need-adversarial-review.md) —
  the sibling, and the closer of the two failure directions. That doc is about a check
  that goes **green when it should not**: a vacuous scan, a blocklist that permits by
  default, an assertion aimed at the branch where the hazard cannot occur. This doc is
  about a control that goes **red for a reason other than its subject** and is therefore
  read as proof. Its §3 already covers the non-discriminating-assertion case with a
  worked `FOR UPDATE` example, so treat that class as documented there and this doc as
  adding the wrong-reason-red, the uncontrolled control run, and the "not test-bearing"
  dismissal. The two overlap enough (problem statement and root cause, opposite polarity)
  that a future `ce-compound-refresh` should decide whether they are one doc.
- [Verification expires when the verified surface changes](../workflow-issues/verification-expires-when-the-verified-surface-changes.md) —
  adjacent rather than contradicted. Its Examples section makes the neighbouring point
  that a pass *count* noted beforehand is stale the moment new suites land, which is why
  `CONCEPTS.md` defines Baseline as a named set of expected failures rather than a total.
  Class 3 above adds the case that even a named failure set is not durable when a member
  of it is intermittent — so a Baseline is a claim about which tests fail, not a promise
  that each of them fails on every run.

  (An earlier draft of this bullet asserted that the doc's §4 claimed a failure set
  "stays true across every added test", and that the five-run table falsified it. That
  sentence is not in that file, and §4 is about rebase hygiene on a stacked branch. The
  fabrication was caught by this run's grounding validator and is recorded here rather
  than quietly deleted, because inventing a citation inside a document about verification
  rigour is exactly the failure the document is warning about.)
- [A documented inner-loop command can destroy real state](../workflow-issues/a-documented-inner-loop-command-can-destroy-real-state.md) —
  the positive example of the same idea: prove the guard fires *and* prove what it
  prevents.
- [Cross-AI review lane silent prompt loss](../workflow-issues/cross-ai-review-lane-silent-prompt-loss.md) —
  same family one level out: a signal produced by the wrong cause, where the lane's
  canary is the direct analogue of a control that must be shown capable of failing.
- `CONCEPTS.md` § Verification Practice — *Red/Green Control*, *Discrimination*, and
  *Non-Vacuity Guard* are the vocabulary this doc extends. None of them named a
  harness-level failure — a control that errors before its assertion runs — so this run
  added *Wrong-Reason Red* for it and tightened *Discrimination* with the two constraints
  above.
- Incident source: `docs/verification/ST-092-declared-test-identity-delta.md`, which
  narrates three of these four instances as they happened, including the amendment that
  had to be made when the causal claim in Class 3 was falsified.
