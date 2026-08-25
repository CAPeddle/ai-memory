---
name: "GSD runtime flip — pre/post compatibility matrix (copilot → claude)"
summary: "Observed before/after resolution of every runtime-dependent GSD path for the ST-097 A1 runtime flip, plus the governance file actually loaded and the CE skill actually materialised per agent, with an observed CE-skill execution inside two GSD agents."
asset_type: "investigation"
status: "observed-post-flip"
created: "2026-08-24"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/gsd-runtime-flip-compatibility-matrix-2026-08.md"
---

# GSD runtime flip — pre/post compatibility matrix

**Type:** Investigation / verification record (Tier 2 reference)
**Origin:** Workstream A, unit **A1** of
[the ST-097 GSD pivot plan](../plans/2026-08-23-2245-chore-st097-gsd-pivot-board-split-awcp-status-slice-plan.md).
A1's deliverable is explicitly *"a pre/post compatibility matrix, not a reference count"* — one row per
runtime-dependent path, each stating the **resolved** value before and after.

**What changed.** Exactly three keys in `.planning/config.json`:

| Key | Before | After |
|---|---|---|
| `runtime` | `"copilot"` | `"claude"` |
| `claude_md_path` | `"./.github/copilot-instructions.md"` | `"./CLAUDE.md"` |
| `agent_skills` | `{}` | five GSD agents mapped to CE plugin skills (below) |

Every value below was **measured**, not inferred: a single probe script was run against the real repo
before the edit and again after it, invoking `gsd-tools` and the `gsd-core` resolution modules directly.
Nothing in `~/.claude/gsd-core/` was modified.

---

## 1. Runtime-dependent path matrix

`runtime` is consumed in ~118 files under `bin/lib/`. Counting them proves nothing; what follows is what
each **path** actually resolves to.

| # | Runtime-dependent path | Resolver | Before (`copilot`) | After (`claude`) | Changed? |
|---|---|---|---|---|---|
| 1 | **Global config home** | `getGlobalConfigDir(runtime)` | `/home/cpeddle/.copilot` | `/home/cpeddle/.claude` | **yes** |
| 2 | **Skills base** | `getGlobalSkillsBase(runtime)` | `/home/cpeddle/.copilot/skills` | `/home/cpeddle/.claude/skills` | **yes** |
| 3 | **Local config dir** | registry `runtime.localConfigDir` | `.github` | `.claude` | **yes** |
| 4 | **Config format / install surface** | registry `configFormat` / `installSurface` | `markdown` / `copilot-instructions` | `settings-json` / `settings-json` | **yes** |
| 5 | **Command materialisation (global)** | registry `artifactLayout.global` | `skills` → `~/.copilot/skills/gsd-*` via `convertClaudeCommandToCopilotSkill`; `agents` → `~/.copilot/agents/gsd-*` via `convertClaudeAgentToCopilotAgent` | `skills` → `~/.claude/skills/gsd-*` via `convertClaudeCommandToClaudeSkill`; `agents` → `~/.claude/agents/gsd-*`, converter `null` (verbatim copy) | **yes** |
| 6 | **Command materialisation (local)** | registry `artifactLayout.local` | `skills` + `agents` under `.github/`, both converted | `commands` → `.claude/commands/gsd-*` and `agents` → `.claude/agents/gsd-*`, both converter `null` | **yes** — kind changes from `skills` to `commands` |
| 7 | **Agent-install location** | `checkAgentsInstalled(runtime, projectRoot)` | `agents_dir=/home/cpeddle/.copilot/agents`, `installed=true`, 34 installed, 0 missing | `agents_dir=/home/cpeddle/.claude/agents`, `installed=true`, 34 installed, 0 missing | **yes (path)** — no regression: both trees are fully populated |
| 8 | **Model resolution** | `query resolve-model <agent>` | concrete ids: `gsd-planner=claude-opus-4-8`, `gsd-executor=claude-sonnet-5`, `gsd-plan-checker=claude-haiku-4-5`, `gsd-verifier=claude-sonnet-5`, `gsd-code-reviewer=claude-sonnet-5`, `gsd-debugger=claude-opus-4-8` | `model=""` for **all six**; `tier`/`effort` unchanged (`opus`/`xhigh`, `sonnet`/`high`, `haiku`/`low`, …) | **yes** — see §4 |
| 9 | **Project instruction file** | `getProjectInstructionFile(runtime)` | `.github/copilot-instructions.md` | `.claude/CLAUDE.md` (overridden by `claude_md_path` — see §3) | **yes** |
| 10 | **Namespaced-skill support** | `buildAgentSkillsBlock`, `runtime === 'claude'` gate | **not supported** — plugin-namespaced skills are skipped with a warning | **supported** — emits a Skill-tool directive | **yes** — this is the flip's whole point |
| 11 | **Dispatch isolation** | registry `hostIntegration.dispatch` | `isolation: "undocumented"`, `nested: false`, `maxDepth: 1` | `isolation: "harness-worktree"`, `nested: true`, `maxDepth: 5` | **yes** — see §5 |
| 12 | **Support tier** | registry `supportTier` | `2` | `1` | **yes** |

