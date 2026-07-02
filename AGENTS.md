# AGENTS.md

This file exists for OpenCode and any other AGENTS.md-reading tool. It intentionally does not duplicate project governance — **[CLAUDE.md](CLAUDE.md) is the single canonical source** for architecture, workflow, and conventions in this repository. Read that file; everything in it applies to OpenCode sessions exactly as it does to Claude Code sessions.

## Why a pointer, not a duplicate

Two governance documents drift. One doesn't. If CLAUDE.md and AGENTS.md ever needed to diverge for a genuine tool-specific reason, that reason should be written here explicitly — not created by two files quietly going out of sync.

## Tool-name differences

Where CLAUDE.md references a Claude Code-specific tool name (e.g. `TaskCreate`/`TaskUpdate`, `Read`/`Grep`/`Glob`), use OpenCode's equivalent capability. Where CLAUDE.md references `vscode_askQuestions` (VS Code Copilot only), OpenCode sessions should gather PO input through direct conversation instead.

## `.agents/`

Reserved for OpenCode custom subagent definitions, analogous to Claude Code's `.claude/agents/`. Empty today — create files here only when a specific OpenCode subagent is actually needed, not speculatively.
