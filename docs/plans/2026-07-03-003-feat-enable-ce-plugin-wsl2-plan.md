---
story: ST-073
type: feat
status: active
date: 2026-07-03
title: "feat: Enable compound-engineering plugin in WSL2-remote VS Code"
---

# feat: Enable compound-engineering plugin in WSL2-remote VS Code

## Summary

The compound-engineering plugin (v3.9.3) is installed on the Windows filesystem and VS Code already surfaces every `ce-*` skill and agent into this WSL2-remote workspace. Its CLI dependencies and the `ast-grep` skill are already installed **inside** WSL2, and its bundled bash scripts run natively — `ce-setup`'s `check-health` reports 7/7 tools and 1/1 skills. Only two friction points block reliable use: (1) the project has no `.compound-engineering/` config, and (2) the plugin's skill/agent/reference files are addressed by Windows paths (`c:/Users/.../.vscode/agent-plugins/...`) that the WSL2-remote file tools cannot open without manual translation to `/mnt/c/Users/...`. This plan closes both: bootstrap the project config with gitignore hygiene, and add a durable repo instruction that teaches every future Copilot session how to resolve and run the plugin from WSL2.

---

## Problem Frame

**Who:** The developer running VS Code on Windows against a WSL2 remote workspace (`/home/cpeddle/projects/ai-memory`), using GitHub Copilot with the compound-engineering plugin.

**What breaks today:**
- When a `ce-*` skill instructs the agent to read a bundled `references/*.md` file or run a `scripts/*` helper, those files are named with Windows paths (`c:/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering/...`). Under the WSL2 remote, the read/edit tools resolve against the Linux filesystem, so the `c:/...` form fails and the agent must translate to `/mnt/c/Users/...` on every access. This rediscovery happens fresh in each session.
- The plugin expects a repo-local `.compound-engineering/config.local.yaml` (and a committed `.example.yaml`); neither exists, and `.gitignore` has no entry to keep the local copy out of version control. This is the single finding `check-health` reports.

**What already works (do not re-solve):** All 7 CLI tools (`agent-browser`, `gh`, `jq`, `vhs`, `silicon`, `ffmpeg`, `ast-grep`) and the `ast-grep` agent skill are installed in WSL2. The plugin's bash scripts execute correctly under WSL2. No installation work is required.

---

## Requirements

- **R1.** The project has a committed `.compound-engineering/config.local.example.yaml` (latest template) and a local, gitignored `.compound-engineering/config.local.yaml`, so `ce-setup`'s `check-health` reports zero Project findings.
- **R2.** `.gitignore` excludes the machine-local config (`.compound-engineering/*.local.yaml`) while keeping the `.example.yaml` tracked.
- **R3.** A durable, auto-loading repo instruction documents (a) the plugin's Windows install root and the `c:/Users/...` → `/mnt/c/Users/...` translation rule for reading plugin files and running plugin scripts under WSL2, and (b) the fact that dependencies are already installed plus the one-line `check-health` verification command.
- **R4.** The new instruction file does not introduce governance-catalog drift (it must not require registration in `.github/planning/assets/asset-catalog-source.json`, or it must be registered there — see KTD-2).
- **R5.** Enablement is verifiable: running `check-health` from the repo root in WSL2 reports clean, and a `ce-*` skill can resolve its bundled reference files without manual path guessing.

---

## Key Technical Decisions

