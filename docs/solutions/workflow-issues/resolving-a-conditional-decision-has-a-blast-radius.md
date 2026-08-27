---
title: "Resolving a conditional decision has a blast radius — enumerate the class before fixing the instance"
date: 2026-08-27
category: workflow-issues
module: planning-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Flipping an artifact from a conditional state to a resolved one — an ADR `status: proposed` becoming Accepted, a gate discharged, a spike concluding, a hypothesis rejected"
  - "Applying a reviewer finding that names one stale sentence, one checkbox, or one `file:NN` citation"
  - "Inserting text into a file that other documents cite by line number — including citations written earlier in the same PR by the same author"
  - "Editing the narrative half of a paired representation: prose beside a traceability table, a phase summary beside its progress table, a source-code stamp beside the ADR it cites"
  - "Deciding a sweep is complete because the sites a reviewer named are fixed, or because one review round came back clean"
symptoms:
  - "A finding fixed in review round 1 reappears in round 8 at a sibling site in a different file"
  - "A round that converts one story's citations to section anchors is followed, three rounds later, by the same finding against the neighbouring story"
  - "A review names two stale documents; sweeping the class finds five"
  - "An acceptance criterion whose own subject is anchor drift carries drifted anchors, while asserting some were 'verified stable'"
  - "A document that predicted this exact class of staleness contains an uncorrected instance of it"
root_cause: missing_workflow_step
resolution_type: documentation_update
related_components:
  - "docs/design/adr/ADR-016-awcp-consolidation-host-topology.md"
  - "docs/design/adr/ADR-017-awcp-work-item-contract.md"
  - "docs/investigations/ST-084-awcp-host-spike-findings.md"
  - ".github/planning/story-board.md"
  - "server/src/workflow/types.ts"
  - "documentation"
tags:
  - adr
  - supersession
  - stale-citation
  - line-anchors
  - paired-representation
  - plan-review
  - governance
  - class-sweep
---

# Resolving a conditional decision has a blast radius — enumerate the class before fixing the instance

