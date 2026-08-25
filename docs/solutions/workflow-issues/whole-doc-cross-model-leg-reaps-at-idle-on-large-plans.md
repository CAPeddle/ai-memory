---
title: The whole-doc cross-model review leg reaps at 480s output-idle on large plans — twice running
date: 2026-08-24
category: workflow-issues
module: review-workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Running ce-doc-review on a plan large enough to activate the cross-model judgment pass"
  - "Reading a review's Coverage line and deciding how much cross-model corroboration it actually has"
  - "Promoting a finding on the strength of cross-model agreement"
symptoms:
  - "Three lens-scoped peer artifacts land; whole-doc-<provider>.json never appears"
  - "The job reports state 'done' while no fold-in artifact exists"
  - "out.log shows 'peer alive (421s elapsed)' then 'codex output idle 480s; reaping peer process group'"
  - "The runner's terminal state is 'done', so a caller checking job state rather than artifact presence records a success"
root_cause: "The trio legs receive a reviewer-specific slice; the whole-doc leg is contractually sent the FULL document and is the only leg whose size scales with the artifact, so it is the first and often only leg to exceed the 480s output-idle guard."
tags:
  - ce-doc-review
  - cross-model
  - codex
  - review
  - coverage
  - subagent
related_components:
  - .claude/plugins/cache/compound-engineering-plugin/.../skills/ce-doc-review/references/cross-model-review.md
---

# The whole-doc cross-model leg fails on exactly the documents that most need it

## Observed, twice

`ce-doc-review`'s cross-model pass launches one leg per activated judgment lens plus **one
`whole-doc` sweep** — a broad different-model read of the entire artifact, the only leg with no
in-process twin.

On two consecutive rounds against the same large plan (ST-097, ~630 and ~850 lines), through
`codex` / `gpt-5.6-luna`:

```
[cross-model-doc] peer alive (421s elapsed)
[cross-model-doc] peer alive (481s elapsed)
[cross-model-doc] codex output idle 480s; reaping peer process group
[cross-model-doc] peer exited non-zero or timed out
[cross-model-doc] provider codex produced no usable schema-shaped output; skipping fold-in
```

The three trio legs (`adversarial`, `product-lens`, `security-lens`) returned in 180–420 s on the
same route, in the same wave, with `independence_verified: true`. Only `whole-doc` died — both
times.

## Why it is structural, not luck

The reference draws the distinction itself: **trio peers are sliced, the whole-doc sweep is not.**

> *"On unified artifacts, pass each activated trio lens the same reviewer-specific slice its
> in-process twin got … also launch one call with reviewer-name `whole-doc`, the full document
> (never sliced)."*

So `whole-doc` is the only leg whose input size scales with the artifact. On a large plan it is
reliably the first to exceed the 480 s output-idle guard — and because the guard measures *output
idleness*, a model reasoning for a long time before emitting its first schema-shaped token is
indistinguishable from a hung one.

**The coverage lost is the coverage the pass exists for.** Each trio lens still has its in-process
twin, so a trio failure costs corroboration. `whole-doc` has no twin: when it dies, the broad
different-model read of the whole document did not happen at all. The larger and more consequential
the plan, the more certain that loss becomes.

## The trap in the job state

The runner reported the job's terminal state as **`done`**. `done` means only that the worker
exited — the reference says so explicitly:

> *"Omit `--result-path`; `done` means only that the worker exited."*

**So check for the artifact, not the state.** A caller that polls job state and sees `done` across
all four legs will record a complete pass while one third of the fold-in files are missing.

## What to do

1. **Name the loss in Coverage.** Silent absence is correct only for a pass that never started. A
   started-and-reaped leg gets named with its terminal state — otherwise the review reads as having
   whole-document cross-model coverage it does not have.
2. **Do not promote findings on cross-model agreement that only the trio legs produced.** Their
   agreement is real and independence-verified, but it is lens-scoped: nothing checked the document
   as a whole.
3. **Raise `CROSS_MODEL_HARD_SECS` before assuming the route is broken.** The idle guard is the
   binding constraint here, not the hard backstop; the peer was still alive at 481 s.
4. **Consider slicing the sweep** on artifacts past roughly 600 lines — two half-document legs
   would preserve the no-twin breadth property while staying inside the guard. This is the change
   most likely to actually fix it; the ones above only stop it lying.

## The reusable shape

A parallel fan-out where **one leg's input scales with the subject and the others' do not** will
fail asymmetrically, and it will fail on the largest subjects — which are the ones where the missing
coverage matters most. Where that leg is also the only one without a fallback, its failure must be
reported rather than absorbed.

## Related

- `CONCEPTS.md` — **Dropped Lane**: *"an empty return, which after a long run means the Lane was
  killed rather than that it crashed … a review that quietly proceeds with fewer Lanes than it
  reports is the failure this term exists to name."* This is that condition, reproduced.
- `docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md` — the same
  class: a green-looking result that never exercised what it claimed to.
