---
title: ce-brainstorm tool adaptation for opencode CLI compatibility
date: 2026-06-19
category: tooling-decisions
module: ce-brainstorm
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Authoring a new compound-engineering skill that may be used on more than one coding agent platform
  - Porting an existing skill from one platform (e.g., Claude Code) to another (e.g., opencode, Codex CLI, Gemini CLI)
  - A skill silently fails or behaves differently on a secondary platform compared to its primary test platform
  - Reviewing PRs that add or modify skill definitions — verify platform assumptions are documented
  - Onboarding a new agent platform into a project's workflow (e.g., adding .opencode/ config alongside existing Claude Code hooks)
  - An incident or session review reveals a platform-specific skill failure
tags:
  - cross-platform
  - skill-compatibility
  - opencode
  - ce-brainstorm
  - tooling
  - platform-adaptation
---

# ce-brainstorm tool adaptation for opencode CLI compatibility

## Context

Compound-engineering skills like `ce-brainstorm` are authored and tested primarily
against specific coding agent platforms (Claude Code, Codex CLI, Gemini CLI) with
implicit assumptions about those platforms' capabilities: tool-calling conventions,
prompt injection mechanisms, context-window management, plugin or hook interfaces,
and filesystem access patterns. When the same skill is deployed on a different
platform such as opencode, it encounters mismatches in these assumptions —
for example, differences in how tools are registered and invoked, how session
context is maintained, how user prompts are routed to skills, or what sandbox
constraints apply.

This creates a brittleness that the original platform-focused testing did not
surface. During work on the ai-memory project, `ce-brainstorm` worked on its
original target platforms but required explicit adjustment — reworking tool
definitions, adapting prompt templates, or modifying invocation flow — to
function correctly in opencode.

## Guidance

When designing, authoring, or porting a compound-engineering skill, treat
platform-specific adaptation as a first-class concern rather than assuming
portability:

1. **Document platform assumptions visibly.** List tool-calling conventions,
   prompt injection mechanisms, environment variables, filesystem expectations,
   and hook/lifecycle events the skill relies on. Place this in a "Platform
   Compatibility" section in the skill's README or SKILL.md frontmatter.

2. **Create platform adaptation layers.** For each target platform, map the
   skill's assumptions to that platform's primitives. For example, if
   `ce-brainstorm` expects a CLI tool-invocation pattern that opencode routes
   differently, adapt the tool registration in an opencode-specific config file
   (`.opencode/config.json`, `opencode-mcp.json`, or skill-specific adapter).

3. **Smoke-test on each platform.** A skill that runs reliably on Claude Code
   may silently fail on opencode due to differences in structured outputs, tool
   chaining, or error propagation. Run at least one end-to-end invocation per
   platform before declaring compatibility.

4. **Isolate platform wiring from domain logic.** Keep the skill's core
   reasoning flow platform-agnostic in shared prompt templates or SKILL.md files.
   Put platform-specific wiring (tool registration, invocation adapters) in
   thin adapter files. This prevents rewriting the skill's core for each new
   platform.

## Why This Matters

Cross-platform skill portability directly affects developer experience and
knowledge continuity. Compound-engineering skills encode reusable, high-leverage
workflows meant to compound across sessions. If those workflows are locked to a
single agent platform, they fracture the developer's context when switching tools
mid-project — exactly the problem ai-memory's STRATEGY.md identifies as
"isolated memory silos."

Silently broken tool invocations erode trust in the skill, encourage workarounds
that bypass the skill's discipline, and cause the encoded knowledge to atrophy.
Investing in platform adaptation upfront prevents this regress and aligns with
the broader architectural goal of cross-tool continuity — a key strategic metric.

## When to Apply

- Authoring a new compound-engineering skill that may span multiple agent platforms
- Porting an existing skill from one platform (e.g., Claude Code) to another
  (opencode, Codex CLI, Gemini CLI)
- A skill silently fails or behaves differently on a secondary platform relative
  to its primary test platform
- Reviewing PRs that add or modify skill definitions — verify platform assumptions
  are documented and adapter files exist for each claimed platform
- Onboarding a new agent platform into a project's workflow (e.g., adding
  `.opencode/` config alongside existing Claude Code hooks)
- An incident report or session review reveals a platform-specific skill failure —
  annotate the adaptation gap and promote it to this knowledge track

## Examples

**Before adaptation:** `ce-brainstorm` assumed a tool-naming convention and
invocation syntax that matched Claude Code's hooks — tools were registered
implicitly via `claude_hooks.json` and invoked with positional arguments passed
directly as CLI subcommands.

**After adaptation for opencode:** The adaptation required:
- Creating an opencode-specific tool registration entry in `opencode-mcp.json`
  mapping the skill's logical tool names to opencode-compatible command signatures
- Adjusting prompt templates for differences in how opencode injects system
  context vs. how Claude Code hooks inject prompts
- Modifying skill discovery path assumptions (`~/.config/opencode/skills/` vs.
  `~/.claude/skills/` or `~/.codex/skills/`)

**General pattern:**
```
skill/
├── SKILL.md              # Platform-agnostic core logic
├── README.md             # Platform Compatibility section
├── adapters/
│   ├── claude-code/      # Claude Code-specific wiring
│   ├── opencode/         # opencode-specific wiring
│   └── codex/            # Codex CLI-specific wiring
└── scripts/              # Shared implementation scripts
```

## Related

- `docs/solutions/` — category `workflow-issues/` for related workflow guidance
- `STRATEGY.md` — "cross-tool continuity rate" as a key metric; multi-platform
  developer as primary persona
- `docs/design/adr/ADR-009-deployment-model.md` — deployment model context
- `.opencode/config.json` — opencode CLI project configuration
- `opencode-mcp.json` — opencode MCP server registration
- `.github/skills/compound-engineering/SKILL.md` — precedent skill with
  platform assumptions
