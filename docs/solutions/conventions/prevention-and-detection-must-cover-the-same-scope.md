---
title: "A preventer and a detector that cover different scopes leave the invariant unguarded"
date: 2026-08-25
category: conventions
module: planning
problem_type: convention
component: tooling
severity: high
applies_when:
  - "Building a guard in two halves — one that refuses the bad action, one that detects it after the fact"
  - "Writing a CI check whose local counterpart already refuses the same thing"
  - "A mechanism computes a broad set for one purpose and a narrow set for another in the same file"
  - "Claiming in a commit message or docblock that CI enforces an invariant"
symptoms:
  - "Each half of the guard passes its own tests, and the invariant it exists to protect is checked by nothing"
  - "Two branches allocated the same ST-002 and a full-ref clone running --check printed OK and exited 0"
  - "A script computed a cross-ref union and spent it on advisory notes while the hard check read one file"
  - "The mirror-image mismatch fails CI on legitimate work: an unmerged story read as an unallocated board entry"
resolution_type: code_fix
tags:
  - verification
  - guards
  - ci
  - scope-mismatch
  - red-green-control
  - allocator
related_components:
  - story-id.sh
  - tests/story-id.test.sh
  - .github/workflows/ci.yml
---

# A preventer and a detector that cover different scopes leave the invariant unguarded

## Context

ST-097 added `story-id.sh`, which allocates `ST-NNN` story identifiers from a registry
instead of deriving the next one from the story board. It was built as a pair, which is
the usual and correct shape for a guard:

- **prevent** — `--mint` refuses an identifier that is already allocated
- **detect** — `--check`, run in CI, catches whatever slipped past

Both halves were tested. Both passed. The invariant they exist to protect — *one
identifier, one allocation, repo-wide* — was checked by neither, and the allocator's own
commit message asserted that CI enforced it.

## Guidance

**State the invariant once, then confirm both halves cover the same scope.** Not "does
each half work" — each half worked. The question is whether their scopes *meet*.

In `story-id.sh` they did not:

- `--mint` scanned the union of every ref (`git for-each-ref refs/heads refs/remotes`),
  which is as wide as a local clone can see — and a clone that has not fetched sees
  nothing of a branch that minted an hour ago.
- `--check`'s duplicate test was `ids_in < "$REGISTRY" | sort | uniq -d` — a single
  file, the worktree registry. It never compared across refs.

The sharpest detail: the script **already computed** the cross-ref union in `--check`,
and spent it on *advisory gap notes*. The data the hard check needed was in a local
variable one screen away.

CI is the one place every branch is visible at once, so the detector belongs there and
must be the wider of the two. A preventer can only refuse what its own clone can see;
that is a property of where it runs, not a defect to fix in the preventer.

## Why This Matters

A duplicate identifier is not cosmetic in this repo. `git log --grep="Story: ST-NNN"` is
the only mechanism that makes a story's shipped work retrievable, because plans record no
progress. Two branches under one identifier resolve that grep to two unrelated stories,
permanently, and nothing reports it.

The failure is quiet in a specific way worth naming: **neither half is wrong on its own
terms.** A reviewer reading `--mint` sees a cross-ref scan and moves on. A reviewer
reading `--check` sees a duplicate test and moves on. The gap exists only between them,
which is exactly where nobody looks — and it is why the commit message could assert
enforcement in good faith while being false.

## When to Apply

- Any time a guard ships as refuse-plus-detect rather than as one mechanism.
- When a local tool and a CI job check "the same thing" — write down what each can *see*,
  not what each *does*.
- Before asserting in a commit message, docblock, or plan that CI enforces something.
  That sentence is a claim about scope, and it is testable.

## Examples

> The three SHAs below are **pre-squash branch SHAs on `docs/awcp-strategy-baseline`**
> and will not survive a squash-merge into `main`. After that merge, find this work
> with `git log --grep="Story: ST-097"` and re-anchor. Same convention, and same
> reason, as the verified-surface stamp in
> [docs/workflow-mvp.md](../../workflow-mvp.md).

**The false negative — the gap that let a real duplicate through.** Reproduced against
the allocator as first written (`cd219c2`):

```bash
# clone B BEFORE A mints, and never fetch
A: ./story-id.sh --mint "A's work"   # -> ST-002 on feat-a
B: ./story-id.sh --mint "B's work"   # -> ST-002 on feat-b, no refusal

# a full-ref clone, as CI has:
CI: ./story-id.sh --check
    registry: 1 allocations, ST-001..ST-001
    coverage: every board entry across 5 ref(s) is allocated
    OK                                    # exit 0
```

Both branches carried a different `ST-002` line. The fix (`b1adb32`) makes `--check` fail
when one identifier carries different identity columns on different refs.

**The false positive — the same mismatch, mirrored.** The coverage check in the same file
gathered `board_ids` across every ref but read `registry_ids` from the worktree alone. A
branch carrying both its allocation *and* its board entry — the ordinary state of any
unmerged story — therefore read as an unallocated board entry from `main`, which is where
CI runs `--check`. Fixed in `2225f23` by using the same union on both sides.

One file, one class of mistake, both directions: one let a real collision through, the
other would have failed CI on legitimate work.

**Compare identity, not bytes.** The duplicate key is `(id, date, branch)`, never the
whole line. Byte-equality was tried and was wrong: annotating an existing allocation is
ordinary, and `ST-095`'s line was annotated on the very branch that added the check, so a
strict comparison would have failed on its author's own work. Both directions are pinned
in `tests/story-id.test.sh` — a genuine two-branch collision fails and names both
claimants, and an annotation-only edit passes.

**Prove the test discriminates.** Reverting the coverage fix turns its regression test red
at exit 2. A guard never observed failing is not known to work — see
[a-control-that-fails-for-the-wrong-reason-is-not-a-control.md](a-control-that-fails-for-the-wrong-reason-is-not-a-control.md).

## Related

- [fix-the-assumption-not-the-symptom.md](fix-the-assumption-not-the-symptom.md) **Guidance
  #2 is the general rule this is a worked instance of** — *"the second place the same
  invariant is enforced... does the second copy compare everything the first one
  compares?"*, with pre-lock scan versus under-lock recheck as its own example. What this
  entry adds: the question is not only whether the second copy compares the same things but
  **what each half can see**, which is a property of where it runs rather than of what it
  does; that one root cause produces a mirrored pair, a false negative one way and a false
  positive the other; and that "CI enforces this" is a claim about scope, and testable.

- [verification-mechanisms-need-adversarial-review.md](verification-mechanisms-need-adversarial-review.md)
  — review the mechanism as hard as the code. This entry is the two-mechanism case: each
  survives that review alone, and the defect is in the seam.
- [a-control-that-fails-for-the-wrong-reason-is-not-a-control.md](a-control-that-fails-for-the-wrong-reason-is-not-a-control.md)
- [a-credential-format-gate-is-not-an-authorization-gate.md](a-credential-format-gate-is-not-an-authorization-gate.md)
  — the same shape in authorization: a check that filters membership is not one that
  proves authority.