---

## 2. CE skill actually materialised, per agent

`agent_skills` was populated with **plugin-namespaced** CE skills, using the `global:` prefix that
`buildAgentSkillsBlock` requires. Names were copied verbatim from the installed plugin at
`~/.claude/plugins/marketplaces/compound-engineering-plugin/skills/` — namespaced entries are **never
existence-checked** by GSD, so a typo would silently emit a directive for a skill that does not exist.

The mapping is deliberately minimal and tied to the roles GSD workflows actually inject
(`workflows/quick.md` injects planner / executor / plan-checker / verifier):

| GSD agent | Configured CE skill | `query agent-skills <agent>` **before** | `query agent-skills <agent>` **after** |
|---|---|---|---|
| `gsd-planner` | `compound-engineering:ce-plan` | empty block, `reason: "not_configured"` | **directive** — ``Load the `compound-engineering:ce-plan` skill via the Skill tool before proceeding (plugin-provided).`` — `reason: "resolved"`, `skills_count: 1` |
| `gsd-executor` | `compound-engineering:ce-work`, `compound-engineering:ce-commit` | empty block, `not_configured` | **directive ×2**, `reason: "resolved"`, `skills_count: 2` — this is the *"CE retains commit → PR"* direction |
| `gsd-plan-checker` | `compound-engineering:ce-doc-review` | empty block, `not_configured` | **directive**, `resolved`, `skills_count: 1` |
| `gsd-code-reviewer` | `compound-engineering:ce-code-review` | empty block, `not_configured` | **directive**, `resolved`, `skills_count: 1` |
| `gsd-debugger` | `compound-engineering:ce-debug` | empty block, `not_configured` | **directive**, `resolved`, `skills_count: 1` |
| `gsd-verifier` | *(deliberately unconfigured)* | empty block, `not_configured` | empty block, `not_configured` — unchanged |
| the other 28 installed GSD agents | *(unconfigured)* | empty block | empty block — GSD's documented *"unconfigured → empty block"* contract, unaffected |

**The runtime is the discriminator, not the config.** A control was run in a throwaway scratch project
carrying the *same* `agent_skills` map under each runtime:

- `runtime: "copilot"` →
  `[agent-skills] WARNING: Plugin-namespaced skill "global:compound-engineering:ce-work" requires a Skill-tool-capable runtime (claude) — skipping on runtime "copilot"`
  followed by `… has 1 configured skill path(s) but none resolved to a valid skill — all were skipped`.
- `runtime: "claude"`, byte-identical `agent_skills` → the directive block.

So populating `agent_skills` **without** the runtime flip would have produced exactly the
skipped-with-warning line the plan's stop condition names as proof the mechanism is absent.