- **KTD-1 — Bootstrap config by mirroring `ce-setup` Step 5, not by inventing settings.** Copy the plugin's `references/config-template.yaml` verbatim to both `.example.yaml` (committed) and `.local.yaml` (gitignored). The template ships fully commented, so no WSL2-specific values are needed — the config's job is to exist and clear the health check, not to encode environment specifics. Rationale: keeps the project aligned with the plugin's own setup contract and avoids drift when the template evolves.
- **KTD-2 — The WSL2 instruction file follows the lightweight `applyTo`-only frontmatter pattern (like [.github/instructions/dev-environment.instructions.md](.github/instructions/dev-environment.instructions.md)), not the governed-asset frontmatter.** Verified that `dev-environment.instructions.md` is **not** present in `.github/planning/assets/asset-catalog-source.json`, so `applyTo`-only instruction files are exempt from the governance catalog and the `GovernanceAssetValidator` drift check. Using the governed frontmatter (`name`/`summary`/`asset_type`/`owners`/`source_path`) would force a matching catalog-source entry (per [docs/governance/asset-metadata-contract.md](docs/governance/asset-metadata-contract.md)) and a catalog regeneration, which is unnecessary scope for a dev-experience note. Rationale: satisfies R3/R4 with the smallest correct footprint and an existing in-repo precedent.
- **KTD-3 — Path translation is documented as a convention, not automated with a symlink.** A `/home/cpeddle/.vscode/agent-plugins → /mnt/c/...` symlink was considered and rejected: it is machine-specific, lives outside the repo (non-portable, uncommittable), and does not survive teammate machines or plugin reinstalls. A repo instruction is portable, reviewable, and teaches the durable `/mnt/c/...` rule that works for any WSL2 user. Rationale: honors the plan's portability principle and compounds knowledge across sessions.

---

## Implementation Units

### U1. Bootstrap `.compound-engineering` project config

