---
name: "Which plugin drives the lifecycle: GSD or Compound Engineering"
summary: "Verdict and grounding on which of the two installed agentic-workflow systems should orchestrate plan → execute → review → ship in this repo, and which is invoked by the other."
asset_type: "investigation"
status: "verdict-recorded-boundary-unwritten"
created: "2026-08-21"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/gsd-ce-lifecycle-drive-direction.md"
---

# Which plugin drives the lifecycle — GSD or Compound Engineering

**Type:** Investigation / tooling-decision evaluation (Tier 2 reference)
**Date:** 2026-08-21
**Question posed:** *"Given that I presently use the Every Inc Compound Engineering plugin. Am considering the GSD and the BD Finster Agentic Dev plugins. How does [the ARCTIC paper] map to them? How, for instance, in the ce-code-review or the ce-create-pull-request prompt do I focus where the human reviewer should focus? And how do I build that into the agentic workflow of the considered plugins."* — narrowed by the PO mid-session to: **drop agentic-dev-team; between GSD and CE, which should drive the other?**

**Verdict:** **GSD drives `discuss → plan → execute → verify → review`. CE is invoked from inside it via `agent_skills`. CE owns `commit → PR` as a mechanical carve-out, not a preference.**

> **Status of this document.** It records a verdict and its grounding. **It changes nothing.** The `CLAUDE.md` boundary section this verdict calls for is *not* written — that edit changes governance, so it needs a board entry, and both WIP slots are occupied (ST-088 In Progress, ST-092 in Review). See [Not done, and why](#not-done-and-why).

---

## TL;DR

- **The real finding is not "which tool" — it is that the drive direction is currently undefined and varies per session.** `CLAUDE.md` names `docs/plans/*.md` the canonical plan format (CE driving), while the ST-088 Phase 3 commit-trailer omission happened under `gsd-execute-phase` (GSD driving). Nothing decides which one starts.
- **Only GSD has machinery to drive the other.** `agent_skills` in `.planning/config.json` maps agent types to skill sets, is consumed by 22 agent types across 38 of 88 workflows — including the entire spine (`discuss-phase`, `plan-phase`, `execute-phase`, `execute-plan`, `verify-work`, `code-review`, `code-review-fix`, `ship`) — and on the Claude runtime a namespaced `global:<plugin>:<skill>` entry is emitted as a **Skill-tool directive**, i.e. GSD actually *runs* the CE skill. CE has no equivalent. Conventions are cheaper to rewrite than machinery that does not exist.
- **But GSD structurally cannot ship this repo.** It cannot know the `Story: ST-NNN` trailer convention, and `gsd-ship` leaves no slot for one. That is a mechanical fact, not a quality judgement, and it is why the shipping tail stays with CE.
- **agentic-dev-team is dropped.** Solo maintainer, ~5.5 months old, major-version churn — and it has no drift or spotlight concept, so it does not deliver the capability that prompted the question.
- **The ARCTIC capability must be built from scratch under any controller.** No open-source implementation of Intent/Drift/Spotlight exists, and the paper's data is legally unreleasable.

---

## Status today — what is actually true

Two systems run concurrently and are **coupled, not merely coexisting**:

| Concern | Owner today | Evidence |
|---|---|---|
| Canonical plan artifact | CE — `docs/plans/*.md`, `artifact_contract: ce-unified-plan/v1` | `CLAUDE.md` Workflow gate; 23 plans, 2026-06-04 → 2026-08-19 |
| Story tracking, WIP limits | CE-adjacent — `.github/planning/story-board.md` | board header, "WIP limit: 1 In Progress · 1 in Review" |
| Phase execution state | GSD — `.planning/` | `.planning/STATE.md`, phase 03 at 88%, last activity 2026-08-16 |
| Review findings | GSD — `.planning/phases/03-*/03-REVIEWS.md` | cited as **"Product authority"** by `docs/plans/2026-08-19-001-fix-st092-node-client-hardening-plan.md:17` |
| Commit / PR / squash | CE + hand | `CLAUDE.md` Merge strategy |

The coupling runs GSD → CE: a GSD-authored review artifact supplies the requirements of a CE plan.

**Governance is silent on half of this.** `CLAUDE.md` contains zero occurrences of "GSD", "get-shit-done", or ".planning/". The system whose output is cited as product authority is undocumented in the file that declares source-of-truth precedence.

**No prior decision exists.** No ADR, investigation, solution doc, issue, or commit message records why the split exists or which system a new story should use. It is status quo, never reasoned. (`docs/design/adr/` — all 14 ADRs are product-architecture; GitHub tracker searched, 30+ PRs, nothing found.)

---

## The decisive asymmetry

**GSD can invoke CE. CE cannot persistently invoke GSD.**

- `agent_skills` is documented at `~/.claude/gsd-core/references/planning-config.md:367` — `{ "<agent-type>": "<skill-set>" }`, or an array of them.
- Three skill forms are supported (`~/.claude/gsd-core/references/agent-skills-bootstrap.md`): project-relative paths, `global:<name>`, and `global:<plugin>:<skill>` — the last **Claude-only**, "skipped with a warning on all other runtimes".
- **Verified at source, not inferred from docs:** in `~/.claude/gsd-core/bin/lib/init.cjs`, `buildAgentSkillsBlock` branches on `isNamespaced` and, when `runtime === 'claude'`, pushes `{ kind: 'directive', name: skillName }` — commented as *"Emit a natural-language Skill-tool directive (not a @-include)"*. The distinction matters: a directive means GSD's subagent **runs** `compound-engineering:ce-code-review`; an include would mean it merely reads CE's prose.
- Coverage is the whole lifecycle, not a corner: 38 of 88 workflow files reference agent-skills injection, including `discuss-phase`, `plan-phase`, `execute-phase`, `execute-plan`, `verify-work`, `code-review`, `code-review-fix`, `ship`. 22 consumer agent types, regression-guarded by `tests/agent-skills.test.cjs`.
- This repo's `.planning/config.json` has `"agent_skills": {}` — **the mechanism is installed and unused.**

CE's composition model is invocation-by-prompt: a CE skill can invoke another skill through the host's skill primitive (this session did exactly that, `ce-brainstorm` → `ce-pov`), but there is no configuration that makes CE reach for GSD, and nothing persists such a choice across sessions.

**Conclusion:** the drive direction that requires building nothing is GSD-drives-CE. The reverse requires inventing the wiring.

---

## The mechanical carve-out — why CE keeps commit and PR

This is the one place the asymmetry reverses, and it is not a matter of taste.

- `CLAUDE.md` makes the `Story: ST-NNN` trailer load-bearing: *"execution progress is derived from git history, not stored in the plan body"* — true only because `git log --grep="Story: ST-NNN"` resolves a story's work.
- **GSD cannot know that convention, by design.** `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md` (2026-08-18, severity **high**): *"No GSD workflow file mentions `Story:` anywhere — correctly so, since GSD ships to many repos and cannot know this one's convention."* A wave-3 executor caught an untrailered commit by luck, with four waves queued behind it.
- **`gsd-ship` has no slot for a repo-mandated trailer.** Core sections are frozen; `ship.pr_body_sections` entries are explicitly *"append-only … rendered after `Key Decisions`"* (`ship.md:272`); and `ship.md:345` emits `gate_status:` alone on the **final line**, *"preceded by a blank line so it parses as a valid trailer"*. That blank line is precisely the separate-final-paragraph condition `CLAUDE.md` warns pushes `Story:` out of git's trailer scope.
- **The failure is already on `main`, verified this session:** `git log -1 --format='%(trailers:key=Story,valueonly)'` returns **empty** for `f19fa47` and `382c291`, and `ST-087` / `ST-047` for `1e15d94` / `5fc4bdf`.
- CE's `ce-commit-push-pr` composes its body under a *"Project PR-body contract"* that reads repo PR templates (`references/pr-description-writing.md`), so it can honour the rule. Its only trailing element is an off-by-default branding badge — **no `Co-authored-by:`** anywhere in `ce-commit-push-pr/` or `ce-commit/`.

So: the system with the better *declarative* PR-section hook is the one that cannot carry this repo's traceability, and the system that can carry traceability has no declarative hook. The seam goes between them.

---

## Why agentic-dev-team was dropped

Kept here so the option is not silently re-opened later.

- **Solo maintainer, ~5.5 months old.** `bdfinst` is the only human contributor (the other committer is a Claude co-committer account); created 2026-03-02, 273 stars.
- **Major-version churn:** 150+ tagged releases across two channels since March 2026, including v12.0.0 → v12.5.0 inside a single week of August 2026.
- **It does not deliver the capability that prompted the question.** `/specs` captures Intent as a genuine first-class field — better than reconstructing intent from a transcript — but there is **no drift and no spotlight concept anywhere in its documentation**.
- Adopting it would replace a working arrangement with a rewrite, to gain an Intent field this repo already has in `docs/plans/` frontmatter.

Its lifecycle design is not the problem; the trade is. `/specs → /plan → /build → /pr` with human approval after `/plan`, a four-persona plan-review swarm, and an auto-fix/re-review loop capped at 5 iterations is a coherent shape worth stealing ideas from.

---

## Verified facts

Kept split by provenance. Project facts come from bounded reads of this repo; external facts from independent fetches this session.

### Project (this repository)

1. `docs/plans/2026-08-19-001-fix-st092-node-client-hardening-plan.md:17` names a GSD artifact **"Product authority"**.
2. `CLAUDE.md` mentions GSD / `.planning/` **zero times**.
3. `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md` (2026-08-18, severity high) — the trailer gap is structural, with a documented printf workaround and a pre-merge audit requirement.
4. `f19fa47`, `382c291` → empty `Story` trailer; `1e15d94`, `5fc4bdf` → parse. Verified by direct `git log` this session.
5. `.planning/config.json:53` — `ship.pr_body_sections` already configured with four PRD-style sections; `agent_skills` present but empty.
6. `.planning/STATE.md` metadata regression 2026-08-15 (`total_phases: 2` vs ROADMAP's 4; `current_phase: 03` exceeding it), fixed 2026-08-18 in `2e94be4`.
7. PR #47 had to be **merged rather than squashed** because its branch mixed ST-088, ST-091 and **GSD bootstrap** commits.
8. No ADR, issue, or commit records the split's rationale.
9. `.github/workflows/ci.yml` triggers only on `main` and PRs targeting `main` — stacked PRs get no CI, so the local run is the only gate.

### External

1. `~/.claude/gsd-core/bin/lib/init.cjs` — namespaced plugin skills emit a Skill-tool **directive** on the Claude runtime. *(Local read of the installed candidate's own source.)*
2. GSD `agent_skills` injection reaches 38 of 88 workflows / 22 consumer agent types. *(Local read.)*
3. `gsd-build/get-shit-done` is **archived**; live development is `open-gsd/gsd-core` (pushed 2026-08-21, 107 open issues).
4. **GSD issue #991** ("code-review workflow does not inject configured agent_skills") is **real and CLOSED** — fixed by PR #1005, merged **2026-06-10**. Any argument treating it as open is stale.
5. `docs/ship-pr-body-sections.md` and `docs/CONFIGURATION.md` both exist and match the local install.
6. agentic-dev-team: created 2026-03-02, last push 2026-08-09, 273 stars, sole human contributor, 150+ releases. Requires `jq`, `gh`, `python3`.
7. **No documented case of anyone running GSD and CE together in one repo.** Genuine not-found, not a search gap.
8. **ARCTIC is Meta-internal research** (arXiv 2607.29516, Maddila et al., Meta + Concordia). No repo, no released code; the underlying data *"cannot be legally released even in anonymized form."* No open-source Intent/Drift/Spotlight implementation and no Claude Code plugin producing a human-review-focus packet exists.
9. ARCTIC's own numbers, verified verbatim against the paper: human reviewers 44.4% correctness/reliability, 19.2% maintainability, 19.1% security; AI reviewers invert this (best-practices 30.8% vs humans' 7.2%; security 2.0%). Spotlight is 3.3× more likely than the AI-code-review baseline to land a top-5 finding on a real defect's true location, at ~5× fewer tokens and 6× lower latency. Drift scoring is 0–100 across five ordinal buckets: 64.4% exact-bucket accuracy but QWK 0.907, with middle buckets weak (Moderate F1 0.341, Significant F1 0.409) against strong extremes (Perfect 0.889, Major 0.812). Paper's own limitations: a single engineering environment, and several evaluations rely on LLM-as-judge.

### Single-source, treat as softer

- CE's composition posture (*"a discipline you bolt onto"* rather than a runtime that must own the loop; viable solo but paying off *"once you are shipping several agent-written changes a week"*) rests on one third-party comparison article (theaiengineer.substack.com, 2026), not on CE's own documentation.
- CE's plugin inventory figures ("36 skills and 51 agents", "123+ releases") come from that same single source and were not confirmed against a release tag.
- agentic-dev-team's absence of drift/spotlight was established from its README and GETTING-STARTED only, not an exhaustive docs-tree read.

---

## Conditions — the verdict holds only if

1. **`CLAUDE.md` gains a boundary section.** GSD owns `.planning/` phase execution, verification and review artifacts; CE owns `docs/plans/`, the board, and **commit + PR creation, because only it can honour the `Story:` trailer contract**. One paragraph. Its absence is what let both incidents happen.
2. **`agent_skills` is actually populated** — e.g. `gsd-code-reviewer` → `global:compound-engineering:ce-code-review`. An empty map means the composition is aspirational; today every session re-improvises the seam.
3. **The trailer audit becomes mechanical, not remembered** — `git log -1 --format='%(trailers:key=Story,valueonly)'` on every squash, which `CLAUDE.md` already prescribes and nothing enforces.
4. **If the ARCTIC handoff stage gets built**, it hangs off CE's PR stage reading `.planning/` + `docs/plans/` as the intent source — **not** off `gsd-ship`'s `pr_body_sections`, despite that being the mechanically prettier hook. Condition 3's failure mode is exactly what routing it through `gsd-ship` would institutionalise.

---

## Reversal trigger

Flip to full consolidation if **`.planning/` and `docs/plans/` ever disagree about a shipped requirement** rather than about metadata — that turns the split from a traceability cost into a correctness one. Also revisit if `gsd-core` adds a configurable commit/PR trailer hook, which would remove the single fact that keeps commit and PR with CE.

---

## Not done, and why

All four conditions are filed as **ST-094** (Backlog, `.github/planning/story-board.md`), which carries the acceptance criteria and a detailed handoff.

- **The `CLAUDE.md` boundary section (condition 1) is not written.** It changes governance, which `CLAUDE.md`'s own workflow gate says requires a board entry — and WIP is full (ST-088 In Progress, ST-092 in Review). It needs a story, not a drive-by edit.
- **`agent_skills` (condition 2) is not populated** — same reason; it changes how every GSD subagent behaves. Verified empty this session: `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills gsd-code-reviewer` exits 0 with an empty block.
- **Nothing about the ARCTIC handoff capability is scoped here.** That was a separate deliverable the PO deferred in favour of this decision; it remains unscoped.
- **ST-066** (migrate VS Code planning prompts to the unified format) has been Backlog since 2026-07-02 and is adjacent — those prompts still target the retired ExecPlan format.

---

## Appendix — the RUP ↔ Compound Engineering mapping, evaluated

**Source:** an opinion piece supplied by the PO in-session on 2026-08-21 (no URL; reproduced in substance below). It maps RUP's four phases onto Compound Engineering's `Plan → Work → Review → Compound` loop — Inception↔exploration, Elaboration↔Plan, Construction↔Work, Transition↔release, with RUP's continuous disciplines mapped onto Review and Compound. It argues Compound Engineering's distinctive contribution is that RUP asks teams to *maintain* artifacts whereas CE asks each completed task to *improve the environment*, proposes a retention rule ("keep a RUP artifact only when it improves a decision, reduces ambiguity, proves a risk, supports traceability, or makes future work easier"), and recommends a synthesis of RUP phases as lifecycle states, CE as the iteration protocol, risk-first sequencing, executable knowledge, and evidence-based phase gates.

**Verdict: sound as conceptual analysis, superseded as a proposal for this repo.**

- **It maps RUP onto CE alone**, treating CE as the lifecycle controller. That is the arrangement this document decides against. Its "sensible combined hierarchy" has CE loops nested directly inside RUP phases with no third system, so it describes a repo without GSD in it.
- **Two of its five synthesis items already exist here under different names.** `.planning/ROADMAP.md` carries four phases, each with an explicit `**Depends on**: Phase N`; Phase 1 is *"Classify and price all 15 retrieval/egress paths; discharge the ADR-016 gate"* — risk-first sequencing with a literal evidence gate — and Phase 4 is *"Prove or report UNPROVEN execution blocking"*. `.planning/config.json` sets `"human_verify_mode": "end-of-phase"` plus a `milestone_branch_template`. Adopting "RUP phases as lifecycle states" as written would add a third vocabulary over a working one.
- **Its stated tension aims at the wrong failure mode.** It warns that RUP becomes artifact-heavy. This repo's problem is the inverse — artifacts that plainly earn their keep but are *ungoverned*, which is the defect this whole document exists to fix. Nothing here fails its retention rule.
- **It carries no mechanism.** Every decision recorded above turned on mechanism: a Skill-tool directive versus a text include, a trailer's position relative to a blank line, frozen section ordering. A mapping that cannot say which tool emits which artifact cannot be executed against.

**Fact-checks of its two repo-specific claims:**

| Claim | Verdict |
|---|---|
| "PR #34 was predominantly an Elaboration iteration" | **Holds.** PR #34 is *"ST-084 Stage 1: Workflow Operations host spike — promising with concerns"*, merged 2026-07-31. Genuinely an architecture spike. |
| "the MVP slice in PR #31 should begin the move into Construction" | **Wrong.** PR #31 is *"AWCP spec evaluation + ADR-013 platform/product definitions (ST-081)"*, merged to `main` 2026-08-01 — spec evaluation and definitional ADR work, i.e. Inception/Elaboration, not an MVP slice. The sequence is also inverted: PR #34's base branch was `claude/ai-memory-spec-evaluation-t6r76j`, PR #31's head — #34 was **stacked on** #31, so #31 is the parent, not the successor. |

**What survives and is worth keeping:**

1. The Elaboration↔Plan correspondence, which is precisely stated and matches how ST-084 actually ran.
2. The *"Compound goes beyond RUP"* distinction — maintain-artifacts versus improve-the-environment. This is the piece's most durable idea and survives every correction above.
3. **The Transition gate — the one actionable item.** *"Move from Construction to Transition only when acceptance and operational criteria are demonstrated"* is sharp here for a reason the piece does not know: `.github/workflows/ci.yml` triggers only on `main` and PRs targeting `main`, so a PR into a feature or integration branch runs **no CI at all**, and ST-092 entered Review under exactly that condition. The repo currently cannot demonstrate operational criteria on the stacked branches that are its common case. Carried into **ST-094** as an open question, since it lands on the same enforcement axis as the `Story:` trailer audit.

**Fairness note.** The piece appears to have been written without knowledge that GSD is live in this repository. Given CE alone, its mapping is largely right; the corrections above are about *this repo's* configuration, not about the author's reasoning.

---

## Method and confidence

Formed via `ce-brainstorm` → `ce-pov` on 2026-08-21. Grounding came from five subagents in **independent contexts** — a repo governance scout, a toolchain scout over the installed `gsd-core` and CE plugin sources, a project-grounding scout, a precedent-and-activity scout (GitHub tracker reachable, 30+ PRs reviewed), and an external-evidence researcher — plus bounded direct reads by the orchestrator for the load-bearing claims (the `init.cjs` directive branch, the `git log` trailer checks, `ship.md`'s ordering).

**No peer models were consulted**; none was requested. Agreement among the scouts counts as independent corroboration because they ran in separate contexts; nothing in this document rests on a claim that only the conversation asserted.

**Reversibility tier: 2** — one-way but bounded. The blast radius is governance documents, planning artifacts and process, not production code.
