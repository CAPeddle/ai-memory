---
name: "Compound Engineering WSL2 Remote"
summary: "Path-translation rules for ce-* skills running in a WSL2 remote opened from VS Code on Windows"
status: active
owners:
  - ai-memory-maintainers
applyTo: "**"
---

# Compound Engineering Plugin — WSL2 Remote Usage

This workspace runs in a **WSL2 remote** (`/home/cpeddle/projects/ai-memory`) opened from VS Code on Windows. The compound-engineering Copilot plugin is installed on the **Windows** filesystem, so its skills, agents, and bundled scripts are surfaced with Windows paths that the WSL2-side file tools cannot open directly. Follow the rules below when a `ce-*` skill runs.

## Install root

The plugin lives at the Windows path:

```
c:/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering
```

Its WSL2-accessible equivalent is:

```
/mnt/c/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering
```

## Path translation rule (the durable principle)

Skill and agent metadata reference bundled files (`SKILL.md`, `references/*.md`, `scripts/*`) using the `c:/Users/...` form. Under this WSL2 remote:

- **Translate `c:/Users/...` → `/mnt/c/Users/...`** before reading a plugin file with the file tools or running a plugin script in the terminal. The raw `c:/...` form will not resolve.
- This rule holds for any Windows drive path: `c:/X` → `/mnt/c/X`, `d:/Y` → `/mnt/d/Y`.

Example — running the setup health check:

```bash
bash "/mnt/c/Users/cpeddle/.vscode/agent-plugins/github.com/EveryInc/compound-engineering-plugin/plugins/compound-engineering/skills/ce-setup/scripts/check-health" --version 3.9.3
```

## Dependencies are already installed in WSL2 — do not reinstall

The plugin's CLI tools and agent skill are present inside WSL2:

- Tools: `agent-browser`, `gh`, `jq`, `vhs`, `silicon`, `ffmpeg`, `ast-grep`
- Agent skills: `ast-grep`

`ce-setup` / `check-health` reports 7/7 tools and 1/1 skills. Skip the install steps unless a future run shows a tool as missing.

## Project config

Compound Engineering config lives in `.compound-engineering/`:

- `config.local.example.yaml` — committed; shows available settings (all commented out).
- `config.local.yaml` — machine-local; gitignored via `.compound-engineering/*.local.yaml`. Enable only what you need.

## Verify enablement

From the repo root in WSL2, run the health check (translated path above). A clean result reports **7/7 tools, 1/1 skills, no Project findings**. If a `ce-*` skill needs a bundled reference file, resolve it via the `/mnt/c/...` path rather than trial-and-error.
