---
title: "Individually correct fixes can leave a document self-contradictory — read the whole thing after the batch"
date: 2026-08-26
category: workflow-issues
module: review-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Applying a batch of review findings to a plan, spec, or requirements document"
  - "Accepting a fix that adds an item to something the document counts, numbers, or calls 'the only' one elsewhere"
  - "Rewriting a requirement that another section quotes, summarises, or claims to satisfy"
  - "Declining a low-confidence finding as a vague overstatement while other fixes to the same text are still pending"
  - "Deciding whether a diff or a grep is enough to confirm a reviewed document is still coherent"
symptoms:
  - "A Key Technical Decision titled 'Three proofs, not one' enumerates four proofs, because a confirmed fix added a fourth control"
  - "A requirement that was merely vague before a fix ('written once and consumed everywhere') is outright false after it"
  - "A design line still says 'Two checks run alongside the pin' when three now do, and a 'model for step 5' pointer survives a renumbering"
  - "Every applied fix is individually correct and was individually confirmed; the assembled document contradicts itself in ten places"
  - "Two of the contradictions were raised in round one as confidence-50 FYIs and correctly declined as overstatements, then made true by the later fixes"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
related_components:
  - "documentation"
  - "tooling"
tags:
  - ce-doc-review
  - plan-review
  - review
  - document-coherence
  - batch-fixes
  - declined-findings
  - verification
---

# Applying a review's fixes expires the rest of that review — read the whole document afterwards

## Context

A `ce-doc-review` pass ran over the ST-094 plan
([`docs/plans/2026-08-23-1208-test-st094-router-derived-route-classification-plan.md`](../../plans/2026-08-23-1208-test-st094-router-derived-route-classification-plan.md)),
with six in-process persona reviewers — coherence, feasibility, security-lens, adversarial,
product-lens, scope-guardian — plus four cross-model peer reviewers routed to a different
provider. Eleven findings were applied in three waves: three mechanical corrections, then a
confirmed batch of three proposed fixes, then five of seven decisions under a best-judgment
bulk action.

**Every applied fix was individually correct, and every one was individually confirmed by
the user.** The document that came out the other side was self-contradictory in ten places,
and the contradictions were *created by the fixes*.

The file is now repaired and committed. Two caveats on how to read what follows, both
true as of 2026-08-26. First, **the plan's only commit is a direct commit to local `main`,
not yet pushed** — so the path above resolves on `main` and nowhere else, and any tooling
run from another branch will report it missing. Cite it by branch and path rather than by
its SHA, which a rebase before the push will rewrite. Second, **that single commit holds
only the repaired text**: every pre-fix wording quoted below exists nowhere in git, and is
attributed to the review session's own record rather than to the tree.

### The two that carry the finding

Two of the ten had been raised **in the review's own first round**, as FYI observations at
confidence anchor `50` — the "verified real but may be a nitpick" tier, whose behavioural
criterion is that the honest answer to *what breaks if we do not fix this?* is *nothing
breaks, but…*. Both were correctly declined at the time.

**R7 — a scope word next to an undocumented exception.** It read:

> The mount prefix is written once and consumed everywhere it is needed.

The declined finding said, accurately, that this was an overstatement: `dashboard.ts`
emits its own browser-side copy — `fetch("/api/workflow" + path)`, inside the `call()`
helper in `server/src/workflow/dashboard.ts`. At the time the requirement was **vague**, not
false — "where it is needed" could be read as scoped to the server. A later confirmed fix
then documented that client copy explicitly, as a remainder the plan deliberately leaves in
place. The moment the exception was written down, the sentence stopped being vague and
started being false. The repaired R7 reads:

> R7. The mount prefix is written once on the server side and consumed at every server-side
> site that needs it. The `dashboard.ts` client copy is a recorded remainder outside this
> requirement (KTD6), and the existing policy test's standalone cases keep their literal
> paths.

**R5 — the same shape, one word.** It called the classification map "the only statement of
intent". A fix added a per-entry rationale and a second marker kind, at which point the
operator-only patterns the classifier itself holds (`server/src/workflow/policy.ts`,
`OPERATOR_ONLY_ROUTES`) were plainly a second statement of intent. Repaired, it is scoped — "the only **test-side** statement of intent"
— with the classifier's patterns named as unchanged and pinned rather than replaced.