> **This is a process learning, not a live defect.** Every instance below was found and fixed on
> `docs/st088-adr016-signoff` ([PR #60](https://github.com/CAPeddle/ai-memory/pull/60)) — **open
> and unmerged at the time of writing**, base `main`. The evidence PR that preceded it,
> [#59](https://github.com/CAPeddle/ai-memory/pull/59), merged as the squash `1dc850d`. Because
> branch SHAs are rewritten by squash-merge, the durable lookup for this work is
> `git log --grep="Story: ST-088"`.

## Context

`docs/design/adr/ADR-016-awcp-consolidation-host-topology.md` was recorded on 2026-07-29 as
**Proposed / Conditional**. Its §1 named a host — *Candidate A*, AWCP co-tenancy inside ai-memory
— and immediately demoted it to a hypothesis gated on a spike, with a bar attached:

> **Spike outcomes:** accept Candidate A; accept A with required changes; or recommend a clean
> umbrella application (Candidate C). Until the spike concludes, this ADR stays Proposed and no
> schema or migration work may assume the host.

For roughly four weeks that sentence was load-bearing. Plans quoted it to justify staying
contract-first. Source files carried a one-line stamp deriving from it. The board quoted it as a
trap to avoid. The roadmap tracked the criteria that would discharge it.

On 2026-08-26 the spike concluded and the PO signed off — and the decision **reversed the
preference** rather than confirming it. ADR-016 is now **Accepted**, with Candidate A **rejected**
and a standalone AWCP peer service directed. It is an outcome *none* of the three enumerated spike
outcomes anticipated.

The moment that landed, **every artifact that had recorded the condition recorded something
false.** Not subtly — a developer reading `server/src/workflow/ports.ts` would have been told the
module's acceptance was still pending, when in fact it had been decided against and the module was
now an extraction donor.

Ten commits later (`a51aaef` … `4fdc792`, touching 25 files) the sweep was still landing. The
useful thing to record is not the decision; it is the **shape of the debris field** and the
discipline that would have caught it in one pass instead of eight review rounds.

### Two staleness classes

**Class 1 — paired representations.** A narrative sentence gets updated; the machine-readable half
sitting beside it does not.

| Site | The pair, and which half went stale |
|---|---|
| `.planning/REQUIREMENTS.md` | The `HOST-01`/`HOST-02` checkboxes vs. the traceability table two sections down. At `a51aaef`, `HOST-02` still read `- [ ]` while the table already read *Complete* |
| `.planning/ROADMAP.md` | One phase's status lives in **four** places in one file — the milestone checklist, the Phase 4 `**Status**:` prose, the phase progress table and the requirement coverage table. A narrative-only edit updates exactly one of the four |
| `docs/design/adr/ADR-016-…md` | §2's *"Gate relevance, stated conservatively"* paragraph still said **"Criterion 6 is not discharged"** after §1's new final gate-progress table, two sections up, recorded criterion 6 **met** |
| `server/src/workflow/*.ts` | The one-line `PROVISIONAL` stamp in `attention.ts`, `ports.ts`, `service.ts`, `store.ts` and `schema.ts`, each deriving from a canonical block in `types.ts` |

**Class 2 — line-number citations.** Inserting decision text renumbers every `file:NN` citation
*into* that file. Eight existing `ADR-016:NN` citations had to be repointed (`:57`→`:88` five times
across the board and two plans, `:63-65`→`:98`, `:120`→`:187`). Reproduce the set:

```bash
git show main:.github/planning/story-board.md | grep -oE 'ADR-016:[0-9-]+' | sort | uniq -c
grep -oE 'ADR-016:[0-9-]+' .github/planning/story-board.md | sort | uniq -c
```

Worse, the same PR **broke citations it had written itself**: inserting two new board entries at
the top of the Backlog section shifted every entry below them, so `ST-101`'s line pointers into
`ST-082` and `ST-099` came to land inside `ST-091` — pointers authored days after the decision, in
the very PR that moved them.

### The demonstrated failure mode

**Fixing the instance a reviewer names, rather than the class, reliably regenerates the same
finding at a sibling site one round later.** Four demonstrated repeats, each corroborated by the
commit that fixed it:

1. Round 1's *"B–D still blocked"* correction (`01edf11`) recurred at round 8 in ADR-016's own
   Consequences bullet — the same finding, at a site written in the same commit as the original fix.
2. Round 3's fix to ADR-017 §5 (`7604e7e`) recurred at round 5 in ADR-017's Consequences, swept
   whole only at `bdd7a4a`.
3. Round 4 converted `ST-100`'s citations to §-anchors; `ST-101`'s were left, and drifted at round 7.
4. Round 7 named **two** conventions documents still telling a developer that acceptance was gated.
   A sweep found **five** sites.

`2ad8fcf` names the pattern outright in its own message:

> Two findings, and both are the second instance of a class an earlier round fixed incompletely.

**This is the second consecutive PR in this story to hit it.** PR #59's round 3 produced three
findings that its session recorded as *"the same root: stale copies of claims I corrected in round
2 but failed to propagate. That's incomplete sweep, not new objections — fixable, but I need to
find every site this time, not just the three flagged."* The intent was right and the class still
recurred on the next PR, which is why this is written as a procedure rather than an intention.

### A clean review round is not convergence

PR #59 also supplies the counter-lesson. After its round 3 the unresolved trend read 0 → 1 → 2 → 0,
and the session reported convergence. **Round 4 landed anyway**, with a different variant: the
round-2 correction (that ST-082's scope work is owed under *either* topology) had silently
invalidated §13.5's "4–5 day savings" figure, which the recommendation still leaned on — the
savings figure and the 64-hour cost figure turned out to be the same quantity counted from opposite
ends.

So there are **two repeat variants**, and only the first is fixed by sweeping harder:

- **(a) unpropagated copies** — the fix was right, other sites still hold the old claim.
- **(b) collateral invalidation** — the fix was right and *falsified a different claim elsewhere
  that the document still relies on*. No grep for the old phrasing finds this one, because the
  stale text does not quote the thing you changed.

A round returning zero findings is necessary, not sufficient. Variant (b) is found by asking "what
did this correction make untrue?", not by searching for what it replaced.

### The self-referential cases, which are the whole argument

**First:** `ST-100`'s first acceptance criterion on `.github/planning/story-board.md` is *the entry
that tells its reader line anchors drift.* It carried drifted anchors, and asserted several were
"verified stable across both trees." They were not. It now carries its own counter-example rather
than deleting it — findings §18.9 went `:1958` → `:1964`, §18.11 `:2048` → `:2071`. Three of those
shifts happened **during the review rounds on this branch, after the numbers were written down.**

**Second, and sharper:** `docs/solutions/conventions/an-applied-migrations-body-is-byte-frozen.md`
is the document that **predicted this class**. Its list of claims that rot names *"status claims
about other documents ('ADR-016 is Proposed')"*. Commit `2ad8fcf` corrected two sites inside that
document and cashed the prediction with a worked example — and **left its own Related section still
describing ADR-016 as "the acceptance gate that keeps the module PROVISIONAL rather than
accepted."** The class recurred inside the document that predicted it, and survived the sweep that
documents the class. It was found by enumeration afterwards, not by any of the eight review rounds.

If the document that warns about a failure mode contains an instance of it, the process failed, not
the author. That is the signal to stop fixing and start enumerating.

## Guidance

### 1. Enumerate the class before you fix the instance

When a reviewer names a stale site, treat the name as a *sample*, not a work item. Three greps
cover almost everything.

**Every restatement of the old status** — and search source comments, not just docs:

```bash
grep -rn "Proposed/Conditional" --include=*.md --include=*.ts .
grep -rn "gated on ADR-016" --include=*.md --include=*.ts .
grep -rn "ADR-016 is Proposed" --include=*.md --include=*.ts .
```

The `--include=*.ts` is not decoration. Five of this sweep's sites were TypeScript docblocks, and
none would have appeared in a docs-only search.

**Every line citation into a file the change edits**, re-verified against the post-edit tree:

```bash
grep -rn "ADR-016:[0-9]" --include=*.md .
sed -n '88p' docs/design/adr/ADR-016-awcp-consolidation-host-topology.md
```

**Every citation the change itself authored**, if it inserts into a list, table, or numbered
section. This is the one people skip, and it is the one that bit here.

Grep to **zero occurrences** before committing, including the tracking artifacts —
`.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.github/planning/story-board.md` — not just
the document under repair.

### 2. Treat a paired representation as one edit, not two

Where a document carries both narrative and tabular state, **updating one half is not a partial
fix, it is an unfinished edit.** Find the pairs by the stable identifier, because that is what
appears in *both* halves:

```bash
grep -rn "HOST-01" --include=*.md .
```

Searching by the prose will only ever find the prose.

### 3. Prefer anchors that cannot drift

For any file the change itself edits, cite by `§`-anchor or by story ID, never by line number.
`ADR-016 §1` survives an insertion; `ADR-016:88` does not. `ST-082` survives a board reshuffle;
`story-board.md:412` does not. **"Cite by an identifier the target owns" is a stronger remedy than
"remember to re-check"** — it removes the failure rather than scheduling a detection of it.

### 4. "In force and unchanged" does not exempt a section from the sweep

ADR-016's §2–§4 were explicitly marked as surviving the host decision. §2 still contained a live
paragraph contradicting §1's new gate table. A blanket "unchanged" marker is a statement about
*decisions*; the section's *status claims about other documents* still have to be read one by one.
The marker eventually written into ADR-016 says exactly this:

> **"in force" does not mean "already swept"**

### 5. State the correction honestly — the bar often inverts rather than lifting

The tempting one-word fix is "discharged." It is frequently wrong. Here the constraint
**inverted**: schema work no longer returns for a per-item host decision, but must now assume a
*different* host, and must not assume the still-unscored topology's outcome. `2ad8fcf`:

> The correction is the same in every case, and it is not simply "the gate closed". The hedge
> survives with a different reason: the code may still change shape, not because acceptance is
> pending but because the module is destined to relocate … the old wording was a reason to
> under-invest in reviewing this code and the new one is not.

### 6. Budget for marked retention making the sweep larger

This repo keeps a superseded statement readable with a dated marker rather than deleting it. That
is the right convention, but it means every site needs an *authored marker*, not a deletion. A
class of 12 sites is 12 small pieces of writing, not one `sed`. It also means **the retained old
text keeps matching the greps that found the class** — so the enumeration is re-run against
markers, not against silence.

### 7. Enumerate the sites you cannot fix, and say so where they are

The sweep found a seventh `SPIKE / DISPOSABLE` stamp at the top of
`server/db/workflow/001_workflow_schema.sql` and **could not correct it**: the migration runner
checksums raw file bytes, so any edit to an applied migration — one comment character included —
trips `MigrationDriftError` and the process exits 1 before the port opens. The resolution was to
document the survivor at `server/src/workflow/types.ts:26`, the canonical stamp a reader arrives
from:

> **A seventh stamp survives, and not by oversight.**

An enumerated-but-unfixable site is a finding. An un-enumerated one is a trap.

### 8. Sweeping the class does not mean accepting every finding

Of the automated reviewer's findings, one was **not addressed, correctly**. It claimed
`./story-id.sh --check` would fail because the branch's `story-ids.md` lacked `ST-100`/`ST-101`. It
does lack them — but allocation lives on `main`, which is the PR's own base, and `--check` scans
the union across refs:

```bash
grep -n "ST-100\|ST-101" .github/planning/story-ids.md          # nothing on the branch
git show main:.github/planning/story-ids.md | grep -n "ST-100"  # present
```

CI passed. Enumerating a class is a search discipline, not a licence to auto-accept whatever a
reviewer's grep surfaced.

## Why This Matters

**A conditional decision is a fan-out, and resolving it is a fan-in.** The condition propagated
widely *because recording it was good practice* — a plan that quotes the bar it complies with is a
better plan. Every quote is a maintenance obligation created on purpose. The debris field is
proportional to how conscientiously the condition was recorded, which is exactly backwards from
where anyone's attention is when the decision lands.

**A stale gate is worse than a stale status.** "ADR-016 is Proposed" reads as bookkeeping.
"Acceptance is gated and this module may disappear" is a *decision input* — a reason to
under-invest in reviewing, testing and hardening the code carrying it. The five workflow stamps
told every future reader to treat 12 source files as disposable, more than a day after the ADR made
them a supported extraction donor.

**Instance-fixing is not merely incomplete, it is actively misleading.** After round 4 fixed
`ST-100`'s anchors, the board looked *more* trustworthy while `ST-101` sat wrong beside it. A
partially-swept class is harder to detect than an unswept one, because the fixed sites are the ones
a spot check lands on.

**Eight review rounds is the price of not enumerating.** Each round found a sibling of a class an
earlier round had already fixed. The rounds were not discovering new kinds of problem; they were
walking one class, one member at a time, at full review cost per member.

## When to Apply

- **The moment a conditional, provisional, or gated decision resolves** — an ADR moving off
  Proposed, a spike concluding, a feature flag becoming permanent, a deprecation completing.
  Resolution is the trigger, not a follow-up story.
- **Especially when the resolution reverses the preference.** If the condition resolves the way
  everyone expected, some stale text stays accidentally true. A reversal falsifies all of it at once.
- **Whenever a review names a stale site.** Ask what class it belongs to and enumerate. If the class
  has one member, the enumeration cost was one grep.
- **Whenever your change inserts text into a file others cite by line.**
- **Whenever you update one half of a paired narrative/tabular record.**
- **After each correction, ask what it made untrue** — variant (b) above is not found by grepping
  for the old phrasing.
- **Not** as a licence to accept every reviewer finding — see Guidance 8. Reproduce first.

## How this differs from its neighbours — read this before writing a fifth doc

This repo already has a staleness family, and this doc is the fourth and fifth members of its
taxonomy. It claims four things and concedes the rest.

| Doc | Owns | Why this one is still separate |
|---|---|---|
| [`conventions/fix-the-assumption-not-the-symptom.md`](../conventions/fix-the-assumption-not-the-symptom.md) | **The conceptual parent.** "When a fix changes how a belief is represented, the fix is not done until you have enumerated the other places that hold the same belief." | Its triggers are all code-shaped (switch arms, predicates, guards), and its ranked remedy — a constraint, a closed type, a shared guard, *then* a sibling sweep — collapses to the last resort for prose, which has no type system. This is its documentation-lane instance |
| [`conventions/an-applied-migrations-body-is-byte-frozen.md`](../conventions/an-applied-migrations-body-is-byte-frozen.md) | **The prediction and the taxonomy** of drift-prone claims, and the frozen-file prohibition | It answers "what is safe to write inside *this* file?" — a property of the file. This answers "what did resolving *this decision* invalidate across the repo?" — a property of an event. A reader who fully internalised it still walks into this incident, because it explicitly permits drift-prone content in *editable* files, and every site missed here was editable |
| [`conventions/verification-mechanisms-need-adversarial-review.md`](../conventions/verification-mechanisms-need-adversarial-review.md) | **Class 2 prior art** — it recorded same-PR renumbering a month earlier, and prescribed re-verifying after each round | Its remedy is "re-check more often". The durable fix found here is to cite by an identifier the target owns, so there is nothing to re-check |
| [`verification-expires-when-the-verified-surface-changes.md`](verification-expires-when-the-verified-surface-changes.md) | A *verification result* expiring because its subject moved | Its remedy — a commit anchor plus a pathspec, so expiry is a diff anyone can run — has no analogue for "is ADR-016 still Proposed?". Nothing makes that expiry mechanical, which is why this one has to be an enumeration discipline at resolution time |
| [`story-board-stale-updates-2026-06-19.md`](story-board-stale-updates-2026-06-19.md) | The family's origin: status drift from *forgetting* | That failure is forgetting. This one is **scoping** — nobody forgot; the update was made deliberately at the site a reviewer named, and the class went unenumerated |
| `individually-correct-fixes-can-leave-a-document-self-contradictory.md` | Intra-document coherence after a batch of individually-correct fixes | Complementary. Theirs is re-reading *one* document after a batch; this is enumerating *across* the corpus after a reversal. **Note:** that doc is on `main` and not on this branch, so the link resolves only after merge |

**The four genuinely new contributions:** the docs-lane trigger (a conditional decision resolving);
**paired representations** as a named class; *"cite by an identifier the target owns"* as the
class-2 remedy; and marked retention as an amplifier that makes the sweep larger rather than
smaller.

Prior art that this is *not* new about: GitHub issue #33 (*"Mirror the R3/R4 supersession into the
Prism ground-truth inventory"*) is the same class filed as an issue in July — a supersession applied
to one copy of an inventory and not its mirror. It also shows the class's worst variant: when the
twin lives in **another repository**, no grep in this one can find it.
