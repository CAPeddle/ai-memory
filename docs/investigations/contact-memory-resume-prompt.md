# Resume Prompt — Contact Memory MVP Review & Governance Refit (WSL2)

> **What this is:** a ready-to-paste prompt for a **fresh agent session in the WSL2
> clone** (`~/projects/ai-memory`, Claude Code or OpenCode) to resume the review +
> governance work handed off from a Windows session. Paste everything in the fenced
> block below, or tell the agent: *"Read and follow
> `docs/investigations/contact-memory-resume-prompt.md`."*
>
> **Prereq:** `git pull` first so you have commit `c6bf67f` and the handoff artifact.

---

```prompt
You are resuming a cross-clone handoff. Work locally only — do NOT rely on any external
Web Claude conversation as the source of truth; the PO drives this project from here.

## Ground truth to read first
1. Read `docs/investigations/contact-memory-mvp-review-and-governance-handoff.md` in
   full. It is the decision record. Its §2 (reconciliation), §5 (governance directive),
   §6–§7 (findings C/D verdicts), §8 (proposed stories), and §10 (action plan) are
   binding context.
2. Read `CLAUDE.md` ("Workflow gate", "Contact Memory Supersession Map") and
   `.github/planning/story-board.md` (current board state).
3. Skim the two grounding docs referenced by the handoff:
   `docs/investigations/compass_artifact_wf.md` and
   `docs/investigations/OpenCode Answer to Claude on Platform.md`.

## Critical first check — is claimed work real?
The prior (Web Claude) session claimed commit `6623c65`, a new `AGENTS.md`, board
entries ST-063–066, and an MVP CLI (`captureThoughtAdapter.ts`, `buildRepairPrompt`).
NONE of these were on `origin/main` as of the handoff. Web Claude cannot commit, so this
work is either unpushed here in WSL2 or never existed.

BEFORE any other work:
- Run `git status` and `git log --oneline -20` and `git branch -a`.
- Run `git log --all -S 'captureThoughtAdapter' --oneline` and `git cat-file -t 6623c65`.
- Determine which is true: (a) real unpushed/dirty work exists — if so, SECURE it
  (commit + push on a clearly named branch) before touching anything; or (b) the hash
  was fictitious and the MVP/governance work must be rebuilt.
- To reconstruct what past agent sessions actually did here, use the **ce-sessions**
  skill (search prior Claude Code / OpenCode session history for "Contact Memory MVP",
  "captureThoughtAdapter", "buildRepairPrompt", "governance restructure", "6623c65").
- Report findings to the PO via the questions tool before proceeding.

## Then execute the handoff action plan (§10), using compound-engineering skills

The PO's stated goal: use the **story board for direction** while applying the **rigour
of the compound-engineering plugin**, all local, shared across Claude Code + OpenCode +
VS Code. Let that shape every step.

1. Secure at-risk work (above).
2. **Reconcile the board.** Confirm/create ST-063 (parser types), ST-064 (WhatsApp
   parser), ST-065 (MVP), ST-066 (prompt migration). If the MVP (ST-065) exists, record
   residuals A1/A2/A3 (handoff §4) in its notes.
3. **Governance refit (handoff §5) — treat as real design work, not a quick edit:**
   - Use **ce-brainstorm** to settle the open governance questions with the PO
     (canonical `docs/plans/` + mandatory `story:` frontmatter; `ExecPlan:` → `Plan:`
     board field; `AGENTS.md` pointer to CLAUDE.md; deprecation banners on
     `.github/copilot-instructions.md` and the four `/plan*` prompts; whether governance
     changes themselves must route through `/plan-new` or count as a PO override).
   - Use **ce-plan** to produce the plan doc (in the new `docs/plans/` format it
     establishes — dogfood the format).
   - Run **ce-doc-review** on that plan before executing.
   - Execute with **ce-work**. The `/plan*` → `docs/plans/` prompt migration (ST-066)
     is its own story because it loses the ExecPlan Recovery-Ledger mechanism (execution
     state must move to git history) — do NOT fold it into the refit commit.
4. **Board-track findings C and D (handoff §8) — do NOT implement now (PO decision).**
   Create ST-067 (extract `shared/mcpTransport.ts`) and ST-068 (repair-pass: never lose
   a fact silently) with the acceptance criteria from §8. Verify the ID numbers against
   the live board first.
5. If/when the PO greenlights implementing D, prioritise the **visibility** half
   ("N items dropped during repair") over the `message_id` re-grounding half. If
   implementing the MVP fixes, run **ce-code-review** on the changes, and use
   **ce-commit** / **ce-commit-push-pr** to ship with proper `Story:`/`Plan:` linkage.

## Close-out
- Use **ce-compound** to capture any reusable learnings (e.g. the Web-Claude
  claimed-vs-actual reconciliation gotcha; cross-clone handoff pattern).
- Update `FollowUpSessionLog.txt` (replace, ≤40 lines) with the resulting state.

## Rules of engagement
- Gather PO input via the questions tool in focused rounds; post a short context message
  with links before each round.
- Verify any memory/handoff claim against the live repo before acting on it — the whole
  reason this handoff exists is that a prior session's claims didn't match reality.
```

---

## Skill map (quick reference)

| Phase | Compound-engineering skill | Why |
|---|---|---|
| Reconstruct prior sessions | **ce-sessions** | Find what WSL agents actually did vs. the Web Claude narrative |
| Settle governance questions | **ce-brainstorm** | Open "how to run this project" decisions need dialogue, not a unilateral edit |
| Author governance plan | **ce-plan** | Produce the plan in the new `docs/plans/` format (dogfood it) |
| Vet the plan | **ce-doc-review** | Catch contradictions/gaps before executing a governance change |
| Execute | **ce-work** | Structured execution with quality gates |
| Review MVP fixes (later) | **ce-code-review** | Findings C/D touch commit/provenance/privacy paths |
| Ship | **ce-commit** / **ce-commit-push-pr** | Proper `Story:`/`Plan:` linkage the refit mandates |
| Capture learnings | **ce-compound** | Compound the reconciliation + handoff patterns |

> Skill invocation differs by tool (Claude Code slash commands vs. OpenCode). If a skill
> isn't available in the current runtime, follow its intent manually.