Nothing in the pipeline re-checked those two declines against the post-fix text, and **no
reviewer could have caught them, because every reviewer read the pre-fix document.**

### The other eight, in one paragraph

The rest are the mechanical class, and they are worth listing only as evidence of volume:
a Key Technical Decision titled "Three proofs, not one" enumerating three lettered items
after a fix added a fourth control and rewrote R8 to name three failure conditions (now
"Four proofs, not one", with (a)–(d)); a High-Level Technical Design line reading "Two
checks run alongside the pin" when there were now three; a U3 "model for step 5" pointer
left stale by step renumbering (now "steps 5 and 6"); a test scenario asserting
`ALL`-method entries are "classified", contradicting the newly added non-request-path rule;
a U1 file-list annotation saying "modify" for a file that unit only re-runs; a short-form
`std@0.224.0/assert` specifier where every `std` import across `server/tests/*.ts` uses the
full `https://deno.land/std@0.224.0/...` URL; a mermaid edge label reading "key set equal"
after the prose moved to multiset comparison (now `multisets match`); and a Deferred-to-
Follow-Up pointer that did not name the Open Question deciding it.

### This is recurrent here, not a one-off

The same shape shows up repeatedly in this repo's recent history, which is the argument for
a written rule rather than more care. (session history)

- **A fix invalidating an earlier fix of the same author.** During PR #59's fourth review
  round, a reviewer showed that every bullet justifying a "saves 4–5 days" figure was
  scope-enforcement work — exactly the work an earlier round had declared common to both
  options. The session's own words: *"my own correction invalidated the figure I then leaned
  on as carrying the recommendation."* That round stopped patching and escalated. (session history)
- **A decline that expired on a fact the same session had changed.** A
  `ce-compound-refresh` pass correctly declined a nit — a doc pinning an ADR at revision 1.3
  when it was now 1.4 — on the stated ground that the doc's hedge keys on status, not
  revision. Correct at the time, and resting on a live fact that same session had edited,
  with nothing to re-check it if the status later moved. (session history)
- **The gap named and shipped anyway.** An earlier session applying settled decisions to a
  plan wrote the caveat out loud and then shipped: *"the round-2 review ran against the
  pre-decision document … the reviewed document and the shipped document are not the same
  text."* No mechanism re-ran review against the post-fix text. (session history)

### Why the pipeline does not catch this

There **is** a mechanism for interactions between findings — it runs in exactly one
direction. `ce-doc-review` describes *withdrawal*: a finding another finding's Apply
resolves "does not belong in an action bucket — it is withdrawn, not applied, deferred, or
skipped."

That models **a fix resolving a finding**. Nothing models **a fix falsifying a declined
finding, or falsifying an adjacent statement in the document that was never a finding at
all.**

And the re-check for even the modelled direction is deferred out of the round: an
Apply-triggered withdrawal's resolution depends on the staged edit landing and semantically
resolving the finding, "which round N+1 re-synthesis checks". So within a single round there
is no post-apply consistency pass of any kind — the safety net is another whole review
round, which only exists if someone runs one.

The irony is exact. The same skill lists its silent-apply patterns as "summary/detail
mismatch …, **wrong counts**, … **stale internal cross-references**, terminology drift,
**prose-vs-diagram inconsistency**". Five of the ten defects the fixes created land squarely
inside that list — the two wrong counts, the two stale pointers, and the mermaid label — and
most of the remainder are near neighbours of it. The round manufactured precisely the defect
classes it knows how to auto-fix, in text no reviewer in that round would ever read.

### What resolved it

After the batch landed: **read the document end to end.** Not a diff, not a targeted grep.
One read of a ~340-line file produced ten repairs. Exactly one of the ten had been caught
earlier, and only by luck — a grep for one stale phrase after an unrelated edit.

### How this differs from its neighbours — read this before writing a fifth doc

- [verification-expires-when-the-verified-surface-changes.md](verification-expires-when-the-verified-surface-changes.md)
  is the same expiry law with a different subject. There, the thing that expires is a
  **verification result** and the surface is moved by **someone else, later**. Here the thing
  that expires is a **review finding** — including one you correctly declined — and the
  surface is moved by **the review's own applied fixes, inside one session**. The direction
  inverts too: there an accurate claim became *unmoored* (nobody had re-observed it); here
  accurate declines became *false*. That changes the remedy. A commit anchor is right when
  expiry is an event that may or may not happen, because it makes the trigger diffable.
  Applying a batch of fixes is not a contingency — it **guarantees** the expiry — so there is
  nothing to detect, and the remedy is a terminal re-read rather than a check you might run.