---

## 3. Governance file actually loaded

**Before the flip, repo governance was invisible to GSD's instruction-file resolution.** Under
`runtime: "copilot"`, `getProjectInstructionFile('copilot')` returns `.github/copilot-instructions.md`,
and both `cmdGenerateClaudeMd` and `cmdProfileOutput` (`bin/lib/profile-output.cjs`) hard-override any
configured `claude_md_path` for a non-`claude` runtime. `claude_md_path` was itself already pointed at
that same file. `CLAUDE.md` at the repo root — which the repo names as its canonical governance source,
and which records that the copilot instructions are architecturally stale (*"When the prompt files and
the ADRs disagree, the ADRs win"*) — was named by neither.

| | Before | After |
|---|---|---|
| `claude_md_path` (config) | `./.github/copilot-instructions.md` | `./CLAUDE.md` |
| GSD-resolved instruction file | `.github/copilot-instructions.md` (runtime override wins) | `./CLAUDE.md` (`claude_md_path` is honored — the `claude` runtime is the one case where it is) |
| Governance actually reaching a dispatched GSD agent | the stale copilot instructions | root `CLAUDE.md`, auto-loaded natively by Claude Code |

**State the mechanism honestly: `claude_md_path` is a write/display target, not a read path.** Grepping
`~/.claude/gsd-core/{workflows,references,contexts}` for `claude_md` finds only
`workflows/profile-user.md` (displaying the resolved path) and two `update_claude_md` wrap-up steps.
Nothing injects the file's *contents* into a dispatch prompt. What actually delivers root `CLAUDE.md` to
a GSD agent is Claude Code's own auto-load of the repo-root memory file — available only because the
runtime is now `claude`. Setting `claude_md_path` **aligns GSD's own instruction-file target with that
canonical file**, so GSD-managed sections and the profile block land in the governance file the repo
already treats as authoritative, instead of the stale one.

**Noted consequence (not a defect introduced here).** `cmdGenerateClaudeMd` will now target root
`CLAUDE.md` — but it **skips** a file containing no `<!-- GSD:*-start -->` markers unless `--force` is
passed, and root `CLAUDE.md` contains none, so it is protected. `cmdProfileOutput`
(`gsd-tools generate-claude-profile`) has **no such marker guard**: it appends a profile section to the
target when no markers are found. Anyone running that command should expect it to append to root
`CLAUDE.md`. Neither command was run as part of this verification, precisely because both write.

---

## 4. Model resolution — the one row that changes value, not just path

Post-flip, `query resolve-model` returns `model: ""` for every GSD agent while `tier` and `effort` are
unchanged. This is correct and intentional, and the mechanism is in `bin/lib/model-resolver.cjs`:

- **Step 3** (`~:468`) is gated `if (configRuntime && configRuntime !== 'claude' …)`. Under `copilot`
  it hit `RUNTIME_PROFILE_MAP['copilot'][tier]` and returned a concrete id such as `claude-sonnet-5`,
  short-circuiting before the omit gate.
- **Step 4** (`~:484`) then applies: this project's `.planning/config.json` **explicitly** sets
  `resolve_model_ids: "omit"`, and an explicit project-level omit is honored *regardless of runtime*.
  So on `claude` the resolver returns `''`.

The practical effect: GSD now dispatches its subagents with **no explicit `model`**, letting Claude
Code's native model selection apply, rather than pinning `claude-*` ids that the copilot tier map
materialised. The `tier`/`effort` signal survives intact.

**Open item for the PO, deliberately not actioned by A1** (A1's scope is three keys): if the intent is
for GSD's per-agent tiers (`opus` / `sonnet` / `haiku`) to be honored on Claude Code, `resolve_model_ids`
would need to move off `"omit"` — step 5 would then return the tier **alias**, which is what Claude
Code's Agent tool accepts. That is a separate config decision.

---

## 5. Two things that will look like the flip failed, and are not

**a) The `#3532` warning still prints on every `gsd-tools` call.**

```
gsd-tools: warning: /home/cpeddle/.gsd/defaults.json sets resolve_model_ids, runtime but a project
config takes precedence here — those global keys are ignored for model resolution. (#3532)
```

`~/.gsd/defaults.json` is a **machine-wide** file outside this repository and still reads
`{"resolve_model_ids": "omit", "runtime": "copilot"}`. The warning is GSD correctly announcing that the
project config wins — which it does; every measured value above proves it. It is out of scope to change
a file outside the repo, and it will keep printing until someone updates that global default.

**b) A `gsd-executor` dispatch now hard-fails without `isolation="worktree"`.**