- **Goal:** Create the committed example config, the gitignored local config, and the `.gitignore` entry so `check-health` reports a clean Project section.
- **Requirements:** R1, R2, R5
- **Dependencies:** none
- **Files:**
  - `.compound-engineering/config.local.example.yaml` (create — copy of the plugin's `references/config-template.yaml`; committed)
  - `.compound-engineering/config.local.yaml` (create — same template contents; gitignored, machine-local)
  - `.gitignore` (modify — add `.compound-engineering/*.local.yaml`)
- **Approach:** Mirror `ce-setup` Step 5. Source the template from the plugin at its WSL2-translated path (`/mnt/c/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering/skills/ce-setup/references/config-template.yaml`). The `.example.yaml` is tracked so teammates see available settings; the `.local.yaml` starts fully commented and is ignored so per-machine preferences never get committed. Add the ignore glob so the example stays tracked while any `*.local.yaml` is excluded.
- **Patterns to follow:** `ce-setup` SKILL.md Step 5; existing `.gitignore` grouping conventions in this repo.
- **Test scenarios:** `Test expectation: none -- config scaffolding and a .gitignore entry, no behavioral code.` Verification is the health check (below), not an automated test.
- **Verification:** From the repo root in WSL2, `bash <plugin>/skills/ce-setup/scripts/check-health --version 3.9.3` reports no Project findings (Example config present; local config present and gitignored). `git status` shows `.example.yaml` staged and `.local.yaml` ignored.

### U2. Add WSL2 plugin-usage instruction file

- **Goal:** Give every future Copilot session an auto-loaded convention for resolving the Windows-installed plugin and running it from WSL2.
- **Requirements:** R3, R4, R5
- **Dependencies:** none (independent of U1; can land in either order)
- **Files:**
  - `.github/instructions/compound-engineering-wsl2.instructions.md` (create)
- **Approach:** Use `applyTo: "**"` frontmatter only (KTD-2). Document, concisely:
  1. **Install root** — the plugin lives at the Windows path `c:/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering`.
  2. **Translation rule** — under this WSL2 remote, read plugin skill/agent/reference files and run plugin `scripts/*` via the `/mnt/c/Users/...` equivalent; the raw `c:/Users/...` form (as surfaced in skill/agent metadata) will not resolve with the file tools.
  3. **Dependencies are already present** in WSL2 (list the 7 tools + `ast-grep` skill); do not reinstall.
  4. **Verification command** — the one-line `check-health` invocation and what a clean result looks like.
  Keep it to a short, scannable reference — this is a wayfinding note, not a tutorial.
- **Patterns to follow:** [.github/instructions/dev-environment.instructions.md](.github/instructions/dev-environment.instructions.md) for frontmatter shape and command-block style; [.github/instructions/ways-of-working.instructions.md](.github/instructions/ways-of-working.instructions.md) for tone.
- **Test scenarios:** `Test expectation: none -- documentation/instruction file, no executable behavior.`
- **Verification:** The file loads as an instruction (appears in a fresh session's instruction set). A follow-up session, given a `ce-*` skill that references a bundled file, resolves it via `/mnt/c/...` without trial-and-error. Governance validator still passes: `dotnet run --project tools/GovernanceAssetValidator -- validate .` reports no drift (the file is catalog-exempt per KTD-2).

---

## Scope Boundaries

**In scope:** Config bootstrap (U1), the durable WSL2 instruction (U2), and gitignore hygiene.

**Non-goals (outside this work's identity):**
- Relocating or reinstalling the plugin, or moving it onto the WSL2 filesystem.
- Modifying the plugin's own source, skills, or scripts.
- Installing or upgrading any CLI tool or agent skill — all are already present in WSL2.
- Changing how VS Code discovers or surfaces the plugin.

### Deferred to Follow-Up Work

- Cross-linking the new WSL2 convention from [CLAUDE.md](CLAUDE.md) or [.github/copilot-instructions.md](.github/copilot-instructions.md) for extra discoverability — nice-to-have, not required for enablement.
- Populating `.compound-engineering/config.local.yaml` with actual opted-in settings (e.g., `plan_output`, `work_delegate`) — a preferences decision, separate from enablement.
- Adding a board entry `ST-073` and moving it Backlog → In Progress before `ce-work` executes this plan (workflow-gate housekeeping, per repo governance).

---

## Risks & Dependencies

- **Governance-catalog drift (low, mitigated by KTD-2).** If the instruction file accidentally uses governed frontmatter, `GovernanceAssetValidator` will flag missing catalog registration. Mitigation: use `applyTo`-only frontmatter; run the validator as U2's verification.
- **Committing machine-local config (low, mitigated by U1).** Forgetting the `.gitignore` entry would leak per-machine preferences. Mitigation: add `.compound-engineering/*.local.yaml` in the same unit that creates the files; confirm via `git status`.
- **Plugin path changes on reinstall/upgrade (low).** The Windows install root embeds the plugin version-independent marketplace path, but a future plugin relocation could change it. Mitigation: the instruction documents the *translation rule* (`c:/...` → `/mnt/c/...`) as the durable principle, not just the literal path, so it survives most moves.
- **Dependency on plugin template path.** U1 copies the template from the plugin's WSL2-translated path; if the plugin is absent, U1 cannot source the template. Not a real risk here — the plugin is present and health-checks clean.

---

## Sources & Research

- Live diagnostic: `ce-setup` `check-health --version 3.9.3` run from the repo root in WSL2 → 7/7 tools, 1/1 skills, single Project finding (missing example config).
- Plugin `ce-setup` SKILL.md Step 5 (config bootstrap contract) and `references/config-template.yaml`.
- [docs/governance/asset-metadata-contract.md](docs/governance/asset-metadata-contract.md) — required governed-asset frontmatter fields and catalog-drift rules.
- Verified precedent: [.github/instructions/dev-environment.instructions.md](.github/instructions/dev-environment.instructions.md) uses `applyTo`-only frontmatter and is absent from `.github/planning/assets/asset-catalog-source.json` (catalog-exempt).
- Related but distinct: [docs/brainstorms/wsl2-native-dev-workflow-requirements.md](docs/brainstorms/wsl2-native-dev-workflow-requirements.md) covers the ai-memory native Deno/Docker dev loop — a different WSL2 concern, not the plugin-enablement topic of this plan.