- [fix-the-assumption-not-the-symptom.md](../conventions/fix-the-assumption-not-the-symptom.md)
  is the opposite failure of the same fix. There, a fix propagates **insufficiently**: the
  corrected belief is still alive one site over, and you hunt for *copies of what you just
  fixed*. Here a fix propagates **entailments**: neighbouring statements that were right
  become wrong, and you hunt for *statements the fix's new precision falsifies*. Same trigger
  — a fix just landed — opposite search. Note also that its worked examples are
  within-artifact sibling branches; cross-section entailment in one prose document is the
  gap this doc fills. Its rule also has a boundary this one does not:
  sweeping siblings can be the wrong move when a sibling must not be touched — an applied
  migration's bytes, for instance
  ([an-applied-migrations-body-is-byte-frozen.md](../conventions/an-applied-migrations-body-is-byte-frozen.md)).
  That constraint bites its remedy and not this one, because a re-read changes nothing on
  its own.
- [verification-mechanisms-need-adversarial-review.md](../conventions/verification-mechanisms-need-adversarial-review.md)
  got adjacent first, and it is worth saying plainly rather than claiming novelty. Its
  preamble records later rounds moving its own `file:line` citations and falsifying two
  worked examples, and it already prescribes "Re-verify after each round rather than at
  merge." The remaining delta is *object* and *timing*: that doc is about the review artifact
  drifting **across** rounds and answers it with durable anchors; this one is about the
  reviewed document's own remaining statements, and the round's own declined findings, going
  stale **within** a single round at the apply step — where no later round is guaranteed.
- [milestone-scoped-constraints-expire-project-scoped-ones-do-not.md](milestone-scoped-constraints-expire-project-scoped-ones-do-not.md)
  explains *why* an adjacent loose statement survives a fix: scope declared far from the
  statement that depends on it is scope each reader re-inherits from wherever they entered.
  That is the readability property this doc's re-read exists to defeat.

## Guidance

### 1. State the rule as a property of the batch, not an instruction to a person

Second person silently excludes the case where someone else applied the fixes, and this
repo has already been bitten by exactly that grammar
([verification-expires…](verification-expires-when-the-verified-surface-changes.md) §3):

- Bad: "Re-read the document if you think your fixes might have broken something."
- Good: "**Applying a review's fixes expires the rest of that review's findings, including
  the ones correctly declined. A review pass is not complete when the last fix lands; it is
  complete after a full end-to-end read of the post-fix document.**"

### 2. The re-read is owed on any multi-fix batch — and only then

- **Two or more fixes applied to one document in one pass:** owed, unconditionally.
- **A single edit:** not owed. One fix has no sibling fix to interact with, and the author
  has the surrounding text in view.
- **A bulk/best-judgment action:** owed and *cheapest to forget*, because nothing forced the
  author to read each fix's neighbourhood on the way past.

Do it once, after the last fix lands. Not per-fix — the whole point is that the final text
is the only text worth checking, and it does not exist until the batch is done.

### 3. Read the document, not the diff — the diff is the complement of the damage

This is the mechanism, and it is why discipline alone does not substitute. **The
contradictions live in text the fixes did not touch.** A diff shows you exactly the lines
that changed; the entailed defects are, by construction, everywhere else. A targeted grep is
the same blindness with a narrower window — it found one of ten here, and only because
someone happened to remember a phrase.

### 4. What to look for

1. **Counts and enumerations the fixes changed.** "Three proofs" with four items, "Two
   checks" with three, "eleven routes" after a twelfth. A fix that adds or removes a list
   member almost never updates the sentence that counts them.
2. **Cross-references and step pointers.** Renumbering a step or a unit silently breaks
   every "see step N" elsewhere in the file, including ones in unrelated sections.
3. **Diagrams echoing revised prose.** A mermaid label or table cell restates the prose in
   four words; when the prose is sharpened, the four words stay. (Per the corpus rule, the
   fix is to update the diagram, never to delete it.)
