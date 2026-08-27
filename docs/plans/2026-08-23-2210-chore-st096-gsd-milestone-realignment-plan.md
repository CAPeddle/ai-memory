---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: po-strategy-round-2026-08-23
execution: docs
story: ST-096
title: "ST-096 — Realign the GSD milestone structure onto the AWCP capability horizons - Plan"
type: chore
date: "2026-08-23"
origin: "docs/investigations/awcp-strategy-baseline-2026-08.md"
---

# ST-096 — Realign the GSD milestone structure onto the AWCP capability horizons - Plan

## Goal Capsule

**Objective:** The sequence from "ST-088 is in flight" to "a Horizon B–D milestone exists and is
being executed" is written down, in order, with each step's precondition named — so that no step is
taken on the wrong side of the ADR-016 host decision and no later milestone is planned against
records that are already known to be stale.

**Means:** Sequencing, not requirements. This plan schedules four things that must happen in order
and states what each one may not assume. It authors **no** Horizon B–D requirement and **no**
ROADMAP content — baseline decision 3 places that after ST-088 closes, and writing it now would be
the same error the strategy synthesis was corrected for.

**Authority hierarchy:** [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md)
is the origin and its six decisions bind. [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md)
outranks everything here on the host question. [CLAUDE.md](../../CLAUDE.md) governs conventions,
merge rules and the workflow gate. Where this plan and the ST-096 board entry disagree on a verified
fact, this plan wins.

**Board state — deferred deliberately.** ST-096 stays in **Backlog** and is *not* moved to In
Progress: ST-088 holds the single In Progress slot, and this story is blocked on it by construction.
The board-side `Plan:` field **is** filled, so the cross-link is complete in both directions. This
follows ST-094's precedent, where a plan sits on disk with live `story:` frontmatter while the board
move waits on PO instruction.

**Stop conditions:**
1. Stop if executing any unit would require assuming Candidate A before ADR-016 concludes.
2. Stop if `.planning/` must be edited by a session that does not own it — see Risks.
3. Stop if the ADR-016 verdict is neither "Accept A", "Accept A with required changes", nor
   "Recommend C"; the conditional shapes below cover only those three.

---

## Product Contract

**Who it is for:** whoever plans the first post-ST-088 AWCP milestone — most likely a future session
with none of this conversation in context.

**What they get:** an ordered sequence with preconditions, two conditional milestone shapes keyed on
the ADR-016 verdict, and an explicit list of what may not be assumed.

**What "done" looks like:** a Horizon B–D milestone exists in `.planning/`, derived from requirements
in the normal GSD way, containing the two verified external constraints as named requirements, and
resting on reconciled rather than stale planning state.

**Why it is worth doing at all:** the realignment produces no user-visible capability. It earns its
place because every later AWCP milestone is planned wrongly without it, and because two of its steps
are corrections to records that are *already* wrong today.

---

## Key Technical Decisions

**KTD1 — Horizons are milestones, not phases.** `gsd-roadmapper` derives phases from requirements,
demands 100% coverage with each requirement in exactly one phase, and treats `granularity: standard`
as guidance toward 4–6 phases, folding thin ones into neighbours. Nine horizons could not survive
that as phases. `new-milestone` restarts phases at 1, which is the right granularity for a horizon.
*Declined:* compressing A–I into one roadmap — it buries the sequencing inside phase names.

**KTD2 — The first new milestone is B–D, not A–D.** Horizon A *is* the in-flight ST-088 milestone.
It keeps its own PROJECT/REQUIREMENTS/ROADMAP and finishes normally. *Declined:* re-scoping the live
milestone to span A–D, which would mean rewriting a milestone mid-flight and planning B–D before the
host decision they depend on.

**KTD3 — Host-neutral until ADR-016 concludes, via contract-first/storage-disposable.**
`awcp-spec-evaluation.md` already carries the mechanism: packet, checkpoint and event **contracts**
are versioned and durable; **storage** is disposable until the host settles. That rule was written
for exactly this situation and is reused rather than reinvented.

**KTD4 — The runtime gate is a prerequisite, not an acceptance criterion.** `.planning/config.json`
sets `"runtime": "copilot"`; `buildAgentSkillsBlock` (`~/.claude/gsd-core/bin/lib/init.cjs`) emits a
Skill-tool directive for a namespaced `global:<plugin>:<skill>` **only** when `runtime === 'claude'`,
otherwise warning and skipping. So the GSD-invokes-CE structure this realignment assumes is **inert**
until it resolves. `GSD_RUNTIME` outranks `config.runtime`, so the likely resolution is that runtime
is a property of the session's host rather than of the repository.

**KTD5 — Web-UI primacy is recorded as superseding, not applied silently.** Reversing a recorded
decision inside a new roadmap is how decisions become drift. The reversal is narrow: surface
*ranking* changes, horizon *order* does not.