Observed during verification, dispatching `gsd-executor`:

> `Agent isolation guard: this project's dispatch isolation resolves to "harness-worktree", but the
> Agent() dispatch for subagent_type="gsd-executor" is missing isolation="worktree". Add
> isolation="worktree" to the Agent() call …`

This is row 11 of the matrix arriving in practice: `query dispatch-isolation` returned
`harness-worktree` post-flip (it is `undocumented` for `copilot`). This is a **gain in safety**, not a
regression — but any caller dispatching `gsd-executor` directly must now pass `isolation="worktree"`.

---

## 6. The hard gate — observed CE-skill execution inside a GSD agent

The plan's stop condition is explicit: *"a config diff is not the proof."* Two GSD agents were dispatched
with the **verbatim** `${AGENT_SKILLS_*}` block emitted by `gsd-tools`, mirroring real workflow
substitution, and instructed to invoke the Skill tool and halt at load.

| GSD agent dispatched | Directive honored | Result | Corroboration |
|---|---|---|---|
| `gsd-plan-checker` | `compound-engineering:ce-doc-review` | **SUCCEEDED** — `Launching skill: compound-engineering:ce-doc-review`; skill body injected | quoted lines verified byte-for-byte against `…/skills/ce-doc-review/SKILL.md` lines 63, 67, 71 |
| `gsd-code-reviewer` | `compound-engineering:ce-code-review` | **SUCCEEDED** — `Launching skill: compound-engineering:ce-code-review`; skill body injected | quoted Execution-spine Stage 1 line verified against `…/skills/ce-code-review/SKILL.md` |

Both agents reported the loader's base directory as
`/home/cpeddle/.claude/plugins/cache/compound-engineering-plugin/compound-engineering/3.22.4/skills/<skill>` —
a version-pinned path neither could produce without the load. The quotes were **independently checked
against the skill sources on disk** rather than taken on trust.

**Calibration, stated plainly so it can be judged rather than assumed.** This is *load-and-acknowledge
with content-dependent evidence*, not a CE workflow run to completion. Running `ce-doc-review` or
`ce-code-review` end-to-end would dispatch reviewer fleets and, for `ce-work`/`ce-commit`, write and
commit — which A1 is forbidden to do. The mechanism proven is the one the stop condition targets: the
directive reaches a GSD agent, the agent's Skill tool resolves the plugin-namespaced CE skill, and the
skill's instructions enter that agent's context. Before the flip, that path emitted a skip warning.

**Not proven here:** that a CE skill's *full workflow* completes inside a GSD agent. One consequence was
flagged by the probe and is worth recording — both CE skills open with a `## Setup` fence
(`scripts/context.mjs`) that a real dispatch must run before proceeding. A load-and-halt probe does not
exercise it.

---

## Reproducing this

```bash
cd /home/cpeddle/projects/ai-memory
# The verification-contract command. Directive = mechanism present; skip warning = absent.
node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills gsd-executor
node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills gsd-planner --json
node ~/.claude/gsd-core/bin/gsd-tools.cjs query dispatch-isolation
node ~/.claude/gsd-core/bin/gsd-tools.cjs query resolve-model gsd-executor
```

Do **not** verify §3 with `generate-claude-md` or `generate-claude-profile` — both write.