4. **Scope words adjacent to a newly documented exception.** *only*, *once*, *everywhere*,
   *always*, *never*, *the single*. When a fix documents an exception anywhere in the
   document, grep the whole file for these words and re-read each hit **against the new
   exception**. This is where the two sharpest defects lived.
5. **Requirement-vs-unit pairs.** A requirement and the implementation unit that claims to
   satisfy it are usually far apart in the file, so a fix to one is read without the other
   in view.

### 5. Re-check the declined low-confidence findings against the *current* text

Explicitly, as its own step, and it is the step nothing else covers. Every finding the
round declined — the FYI tier especially — was a judgment about **the text as it then
stood**. Walk that list again with the post-fix document open and ask one question per
finding:

> This was declined as *vague but not wrong*. Is it still merely vague, or did one of the
> applied fixes make it checkable — and false?

A finding whose whole basis was "this is loose" is precisely the one a precision-adding fix
converts into a defect. **Declining it was correct; leaving it declined afterwards is not
the same decision.** The same question applies to a decline that rested on a live fact —
a version, a status, a count — that any fix in the same pass has since moved. (session history)

### 6. Note which fixes *pinned something down*

Not every fix creates entailments. The ones that do move the document from loose to precise:
documenting an exception, adding an enumeration member, naming a previously unnamed
consumer, replacing a hedge with a rule. When you apply one, you have just made every
adjacent loose statement newly checkable — flag it at apply time so the re-read knows where
to slow down.

### 7. Distinguish an incomplete sweep from a fix that undermines an earlier fix

Both surface as "the review keeps producing findings", and they call for opposite responses.
A prior session pre-committed to this distinction and then honoured it: falling severity with
narrowing scope reads as *incomplete propagation of your own fixes*, so keep sweeping. A
finding that **undermines an earlier fix of yours** is a different signal — that one stops
the patch cycle and goes to the human, because continuing to patch means building on a
premise the review has just retired. (session history)

## Why This Matters

**Fixes are not additive, and the instinct that they are is the whole trap.** Apply N
individually-correct confirmed fixes and you do not get a document N fixes better. A fix
that pins down something the document previously left loose makes every neighbouring loose
statement newly checkable, and some of them then fail. **Vagueness is load-bearing** — it is
what let the adjacent sentence stay true. Sharpen one sentence and you can falsify another
you never touched.

**No reviewer in the round can catch this, by construction.** Ten reviewers, six personas
and four cross-model peers, all read the pre-fix document. The defects did not exist yet.
This is not a coverage problem that more reviewers or better personas would fix; it is a
sequencing property.

**Every individual gate passed.** Each fix was correct. Each was confirmed by the user. The
bulk action was scoped to the high-confidence tier. There is no step in the pass whose
output was wrong — the defect is in what happens *between* the correct steps, which is
exactly the class no per-step check catches.

**The artifact type raises the cost.** A plan is executed from. A contradiction between a
requirement (R7 said "written once … everywhere") and the unit that implements it (U1 says
"consumed at both `index.ts` sites, `dashboard.ts` out of scope") does not get noticed by an
implementer — it gets **acted on**, and the implementer picks whichever half they read
first. A document that reads as authoritative and quietly disagrees with itself is worse
than one that admits a gap, for the same reason a stale verified claim is worse than an
open one: it gets *spent*.

**The cost asymmetry is not close.** The re-read is one file, once, after the last fix — a
few minutes, bounded, requiring no new tooling and no second review round. The failure it
prevents is a shipped plan with ten self-contradictions in it, found either by an
implementer mid-execution or not at all.

## When to Apply

- **Any `ce-doc-review` (or equivalent) pass that applies more than one fix.** Especially
  one that ends in a bulk or best-judgment action, where no per-fix pause happened.
- **Any batch of confirmed edits to a spec, plan, ADR, or requirements document**, review or
  not. The mechanism is about multiple edits to one prose artifact, not about the review
  tool.
- **Whenever a fix adds precision — an exception, a remainder, a carve-out, a stated basis.**
  That is the highest-yield trigger in this incident: the two sharpest defects each came from
  a fix of this shape, one documenting the `dashboard.ts` remainder and one adding the map's
  per-entry rationale.
- **Whenever a fix changes the membership of a list**, whether or not a count appears next
  to it. The count is usually somewhere else in the file.
