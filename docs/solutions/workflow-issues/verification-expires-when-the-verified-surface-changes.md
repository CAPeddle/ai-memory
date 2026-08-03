---
title: A verification result expires when the verified surface changes — including when someone else changes it
date: 2026-08-03
category: workflow-issues
module: testing-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Closing an acceptance criterion with a manual or point-in-time run rather than an automated test"
  - "Working on a branch stacked on another feature branch that a reviewer or another agent may still change"
  - "Rebasing onto an updated parent branch before opening a PR that claims a prior verification"
  - "Recording an N/N passed verification result in a plan, board entry, story board, or handoff"
  - "Relying on CI as a backstop when the workflow triggers only on pushes and PRs targeting main"
symptoms:
  - "A recorded 28/28 verified claim silently describes code that no longer exists"
  - "A reviewer reimplements the exact code path a manual verification covered, while the result sits recorded in three places"
  - "No CI runs at all on a stacked PR, because the workflow triggers only on main"
  - "The stale claim surfaces only as a rebase merge conflict in the same block — textual adjacency, not process"
  - "A re-verification rule written in the second person, so a change by another author never trips it"
related_components:
  - "testing_framework"
  - "tooling"
  - "documentation"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - "manual-verification"
  - "stacked-branches"
  - "rebase"
  - "ci-coverage"
  - "verification-expiry"
  - "evidence-provenance"
---

# A verification result expires when the verified surface changes — including when someone else changes it

