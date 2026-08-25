---
title: A constraint in a milestone-scoped .planning/ artifact expires at the boundary — do not plan to supersede it
date: 2026-08-24
category: workflow-issues
module: planning-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Planning work that a row in .planning/REQUIREMENTS.md or .planning/ROADMAP.md appears to forbid"
  - "Writing a supersession, reversal, or dated override against a GSD planning artifact"
  - "Reading a constraint quoted by file:line in a review finding, a handoff, or another plan"
  - "Deciding when a migration or workflow change becomes authoritative"
symptoms:
  - "A plan's first unit is 'supersede the requirement that forbids this' before any real work"
  - "Two independent reviewers flag the plan for rewriting live-milestone artifacts the origin document bars"
  - "The migration's destination appears to forbid the migration"
  - "A constraint is cited by line number with no indication of which document scope owns it"
root_cause: "A .planning/ artifact's scope is declared in its title, not at the line being quoted, so a milestone-scoped Out of Scope row reads as a standing project rule when cited by file:line."
tags:
  - gsd
  - planning
  - milestone
  - supersession
  - scope
  - plan-review
related_components:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/PROJECT.md
---

# A milestone-scoped constraint expires at the boundary; a project-scoped one does not

## What happened

A plan to migrate this repository's story board into GSD opened with a unit whose job was to
**supersede** `.planning/REQUIREMENTS.md:66`:

> | Replacing the existing story board or `docs/plans/` | GSD tracking supplements current governance and must preserve delivery history |

Three `ROADMAP.md` lines (`:7`, `:17`, `:175`) repeated the same posture. The plan proposed a dated
supersession at all four sites, arguing that the delivery-history *reason* was honoured by freezing
the board rather than deleting it.

Two independently dispatched reviewers flagged it as a P0: the plan rewrote **live-milestone
artifacts** that its own origin document explicitly barred — *"`.planning/PROJECT.md` and
`.planning/REQUIREMENTS.md` must not be rewritten now. They define the in-flight milestone."*

## The actual finding

**Neither the row nor the three pointers were project rules.** `.planning/REQUIREMENTS.md` line 1
reads:

> `# Requirements: ai-memory ST-088 Host Viability Milestone`

Line 66 sits in **that milestone's** `## Out of Scope` table. All three `ROADMAP.md` references live
in the ST-088 milestone roadmap. GSD writes a fresh `REQUIREMENTS.md` and `ROADMAP.md` per
milestone, so **the next milestone simply does not carry the row.**

The constraint did not need superseding. It needed *waiting for*. The unit that proposed to reverse
it was deleted, and the P0 dissolved rather than being mitigated.

## Why it was easy to miss

The scope is declared **in the title, ninety lines above the constraint**. Every downstream
artifact — the review finding, the handoff, the plan — cited it as `REQUIREMENTS.md:66`, and a
file:line citation carries no scope. Each reader inherited the framing from the last one without
returning to line 1.

## The discipline

**Before planning around a `.planning/` constraint, read the artifact's title.**

| Artifact | Scope | How a constraint ends |
|---|---|---|
| `REQUIREMENTS.md`, `ROADMAP.md` | **One milestone** — declared in the H1 | Expires at the milestone boundary. Nothing to write |
| `PROJECT.md` | **The project** | Amended at a milestone boundary through its own `## Evolution` section, which prescribes a full review of all sections |
| `STATE.md` | Current position | Not a constraint source |

`PROJECT.md` matters as much as the negative half. The same posture was restated there at `:59`
(WIP limits authoritative), `:60` (board and `docs/plans/` canonical), and in the Key Decisions row
at `:77` — and **those do not expire.** But `PROJECT.md:81-94` prescribes a full review of every
section **at each milestone boundary**, so amending them there is the document's own sanctioned
mechanism rather than a violation of it.

## The generalisable rule

A migration whose destination appears to forbid it is usually a **scope-reading error, not a real
conflict**. The two candidate resolutions differ sharply in cost:

- **Supersede** — write a dated reversal, defend it against the origin document, and accept that you
  edited a live artifact.
- **Wait for the boundary** — schedule the change at the point the constraint expires, and write
  nothing.

Check which one applies *before* designing the supersession. The check is one line: open the file
and read its title.

## Related

- `docs/solutions/workflow-issues/verification-expires-when-the-verified-surface-changes.md` — the
  same shape in a different register: a claim that is true only within a scope, cited outside it.