- **Before recording the pass as complete** — in a completion report, a board entry, or a
  commit message. "Eleven findings applied" is the claim that retires the suspicion.
- **Not** for a single-edit change, and **not** as a substitute for the review itself. This
  is the terminal step of a review, not a review.
- **Not** for source code, where the compiler and the suite catch most of what a re-read
  would. This rule earns its keep specifically on prose, whose only consistency checker is a
  reader.

## Examples

### The vague → false → rescoped arc, in full

The clearest instance, because all three states are recoverable and the middle one is the
defect.

**State 1 — vague, and correctly declined.** R7 read: "The mount prefix is written once and
consumed everywhere it is needed." A first-round FYI observation pointed out the client-side
copy in `dashboard.ts`. Declined — correctly. The sentence was an overstatement, not a
falsehood: *everywhere it is needed* admits a reading in which the browser script does not
need it from the server-side constant.

**State 2 — false, and nobody looked.** A later confirmed fix documented the client copy as
a deliberate remainder, in the Problem Frame and again in KTD6:

> The prefix is currently written into the classifier's four regexes, twice in `index.ts`,
> and once more client-side in `dashboard.ts` — which U1 does not touch, so "once" below
> means once across the server-side call sites, not once in the repository.

(Quoted as the plan committed it. That "four" was accurate on 2026-08-23 and is already out
of date — later work added operator-only patterns — which is the same expiry this doc is
about, arriving in this doc's own evidence.)

That fix is right. It is also the exact sentence that kills R7: once the document states
the prefix is written in a place U1 does not touch, "written once and consumed everywhere"
is no longer a loose claim, it is a contradicted one. The plan now asserted a requirement
that its own decision record said would not hold.

**State 3 — rescoped, by the end-to-end read.** R7 in the committed file is scoped to the
server side, with the `dashboard.ts` copy named as a recorded remainder, and the matching
Definition of Done bullet reading "the `dashboard.ts` client copy is a recorded remainder,
not a failure of this criterion."

Note what changed between states 1 and 3: **nothing about the code, and nothing about the
intent.** The requirement always meant the server side. What moved was how much precision
the surrounding document had, and precision elsewhere is what made the imprecision here
into a defect.

### The count chain — one fix, three stale sentences

A confirmed fix added a fourth control (a standing prefix control) to the plan's proof
strategy and rewrote R8 to name three failure conditions. Three separate sentences in
three separate sections were left describing the old shape:

| Location | Before | After |
|---|---|---|
| KTD7 title + list | "Three proofs, not one" + three lettered items | "Four proofs, not one" + `(a)`–`(d)` |
| High-Level Technical Design, closing line | "Two checks run alongside the pin" | "Three checks run alongside the pin and fail independently of it…" |
| U3 → Patterns to follow | "the model for step 5" | "the model for steps 5 and 6" |

The KTD title and the design line are in different halves of the file from the fix that
invalidated them; the step pointer broke because the same fix inserted a numbered step
above the one it named. **A diff of that fix shows none of the three.** All three are in the
silent-apply catalogue — "wrong counts", "stale internal cross-references" — which is to say
they were trivially fixable by anyone who read the sentence. Nobody read the sentence,
because the pass was over.

### The re-check step, written out

What step 5 of the Guidance looks like in practice — reconstructed from this incident, with
the two flips as they actually happened and the finding handles illustrative:

```
Declined round-1 findings, re-checked against the post-fix text:

  "R7 overstates — dashboard.ts holds a client copy"     FYI tier, declined
      → KTD6 now documents that copy explicitly.
      → R7 moved from VAGUE to FALSE. Re-open. Rescope R7 to the server side.

  "R5 'the only statement of intent' is loose"           FYI tier, declined
      → the per-entry rationale fix added a second marker kind; the classifier's own
        operator-only patterns are plainly a second statement of intent.
      → Moved from VAGUE to FALSE. Re-open. Rescope R5 to "test-side".

  (…every other decline from the round: same one question, recorded either way)
```

Two of that round's declines flipped. Neither was a mistake at the time; both were defects
by the end. The list is short, the check is one question per entry, and it is the only part
of the re-read that a full linear read might still miss — because these sentences look fine
on their own, and are wrong only against text several sections away.
