---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
story: ST-097
title: "ST-097 — Pivot to GSD, split the board by tense, and ship the first AWCP daily-use slice - Plan"
type: chore
date: "2026-08-23"
origin: "docs/investigations/awcp-strategy-baseline-2026-08.md"
supersedes: "docs/plans/2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md"
---

# ST-097 — Pivot to GSD, split the board by tense, and ship the first AWCP daily-use slice - Plan

## Goal Capsule

**Objective:** GSD drives the long-horizon lifecycle in this repository, with Compound Engineering
invoked from inside it and CE keeping `commit → PR`; the story board stops being the forward queue
without losing a line of delivery history; and the pivot proves itself by driving one real AWCP
slice — `awcp status` plus session capture — that makes the control plane answer *"what am I doing?"*
from a terminal for the first time.

**Means:** Supersede the committed requirement that forbids this, in writing and first. Split the
board by **tense** rather than retiring it: 54 historical entries freeze in place and keep minting
`ST-NNN`; 33 forward entries migrate to `ROADMAP.md` as `999.x`. Flip the GSD runtime so the
CE-inside-GSD mechanism actually executes. Then run the AWCP slice **through** the new workflow, so
the pivot's first output is evidence rather than assertion.

**Authority hierarchy:** [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md)
and its six decisions bind, **as amended by this plan's KTD1–KTD5**. This plan **supersedes**
[ST-096's plan](2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md) on sequencing —
see KTD5. [CLAUDE.md](../../CLAUDE.md) governs conventions and merge rules; U6 amends it.
[`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md) outranks everything on the
host question and constrains U7 to zero DDL.

**Board state.** ST-097 is filed on the board it is retiring — the last entry that board receives as
a queue. Verified free on `main` and across all local branches before filing. It takes **In Progress**
only after U2 lands; until then it is Backlog, because ST-088 holds the slot and U2's whole purpose
is to clear the branch state first.

**Stop conditions:**
1. Stop if U1's supersession cannot be written — if the PO does not agree to reverse
   `REQUIREMENTS.md:66` in writing, the rest of the plan is unauthorised.
2. Stop if U3's runtime flip does not produce an **observed** CE-skill execution inside a GSD agent.
   A config diff is not the proof; a skipped-with-warning line means the pivot's mechanism is absent
   and U4 onward would be building on nothing.
3. Stop if `ST-NNN` minting cannot be demonstrated after U4 — the ID scheme is load-bearing for
   `git log --grep`, and a mint that only works by memory is the failure this repo has already had
   twice.

---

## Product Contract

**Who this is for:** one operator running several concurrent AI-assisted development sessions across
repositories and machines, who currently cannot answer *"what is each session doing, and which one
needs me?"* without opening a browser and pasting a bearer key.

**The problem, in the repo's own evidence:** the AWCP module is well-built and not usable. The
increment ladder in [`awcp-spec-evaluation.md`](../investigations/awcp-spec-evaluation.md) has been
**climbed inverted** — increment 7+'s web dashboard and remote spooling shipped and are the most
hardened code in the module, while increments 1–3's daily-use affordances are absent. The spec names
`awcp status` as *"the first daily-use win"* (`:141`) and it does not exist. All five `awcp`
subcommands are POSTs (`server/scripts/awcp.ts:278-370`).

**Requirements:**

- **R1** — An operator can ask, from a terminal, what work exists and what needs them, without a
  browser and without pasting a UUID.
- **R2** — A coding session opens and closes its own AWCP run without the operator typing a command.
- **R3** — The forward queue lives in `.planning/ROADMAP.md`; GSD sequences it without a WIP limit,
  as a sequential drive toward a working product.
- **R4** — Delivery history is preserved intact, satisfying the requirement U1 supersedes rather than
  merely overriding it.
- **R5** — `ST-NNN` continues to be minted and every commit for board-tracked work continues to carry
  the `Story:` trailer.
- **R6** — A CE skill demonstrably executes inside a GSD-spawned agent.
- **R7** — No file that references the board is left pointing at a role the board no longer has.

**Success criteria:** `awcp status` prints the current attention queue; a session start creates a run
with no human keystroke; `git log --grep="Story: ST-097"` resolves this story's own work; `grep -rl
story-board` finds no file describing it as the queue.

**Scope boundaries** are in their own section below.

---

## Key Technical Decisions

**KTD1 — The runtime flips in `.planning/config.json` to `claude`.**
*(session-settled: user-directed — chosen over `GSD_RUNTIME=claude` per session and over deciding it
inside the slice: the install and the config already disagree, so this is a correction, not a
preference.)*
`~/.claude/skills/` holds **71 GSD skills** installed for the Claude runtime, `~/.claude/agents/`
holds 34 GSD agents, and **zero** GSD commands are materialised into `.github/prompts/` for the
Copilot runtime. Meanwhile `buildAgentSkillsBlock` (`~/.claude/gsd-core/bin/lib/init.cjs`) emits a
Skill-tool directive for a namespaced `global:<plugin>:<skill>` **only** when `runtime === 'claude'`;
otherwise it warns *"requires a Skill-tool-capable runtime (claude) — skipping on runtime `copilot`"*.
So today neither system can invoke the other. **Blast radius is real and must be measured, not
assumed:** `runtime` has ~118 references across `bin/lib/` and decides the global config home, the
skills base (`getGlobalSkillsBase`), where commands materialise, agent-install location, and model
resolution.

**KTD2 — The board splits by tense; it is not retired.**
*(session-settled: user-directed — the PO asked for board stories to move into `ROADMAP.md` aligned
to the AWCP focus and invited a better solution; this is that solution, chosen over wholesale
retirement and over a generated-view board.)*
The 48 Done + 6 Archived entries **freeze in place** as an append-only historical ledger. Only the 33
Backlog entries migrate. This is not a compromise — it is what makes U1's supersession honest, since
the superseded requirement's stated reason is *"must preserve delivery history."* It also matches the
repo's own migration precedent: ExecPlans were frozen, *"not retroactively converted"*.

**KTD3 — `ST-NNN` survives, and the frozen ledger keeps minting it.**
*(session-settled: user-directed — chosen over minting from `ROADMAP.md`, over retiring `ST-NNN` for
GSD phase IDs, and over adding a mechanical check before deciding.)*
Next ID = highest in the ledger + 1, **verified free across `main` and every local branch** before
use. GSD's `999.x` allocates *phase* numbers and is not a substitute. The ledger therefore keeps
exactly one active job after the split, and that job is the reason `CLAUDE.md`'s claim that
*"execution progress is derived from git history"* stays true.

**KTD4 — The AWCP slice is `awcp status` + session capture, and it adds no DDL.**
*(session-settled: user-directed — chosen over arming the completion gate, over making the node
pipeline visible, and over handoff/current-work generation.)*
`buildOverview()` (`server/src/workflow/readModel.ts:76`) already returns `OverviewView` — every
active packet with its runs, checkpoints, decisions, criteria and a flattened attention queue — and
`GET /api/workflow/overview` (`api.ts:557`) already serves it to either credential. The slice is a
client. **Zero migrations**: `ADR-016:57` bars schema work that assumes the host, and while
migrations 003/004 landed under ST-088 as sanctioned spike evidence, a usability slice cannot carry
that justification.

**KTD5 — This plan supersedes ST-096's sequencing, and its branches land first.**
*(session-settled: user-directed — chosen over amending ST-096 in place and over keeping both stories
with a boundary.)*
ST-096's U6 resolves the Backlog conflict *"by keeping all three entries"* and its Scope Boundaries
bar rewriting `.planning/` now. Both are superseded here. But its **branches must land or be lifted
before the board is touched**: three branches each hold a distinct entry at the top of `## Backlog`,
and editing the file first turns a resolvable three-way text conflict into silent content loss.

---

## High-Level Technical Design

Two independent changes that meet at the end, plus a governance change that authorises both.

```
U1  supersede REQUIREMENTS.md:66 + 3 ROADMAP pointers      ← authorises everything below
        │
U2  land/lift docs/gsd-ce-drive-direction + docs/awcp-strategy-baseline
        │                                                    (three-way Backlog conflict,
        │                                                     resolved by keeping all entries)
        ├───────────────────────────┬──────────────────────────┐
        ▼                           ▼                          ▼
U3  runtime: claude            U4  board split            U7  AWCP slice
    agent_skills populated         54 freeze + mint           awcp status  (GET /overview)
    claude_md_path resolved        33 → ROADMAP 999.x         session hooks (open/close a run)
    load PROVEN, not assumed       criteria → phase SPEC      no DDL, no server change
        │                           │                          │
        └───────────┬───────────────┘                          │
                    ▼                                          │
U5  doc sweep — 77 files                                       │
U6  CLAUDE.md workflow gate + .planning/ precedence tier        │
                    │                                          │
                    └──────────────────┬───────────────────────┘
                                       ▼
                         U7 runs THROUGH the new GSD loop
                         → the pivot's first output is evidence
```

**The load-bearing structural choice:** U7 is not merely the last unit. It is the pivot's proof.
Running the AWCP slice through the new GSD-driven loop — discuss → plan → execute → verify → review
under GSD, commit and PR under CE — is what distinguishes "the config was changed" from "the
workflow works." ST-095's criterion 5 already demands this shape: *"configured" and "executed" are
different claims.*

**The `awcp status` design.** `OverviewView` has exactly the fields the render needs, so the CLI
addition is a `get()` helper beside the existing `post()` (`awcp.ts:167`) plus a formatter. Credential
resolution is unchanged — `resolveApiKey()` (`awcp.ts:159`) prefers `AWCP_AGENT_API_KEY` and falls
back to `MEMORY_API_KEY`, and `/overview` accepts either. Note the CLI's own docblock
(`awcp.ts:373-387`) explains why four supervision subcommands are absent; `status` is a **read**, not
a supervision action, so it does not breach that boundary — record the reasoning there so the next
reader does not have to re-derive it.

**The capture design.** Hooks shell out to `awcp`, so the server is untouched. The hook file is a
**committed** `.claude/settings.json` (today `.claude/` holds only `settings.local.json` and
`worktrees/`, and `.claude` is absent from `.gitignore`) — which makes the capture shared rather than
one machine's private setup, and makes it reviewable.

---

## Implementation Units

### U1 — Supersede the requirement that forbids this *(no dependencies; must be first)*

`.planning/REQUIREMENTS.md:66` currently reads:

> | Replacing the existing story board or `docs/plans/` | GSD tracking supplements current governance and must preserve delivery history |

and `.planning/ROADMAP.md` repeats it at `:7`, `:17`, and `:175` (*"`docs/plans/` and the story board
remain the canonical delivery record"*).

Write a **dated supersession** at each of the four sites naming this story, stating what changed and
why, and — critically — recording that the delivery-history reason **is honoured, not overridden**,
by KTD2's freeze. A silent delete is barred: ST-096's KTD5 states the rule this would break.

**Files:** `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`.

### U2 — Land or lift the two open branches *(depends: U1 authorised)*

`docs/gsd-ce-drive-direction` (4 commits) and `docs/awcp-strategy-baseline` (5 commits, this plan's
own home) are local-only and each holds a distinct top-of-Backlog entry, as does `main`'s ST-094.

**Do not merge `docs/st-093-entity-queue-isolation`** — its merge-base is 3 commits behind `main` and
the diff sums to 175 additions / 7,860 deletions; the board header records this. Lift content, never
merge that branch.

Resolve the three-way Backlog conflict by **keeping all entries**. Reconfirm ST-095/096/097 numbering
at merge.

### U3 — Make CE-inside-GSD actually execute *(depends: U2)*

Three things, and the third is the only one that counts as done:

1. `.planning/config.json` → `"runtime": "claude"` (KTD1). **Measure the blast radius before
   flipping**, not after: config home, skills base, command materialisation, agent install, model
   resolution.
2. Resolve `claude_md_path` — it points at `./.github/copilot-instructions.md`, which `CLAUDE.md`
   itself records as architecturally stale. Governance written into `CLAUDE.md` is otherwise
   invisible to every GSD agent. Pick one: repoint it, carry the boundary in both files, or make
   `.github/copilot-instructions.md` point at `CLAUDE.md` the way `AGENTS.md` does.
3. Populate `agent_skills` (today `{}`) and **prove the load end-to-end**. `node
   ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills <agent>` must emit a directive rather than
   a skip warning — and one real GSD-driven review must show the CE skill having run.

**Carry the trailer contract in the dispatch brief itself, not by reference.** `docs/solutions/conventions/delegate-the-doing-keep-the-checking.md`:
*"For repo-specific conventions a generic agent cannot infer, state them in the brief rather than
trusting that a referenced instruction file will be applied."* Item 2 above is independent proof that
the referenced file is also the wrong file — two reasons for the same rule.

**Files:** `.planning/config.json`, plus whichever governance file item 2 selects.

### U4 — Split the board by tense *(depends: U2; may run parallel to U3)*

**Freeze (54):** Done (48) and Archived (6) stay in `.github/planning/story-board.md`, relabelled as
an append-only delivery ledger. It keeps one active job — minting `ST-NNN` (KTD3).

**Migrate (33):** Backlog entries → `.planning/ROADMAP.md` `## Backlog` as `999.x`, sequenced by AWCP
alignment. Each needs a `.planning/phases/999*` directory (`add-backlog.md`), and promotion runs
through the `gsd-review-backlog` skill.

**Do not migrate ST-088.** It *is* the live `.planning/` milestone already; re-encoding duplicates it.

**Two disciplines that decide whether this migration is worth anything:**

- **Verify before re-publishing.** `verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md`:
  *"a written claim about it is a hypothesis to test — not a fact to act on."* Every migrated entry
  gets a `git log --grep` / tree check first, or the new roadmap launders the board's staleness into
  a fresh record. The board's own ST-093 lift set this precedent.
- **Strip frozen pass-counts.** `verify-worktree-change-against-docker-test-stack.md` §4 names the
  board *by file and line* as carrying this anti-pattern: *"A pass count is invalidated by anyone
  adding a test, including you."* Convert to a failure set plus a reconciliation identity, or drop.

**Acceptance criteria must land where GSD reads them.** `gsd-roadmapper` compresses a phase to a goal
plus 3–5 success criteria; ST-094's six criteria and ST-093's two dense paragraphs cannot survive
that. Route them to per-phase `SPEC.md`/UAT artifacts.

### U5 — Sweep the 77 references *(depends: U4, same change)*

`grep -rl 'story-board'` returns **77 files**, including `README.md`,
`.github/copilot-instructions.md`, all four `.github/prompts/*`, `governance-review.prompt.md` (which
exists specifically to *detect* board drift), `.planning/PROJECT.md`, and `.planning/STATE.md`.

**This ships in the same change as U4, not after.** The precedent is ST-066: the last workflow
migration stranded four prompt files pointing at a dead format, and they have sat in Backlog since
2026-07-02 behind a `CLAUDE.md` caveat paragraph. Nothing mechanical will catch a repeat — the board
has no frontmatter, is absent from the asset catalog, and no CI job or git hook references it.

### U6 — Amend the governance that names the board *(depends: U4)*

- **`CLAUDE.md` § Workflow gate** — rewrite the minting algorithm (*"next available `ST-NNN`"*) to
  name the ledger, drop the WIP-limit clause, and describe sequential drive.
- **`CLAUDE.md` § Source-of-truth precedence** — add a `.planning/` tier. A live conflict is already
  unresolvable without it: `docs/plans/2026-08-19-001-...:17` cites a `.planning/` review artifact as
  *"Product authority"* while the precedence list does not mention `.planning/` at all.
- **Decide squash-vs-merge deliberately.** `CLAUDE.md`'s squash rationale is *"PRs here are
  story-scoped: one PR ≈ one `ST-NNN`"*. GSD phases are milestone-scoped and multi-plan, which is
  closer to the section's own stated exception for integration branches. Precedent exists — PR #47
  was *"merged rather than squashed, per CLAUDE.md's multi-story exception."*

### U7 — The AWCP slice: `awcp status` + session capture *(depends: U3; run through the new loop)*

**U7a — `awcp status`.** Add a `get()` helper beside `post()` and a `status` subcommand rendering
`GET /api/workflow/overview`: per packet, its runs with age, and the flattened attention queue with
its reason. Attention reasons come from `evaluateAttention()`'s five rules — `decision-required`,
`blocked`, `stale`, `ended-without-checkpoint`, `ready-for-review`.

**U7b — Session capture.** A committed `.claude/settings.json` with SessionStart/SessionEnd hooks
shelling out to `awcp run` and `awcp end-run`, persisting the run id where the session can find it.

**Files:** `server/scripts/awcp.ts`, `.claude/settings.json`, `server/tests/awcp-cli.test.ts`.

**Known wart to leave alone, and say so:** `PacketStatus` declares `in_progress` and `blocked`
(`types.ts:40`) and **no code path can write either** — `setPacketStatus` was deliberately deleted
(`api.ts:6-10`). So `status` will show `open` for everything in flight. Render honestly rather than
inferring a status the server does not hold; fixing it needs a new named route and belongs in its own
story.

---

## Verification Contract

| Unit | Check | Passes when |
|---|---|---|
| U1 | `grep -n 'supersede' .planning/REQUIREMENTS.md .planning/ROADMAP.md` | All four sites carry a dated supersession naming ST-097 |
| U2 | `git log --oneline main..` on each branch; board diff | All three Backlog entries present after merge |
| U3 | `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills <agent>` | Emits a **directive**, not a skip warning — plus one observed CE-skill execution inside a GSD agent |
| U4 | `git log --grep` per migrated entry; `grep -c '999\.' .planning/ROADMAP.md` | 33 entries present and each verified against the tree before migration |
| U4 | Mint a new `ST-NNN` from the ledger | Allocated, and free across `main` and every local branch |
| U5 | `grep -rl 'story-board'` | No file describes the board as the forward queue |
| U7a | `deno test server/tests/awcp-cli.test.ts` | `status` renders a seeded overview, including a non-empty attention queue |
| U7b | Start a session; `awcp status` | A run exists that no one typed a command to create |
| All | `git log -1 --format='%(trailers:key=Story,valueonly)'` per commit | Returns `ST-097` |

**Test scenarios for U7a**, specific enough not to be invented at implementation time: empty
overview renders a "nothing active" line rather than a blank; a packet with an open blocking decision
renders `decision-required`; a run whose `last_event_at` exceeds 30 minutes renders `stale`; a packet
with all required criteria evidenced renders `ready-for-review`; a missing API key exits non-zero with
the same message shape `resolveApiKey()` already uses; an unreachable server exits non-zero without a
stack trace.

**Run the server suite for U7 only** — it is the sole unit touching `server/`. U1–U6 change no server
code, and both ST-095 and ST-096 say explicitly not to run it for governance work.

```
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env \
  --allow-read --allow-write=/tmp --allow-run=deno,git tests/awcp-cli.test.ts
```

## Definition of Done

`awcp status` answers "what am I doing?" from a terminal; a session opens its own run unprompted; the
forward queue is in `ROADMAP.md` and the history is intact and still minting; a CE skill has been
**observed** running inside a GSD agent; no file misdescribes the board; and every commit carries its
trailer.

## Scope Boundaries

**Out of scope, each for a reason:**

- **Any new migration.** `ADR-016:57`; a usability slice cannot claim the spike exemption (KTD4).
- **Attaching `run_events` to runs.** The highest-value gap — a heartbeating node still flags `stale`
  because migration 004 has no `run_id`/`packet_id` — is the one most entangled with schema. A
  read-time join is possible without DDL; it is a separate story.
- **Arming the completion gate.** Real (criteria are curl-only, so zero criteria means every packet
  completes unconditionally), and deliberately not this slice.
- **Horizon B–D milestone content.** Still behind ST-088 and ADR-016.
- **Fixing `PacketStatus`.** Needs a new named route; `api.ts:6-10` warns against adding those
  casually.
- **Retiring `docs/plans/`.** The superseded requirement named it alongside the board; only the board
  half is superseded here.
- **Pushing anything.** Every branch in this work has been kept local by standing instruction.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `.planning/` is contested — `STATE.md` has regressed **three** times, once uncommitted in the tree right now | Establish single-session ownership of `.planning/` before U1; verify STATE.md afterwards by running a GSD state query, not by reading the file |
| The runtime flip breaks the Copilot path this repo still documents | Measure the ~118 references first; U6 documents which path is supported afterwards |
| U4 migrates stale claims into a fresh record | Per-entry `git log --grep` verification before migration; strip frozen pass-counts |
| Deleting the board's queue role breaks something silently | Nothing mechanical depends on it — which is the danger. U5 ships with U4; consider converting one trailer property to a hook or CI check while it is cheap |
| A fourth story-number collision | ST-097 verified free on `main` and all local branches; reconfirm at merge |
| Squash rationale dissolves and merges lose history | U6 decides squash-vs-merge explicitly rather than inheriting |
| `.github/workflows/ci.yml` runs **nothing** on a PR into a feature branch | Local run is the only gate; ST-095's open question (d) — the Transition gate — should be resolved inside U6 |

## Open Questions

**OQ1 — Does the ledger keep `ST-NNN` forever, or until GSD phase IDs mature?** KTD3 settles the
near term. The long-term answer depends on whether anything ever enforces the trailer mechanically.

**OQ2 — Where do the 33 migrated entries' non-AWCP members go?** Several are memory-platform stories
(ST-019 Obsidian synthesis, ST-077 Qwen retrieval, ST-091 .NET SDK) with no AWCP alignment. `999.x`
holds them, but a roadmap sequenced toward a working AWCP product will never promote them. Decide at
U4 whether that is acceptable parking or needs a second destination.

**OQ3 — Does session capture belong in a committed `.claude/settings.json`?** It makes capture
shared and reviewable, but binds the repo to one harness. A neutral script invoked by per-harness
config is the alternative.

## Sources & Research

- [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md) — the six decisions
- [`awcp-external-evidence-import-2026-08.md`](../investigations/awcp-external-evidence-import-2026-08.md) — the two-axis capability contract
- [`gsd-ce-lifecycle-drive-direction.md`](../investigations/gsd-ce-lifecycle-drive-direction.md) — drive direction, and the runtime correction
- [`awcp-spec-evaluation.md`](../investigations/awcp-spec-evaluation.md) `:138-147` — the increment ladder
- [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md) `:57` — the host gate
- `docs/solutions/conventions/delegate-the-doing-keep-the-checking.md` — the operating manual for CE-inside-GSD
- `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md` — the trailer carve-out, and the named failed fix
- `docs/solutions/workflow-issues/verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md` — verify before re-publishing
- `docs/solutions/workflow-issues/verify-worktree-change-against-docker-test-stack.md` §4 — the frozen-pass-count anti-pattern, naming the board
- `docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md` — criteria must land where they are read
- `server/src/workflow/readModel.ts:54-80`, `api.ts:557`, `attention.ts:44`, `types.ts:40`, `server/scripts/awcp.ts:159-389`
- `~/.claude/gsd-core/bin/lib/init.cjs` `buildAgentSkillsBlock`; `~/.claude/agents/gsd-roadmapper.md`; `~/.claude/gsd-core/workflows/add-backlog.md`, `complete-milestone.md`