> **This is a near-miss, not a live defect.** The stale claim was caught before the PR
> opened, and re-verification passed against the shipped code. Because the re-run and the
> last `dashboard.ts` change landed in the same squashed commit ([PR #40](https://github.com/CAPeddle/ai-memory/pull/40)),
> the record in this tree is *currently* accurate. What follows is a demonstrated
> structural hazard, documented while the evidence is re-derivable — not a bug to go fix.

## Context

ST-086's sixth acceptance criterion ([`.github/planning/story-board.md:545`](../../../.github/planning/story-board.md))
required that `/workflow` show active work, attention grouped by reason, decisions,
checkpoints and criteria/evidence, and offer exactly resolve / attach-evidence / complete.

That criterion had no automated proof of *rendering*, deliberately: there is no browser in
the test container, so the process-boundary test can only assert the served asset. The gap
was closed by hand — the page driven in a real headless Chromium, 28/28 behavioural checks
— and the result recorded in three places, each honest about being point-in-time:

| Record | What it says |
|---|---|
| [`.github/planning/story-board.md:545`](../../../.github/planning/story-board.md) | "on 2026-08-02 the page was driven in a real headless Chromium, 28/28 checks … a point-in-time manual check to repeat when `dashboard.ts` changes" |
| [`docs/workflow-mvp.md:113`](../../workflow-mvp.md) | "Re-run that by hand if you change `dashboard.ts`." |
| `server/tests/workflow-mvp-e2e.test.ts` (dashboard step) | "a point-in-time result, not a standing guarantee: re-run it when dashboard.ts changes" |

**All three anchor the result to a date. None names a commit.** That is the defect, and it
is mechanical rather than a matter of diligence: a date cannot be diffed, so no reader —
human or agent — can ask the tree whether the verified surface has moved since.

The project already has a word for what these three records are:
**Point-in-Time Result** ([`CONCEPTS.md`](../../../CONCEPTS.md), Verification Practice) —
a verification observed once by hand, valid only for the tree state it ran against.

### What moved underneath it

While the result sat recorded, the parent branch (`feat/st-086-awcp-local-mvp`,
[PR #39](https://github.com/CAPeddle/ai-memory/pull/39)) took a code-review pass that
reimplemented the very path one of the 28 checks covered. Re-derive it:

```bash
git diff <verified-at-sha>..origin/feat/st-086-awcp-local-mvp -- server/src/workflow/dashboard.ts
```

401 handling moved out of `load()`'s catch, where it was:

```js
} catch (e) {
  say(e.message, "err");
  if (String(e.message).indexOf("401") === 0) sessionStorage.removeItem(KEY_NAME);
}
```

…and into `call()`, where it became status-based, with eviction scoped to the exact key
that failed:

```js
if (res.status === 401 && sessionStorage.getItem(KEY_NAME) === key) {
  sessionStorage.removeItem(KEY_NAME);
}
```

**Nothing was done wrong, and that is the whole point.** The review commit's own message
says the change "resolves two findings that pull opposite ways — unconditional eviction
would have fixed one and worsened the other." It came out of an adversarial review pass
that had correctly identified real concurrency problems in the page — state assembled and
reloaded across independent asynchronous requests (session history) — and the same pass
added a `bannerTimer` guard in `say()` and a `loadGeneration` token in `load()`. This is
good work improving the code. From that commit
onward, though, the recorded check "a 401 clears the stored key" described an
implementation that no longer existed. The claim did not become *false* so much as
**unmoored** — nobody had re-observed the new implementation doing the thing the old one
was watched doing.

### Why nothing caught it

CI never ran. Its trigger block is `main`-only ([`.github/workflows/ci.yml:1-7`](../../../.github/workflows/ci.yml)):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

The browser work was a stacked PR based on a feature branch, so neither trigger fired. This
is the norm here, not an edge case — of the last seven PRs, **five** (#34, #35, #36, #38,
#40) targeted a feature branch and therefore ran zero jobs. Not a reduced set; none.

Be precise about the counterfactual: **CI would not have caught this one even if it had
run**, because there is no browser in CI by an explicit and reasonable decision
([`docs/workflow-mvp.md`](../../workflow-mvp.md), "Verifying the dashboard in a real
browser"). The narrow, correct claim is that stacking into a feature branch removed
whatever net existed, leaving nothing at all running against the change.

### How it actually surfaced

Rebasing onto the updated parent produced a merge conflict in that same `call()` block.
That was **textual adjacency, not a process working.** The browser branch's own fix — the
duplicated-criteria banner defect the 28 checks had *found* — happened to live in `call()`,
the same function the review had just rewritten. Had the review pass touched only `say()`
or `load()`, the rebase would have applied cleanly and the stale claim would have shipped
in silence.

### Why the existing guidance was not enough

This is the sharpest part, because the docs *did* carry a re-verification rule and it still
could not fire. [`docs/workflow-mvp.md:113`](../../workflow-mvp.md) says:

> Re-run that by hand if you change `dashboard.ts`.

Written in the second person, that covers exactly one case — the author changes the file —
and misses the case that happened: **someone else changed it.** The other two records avoid
the grammatical trap ("when `dashboard.ts` changes") but still name no commit, so a reader
has no way to evaluate whether the trigger has already fired.

The structural reason is worse than the grammar. **On a stacked branch the verification
record lives in the child while the change lands in the parent.** The person holding the
rule never sees the commit that trips it.

### How this differs from its neighbours — read this before writing a fourth doc

Three existing docs sit close, and this one is only worth its keep because of the deltas:

- [verify-worktree-change-against-docker-test-stack.md](verify-worktree-change-against-docker-test-stack.md)
  **§4** already argues that a recorded figure goes stale ("not eventually, but within the
  same story, on the same morning") — and it already records the same 85→106 move, already
  attributing it to a code-review pass, so the "someone else did it" element is not new
  there either. The delta is what expires and how you detect it: there, a suite grew under a
  **count**, and the remedy is to record a failure *set* instead. Here, a third party edited
  the **verified surface**, and the remedy is a commit anchor. Its headline topic is which
  tree the tooling ran against — *did my run see my edit?* This one asks *does yesterday's
  green still describe today's file?*
- [story-board-stale-updates-2026-06-19.md](story-board-stale-updates-2026-06-19.md) names
  two staleness classes: status drift (someone forgot to move the card) and a recorded
  number invalidated by suite growth. This is the third member — a recorded *result*
  invalidated by its subject changing, under a different author. Nobody forgot, and nobody
  touched the record.
- [verification-mechanisms-need-adversarial-review.md](../conventions/verification-mechanisms-need-adversarial-review.md)
  is the conceptual parent, **and it already got here first** — worth stating plainly rather
  than claiming novelty this doc does not have. Its preamble records that "two further
  review rounds on the same open PR moved roughly nine of its original `file:line`
  citations and falsified two of its worked examples, without the branch ever being rebased",
  and it already prescribes "Re-verify after each round rather than at merge." That is a
  recorded artifact invalidated by someone else's work on a shared branch — this doc's
  thesis, in a doc written before it.

  The remaining delta is narrower than it first looks, and it is a mechanism rather than an
  insight. That doc is about **citation drift** in a written artifact, and its remedy is to
  prefer durable anchors (test names, functions, files over line numbers) plus a discipline
  reminder to re-verify. This one is about a **behavioural result** expiring, and its remedy
  is a commit anchor plus a pathspec, which converts "did someone re-verify?" from something
  a person must remember into a diff anyone can run. If you only read one, read that one;
  this adds the mechanical check and the stacked-branch framing.

## Guidance

### 1. Anchor every point-in-time verification to a commit, not a date

A date is unfalsifiable and undiffable. A commit turns "is this still true?" into one
command. Capture the SHA at the moment the checks pass:

```bash
git rev-parse --short HEAD    # record this in the same sentence as the result
```

Then every record carries it, along with its own re-check:

```bash
git diff <verified-at-sha>..HEAD -- server/src/workflow/dashboard.ts
```

Empty output means the result still describes the file. Any output means it has expired —
regardless of who produced the diff.

### 2. Name the verified surface in paths

The diff above is only as good as its pathspec. Write down *what* was verified, as paths,
so expiry is mechanical rather than a judgement call. A verification whose surface cannot
be named in paths is one whose expiry cannot be detected — worth knowing at recording time,
not at claim time.

### 3. Treat any change to that surface as expiring the result

Write the rule as a property of the file, not as an instruction to a person. Second person
silently excludes the most likely failure mode on a shared branch.

- Bad: "Re-run this by hand if you change `dashboard.ts`."
- Good: "This result describes `dashboard.ts` at `<sha>`. Any commit touching that file
  expires it — re-run before relying on it."

"Expires" is not "is wrong." The new 401 implementation is better than the old one. An
expired result is simply one nobody has re-observed.

### 4. On a stacked branch, re-verify after rebase and before claiming

```bash
git fetch origin
git rebase origin/<parent-branch>
git diff <verified-at-sha>..HEAD -- <verified surface>   # non-empty => the record expired
# ...re-run the manual verification against the rebased tree...
git rev-parse --short HEAD                               # update every record with the new SHA
gh pr create --base <parent-branch>                      # only now
```

Do this **even when the rebase applies cleanly.** A clean rebase is evidence about *text*,
not about *behaviour*; this incident surfaced only because two edits happened to collide.

And check whether CI is even in play before leaning on it:

```bash
gh pr view <n> --json baseRefName    # anything other than "main" => ci.yml never fires
```

### 5. Record pre-squash SHAs as working anchors, not archival ones

This repo squash-merges, so branch SHAs are rewritten on the way into `main` (see
[`CLAUDE.md`](../../../CLAUDE.md) § Merge strategy). A recorded SHA is a *working* anchor
for the life of the branch — which is exactly when it needs to be diffable. For the
durable, post-merge lookup, use the story trailer:

```bash
git log --grep="Story: ST-086"
```

## Why This Matters

**A stale verified claim is more expensive than an admitted gap.** An open gap is visible
and gets budgeted. A record saying "28/28 checks, verified" gets *spent* — a reviewer reads
the criterion as closed and allocates attention elsewhere, which is what a verification
record is for.

**Date-anchoring quietly makes the drift undetectable.** Everyone involved was disciplined:
three separate records, each labelled point-in-time, each naming the re-run trigger. It
still failed, because a date gives a future reader nothing to compare against. One short
SHA in the same sentence converts a diligence problem into a one-command check.

**Stacked branches invert who can see the trigger.** The author who wrote "re-run if you
change `dashboard.ts`" was never going to change `dashboard.ts` — the reviewer on the
parent branch did, and had no view of the child's claims.

**The safety nets people assume are running are often not.** Five of the last seven PRs
targeted feature branches, where CI runs nothing at all.

**Luck is not a control.** The only reason this did not ship was that two independent edits
touched adjacent lines of the same function.

**The cost asymmetry is extreme.** Recording the SHA is a handful of characters while the
result is fresh and the number is on screen. Not recording it costs either a full re-run of
a manual browser procedure — Playwright installed outside the repo, `libnss3`/`libnspr4`
extracted without root, a throwaway server on a spare port — or a shipped false claim.

## When to Apply

- **Any verification automation cannot repeat.** Manual browser runs, one-off performance
  measurements, load tests, hand-driven walkthroughs — anything whose evidence is a written
  claim rather than a re-runnable command.
- **Whenever a result is recorded in prose** — a board criterion, a doc, a code comment, a
  PR body, a handoff. If it will later be read as evidence, it needs an anchor readers can
  test.
- **Every stacked PR.** Re-verify after the rebase, before opening the PR and before
  updating the board.
- **When a review pass lands on a branch you are stacked on.** Treat the diff over your
  verified surface as the first question, not the last.
- **When deciding *not* to automate something.** The obligation that decision creates is an
  expiry-tracked manual result, not a permanently trusted one.
- **Not** for which working tree your tooling executed against — that is
  [verify-worktree-change-against-docker-test-stack.md](verify-worktree-change-against-docker-test-stack.md).
  Both can bite in one session; neither substitutes for the other.

## Examples

### The record line: before and after

Before — date-anchored, undiffable, addressed to a person:

```markdown
That gap was closed once, by hand, on 2026-08-02 ... 28 checks covering render,
attention grouping and reason colours ...
Re-run that by hand if you change `dashboard.ts`.
```

After — anchored to a commit, addressed to the file, carrying its own expiry check:

```markdown
That gap was closed once, by hand, on 2026-08-02 ... 28 checks ...

Verified surface: `server/src/workflow/dashboard.ts` at <sha> (a pre-squash branch SHA;
after the squash into `main`, find this work with `git log --grep="Story: ST-086"`).

This result describes that file at that commit. **Any** commit touching it — yours or
anyone else's — expires the result. Check before relying on it:

    git diff <sha>..HEAD -- server/src/workflow/dashboard.ts

Non-empty output means re-run the checks before claiming the criterion verified.
```

The same block belongs in *all* the records, because a reader arriving at any one of them
should be able to test the claim without finding the others.

### The check firing, on the real incident

```console
$ git diff <verified-at-sha>..origin/feat/st-086-awcp-local-mvp -- server/src/workflow/dashboard.ts
@@ async function load() {
   } catch (e) {
+    if (generation !== loadGeneration) return;
     say(e.message, "err");
-    if (String(e.message).indexOf("401") === 0) sessionStorage.removeItem(KEY_NAME);
   }
```

Non-empty. The verified surface moved, so the record no longer described shipping code —
and the specific check "a 401 clears the stored key" pointed at a deleted line. That
verdict comes from one command, needs no knowledge of who changed it or why, and would have
been identical had the review touched `say()` or `load()` instead, where no merge conflict
would ever have raised a hand.

### A second, quieter expiry in the same rebase

The rebase also pulled in three new test suites from the review pass. The workflow suite
went from 85 passing to 106 passing across the rebase — both figures observed by running it
before and after, not derived from counting test blocks in the tree, which is a different
number again because some suites generate cases in a loop. Any pass *count* noted
beforehand was stale the moment those suites landed — which is why [`CONCEPTS.md`](../../../CONCEPTS.md) defines **Baseline** as a named
set of expected failures and states outright that a pass count is deliberately not one. The
two expiries share a root: a total and a date are both summaries that discard the one thing
needed to re-check them. **Record the anchor, not the summary.**