---

## Implementation Units

### U1 — Reconcile the planning-state lag (precondition: none; must complete **before** ST-088 Phase 4)

Two derived records disagree with shipped evidence:

| Record | Says | Truth |
|---|---|---|
| `.planning/ROADMAP.md:111` | `- [ ] 03-06-PLAN.md` | Wave 6 shipped in `b32b6ab` (PR #50) |
| `.planning/REQUIREMENTS.md` traceability | NODE-01/02/03 **Pending** | `840a90c` — *"record phase 2 completion — NODE-01, NODE-02, NODE-03 discharged"* |

**Rule to apply:** where derived GSD status and the findings document plus merged PRs disagree, the
findings and PRs win.

**Ownership caveat, and it is load-bearing.** `.planning/` is contested — a concurrent session has
held `STATE.md` dirty in the shared working tree throughout this work, and this file has regressed
**twice** (2026-08-15, fixed in `2e94be4`; and again, uncommitted, on 2026-08-22). **This unit is
assigned to whoever runs ST-088 Phase 4, not performed by the session that wrote this plan.** It is
named here so Phase 4 does not have to discover it.

### U2 — ST-088 Phase 4 runs to its own criteria (precondition: U1)

Not re-planned here. Its four success criteria are in `ROADMAP.md:121-140` and its acceptance
pre-condition is in `ADR-016:98`. This plan **depends on its verdict and does not anticipate it.**

Output that matters downstream: ADR-016 leaves Proposed/Conditional and records one of three
verdicts.

### U3 — Discharge ST-095's prerequisites (precondition: U2 complete; may run in parallel with U2's write-up)

ST-095 carries the CE/GSD boundary work. Three of its criteria are prerequisites of U4 rather than
independent goals:

1. **The runtime gate** (KTD4) — decide between `GSD_RUNTIME=claude` per session, flipping the
   project config, and accepting the mechanism as Claude-Code-only. Not mechanical: `runtime` has
   ~118 references across gsd-core's `bin/lib/` and decides config home, skills base, command
   materialisation, agent install and model resolution.
2. **`claude_md_path`** — it points at `.github/copilot-instructions.md`, so a boundary written into
   `CLAUDE.md` alone is invisible to every GSD-spawned agent.
3. **The boundary section itself** — which system drives, and where the seam at commit/PR sits.

**Sequencing note:** ST-092's entry is precedent that a completed one-pass story may enter **Review**
directly when that slot is open. ST-095 therefore need not queue behind the In Progress slot.

### U4 — Close the milestone and open Horizon B–D (precondition: U2 and U3)

`/gsd-new-milestone`, with:

- **Requirement categories:** Horizon B (provider-neutral session awareness), Horizon C (continuity
  across machines and sessions), Horizon D (attention-first working product).
- **Phases derived from requirements** in the normal way — 4–6 for `granularity: standard`, **not**
  one phase per horizon.
- **Two verified external constraints as named requirements**, not background:
  - **The two-axis capability contract.** *Accepted vs delivered* for control verbs; *authoritative
    vs observed* for state reads. Grounded in two independent measurements: OpenCode 1.18.18 returns
    `200` for a `delivery=steer` it never delivers, and Codex reports `notLoaded` — a real, valid
    status — for a thread actively running in another app-server process. Neither is an error;
    neither is detectable from the response alone.
  - **Managed-runtime-or-nothing for live state.** A discovered session yields association, history
    and resumability, never live state. Documented, not conjectured: `thread/loaded/list` returns
    threads loaded *in memory*, and neither it nor `thread/list` reports across process instances.
- **PROJECT.md Out of Scope** gains the demoted items (decision 5) and the unlocated ones
  (workspace-enrolment invariant), each with what would bring it back in.

### U5 — Record the supersessions (precondition: U4)

- `awcp-spec-evaluation.md` gains a dated note that web-UI primacy supersedes the increment-7
  deferral, with the reason. Horizon order unchanged.
- `awcp-strategy-baseline-2026-08.md` frontmatter `status:` moves off
  `baseline-confirmed-milestone-unwritten`.
- **`ADR-013:116` is addressed here or explicitly left again.** It states *"the host decision places
  AWCP in the same codebase"* — stale against ADR-016 and, by U2, now decidable. The baseline left it
  unedited on purpose because Phase 4 may give it its final wording; after Phase 4 that reason
  expires.

### U6 — Land the branches (precondition: U4)

`docs/gsd-ce-drive-direction` and `docs/awcp-strategy-baseline` merge before or with the new
milestone. **The board conflict is three-way** — `main`'s ST-094, this family's ST-095, and ST-096
all insert at the top of `## Backlog`. It resolves by **keeping all three entries**; numbering is
reconfirmed at merge.

---

## Verification Contract

| Unit | Check | Passes when |
|---|---|---|
| U1 | `grep -n '03-06' .planning/ROADMAP.md`; read the traceability table | Neither record contradicts `b32b6ab` / `840a90c` |
| U3 | `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills <agent>` | Emits a directive rather than a skip warning, under the chosen runtime resolution |
| U4 | The roadmapper's own coverage validation | 100% of new requirements mapped to exactly one phase; phase count consistent with `granularity: standard` |
| U5 | `grep` for the supersession note and the frontmatter `status:` | Both present and dated |
| U6 | `git log -1 --format='%(trailers:key=Story,valueonly)'` on each squash | Non-empty |

**Do not run the Deno server suite.** This story changes no server code, and CLAUDE.md's own
guidance is to match verification to deliverable scope.

## Definition of Done

A Horizon B–D milestone exists in `.planning/`, derived from requirements, resting on reconciled
planning state, containing both verified constraints as named requirements, with the supersessions
recorded and the branches landed.

## Scope Boundaries

**Explicitly out of scope, each for a stated reason:**

- **Authoring Horizon B–D requirements or ROADMAP content now** — baseline decision 3.
- **Editing `.planning/` from a session that does not own it** — concurrent-session hazard; same
  class as the two story-number collisions already suffered.
- **Assuming Candidate A anywhere** — `ADR-016:88`.
- **Re-planning ST-088 Phase 4** — it has its own criteria; this plan consumes its verdict.
- **Horizons E–I** — the second milestone, per the PO's two-milestone split. Not planned here.
- **The ARCTIC human-review-handoff capability** — still unscoped, and it hangs off the completion
  gate rather than off this realignment.
- **Pushing anything** — every branch in this work has been kept local by standing instruction.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `.planning/` edited concurrently, losing U1's reconciliation | U1 is assigned to the Phase-4 owner, not executed from a non-owning session |
| A fourth story-number collision | ST-096 verified free on `main` and all thirteen local branches before filing; reconfirm at merge |
| The three-way Backlog conflict resolved by dropping an entry | Stated in U6 and in the board entry: keep all three |
| Horizon H quietly re-enters as an unqualified goal | `architecture_analyser` analyses **C++ and C# only**; `server/` is Deno/TypeScript. It must choose: .NET-side only, an unscoped TS front-end, or deferral |
| §18's local-model claim cited as evidence-backed | Its five named benchmark artifacts are unlocated; the capability-matrix idea stands on design merit only |
| Codex findings treated as durable | The app-server command and WebSocket transport are both documented **experimental**; `openai/codex` #21743 is open with no maintainer position |

## Open Questions

**OQ1 — the one genuine branch point, deliberately not pre-answered.** ADR-016's verdict changes the
B–D milestone's shape:

- **Accept A (or A with required changes)** → the co-tenancy tax enters the milestone: ST-082
  policy-scope enforcement (priced at 64+ hours / 8+ days across 15 retrieval and egress paths),
  shared-runtime hardening, and the `FEATURE_WORKFLOW` surface — an unauthenticated dashboard shell
  on `0.0.0.0:3000`. Plausibly *before* Horizon B, since it gates co-tenancy safety.
- **Recommend C** → extraction and donor work enters instead. The spike is not wasted: because
  Workflow Operations was deliberately isolated, the existing module becomes the reference
  implementation, and the node client with its event semantics is the most portable part.

Both paths keep the same AWCP contracts, workflow operations, node topology, provider model and
GSD/CE split. **Only the milestone's first phase differs.**

**OQ2 — does ADR-013 §4(b) get its wording from Phase 4, or a separate correction?** (U5.)

**OQ3 — where do the local-model benchmark artifacts live?** `RESULTS.md`, `benchmark-packets.json`,
`qwen-runs.json`, `qwen-scorecard.json`, `local_triage.py` — named as inputs, found neither under the
home directory nor in `agent-radio`. Until they surface, §18 is a design argument.

## Sources & Research

- [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md) — the six decisions
- [`awcp-external-evidence-import-2026-08.md`](../investigations/awcp-external-evidence-import-2026-08.md) — the two-axis contract and its grounding
- [`gsd-ce-lifecycle-drive-direction.md`](../investigations/gsd-ce-lifecycle-drive-direction.md) — drive direction and the runtime correction
- [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md) §1, §57, §63-65 — the host gate and its acceptance pre-condition
- [`ST-084-awcp-host-spike-findings.md`](../investigations/ST-084-awcp-host-spike-findings.md) — §6.1 pricing, §16 criterion 6, `:106-109` the derived-attention decision
- `.planning/ROADMAP.md:121-140` — Phase 4's own success criteria
- `~/.claude/gsd-core/bin/lib/init.cjs` `buildAgentSkillsBlock`; `~/.claude/agents/gsd-roadmapper.md` §"Deriving Phases from Requirements", §"Granularity Calibration"
