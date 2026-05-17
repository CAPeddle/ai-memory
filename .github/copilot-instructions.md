# ai-memory Workspace Instructions

## Mission

Build ai-memory as a persistent memory service for AI coding agents. Preserve the repository intent established in the investigation documents and governance files unless the PO explicitly approves a change.

## Source Of Truth

Design authority documents are listed below in precedence order. When documents conflict, the higher-tier document wins unless the PO explicitly overrides.

### Tier 1 — Approved SE Documents (Binding)

These synthesise and formalise the investigation findings into binding requirements and decisions:

- `docs/requirements/SRS.md` (v1.1 — requirements baseline)
- `docs/design/adr/ADR-001` through `ADR-008` (architectural decisions)
- `docs/design/SystemDesign.md` (architecture overview, component descriptions, schema)
- `docs/planning/delivery-plan.md` (phased delivery sequence with done criteria)

### Tier 2 — Investigation Documents (Reference)

These are the original research and analysis that informed the Tier 1 documents. Consult them for context and rationale when the Tier 1 documents do not address a specific question.

Each investigation document is now a **compact landing page** at its original path, with detailed content split into focused fragment files in a same-name folder (e.g., `docs/investigations/memory-architecture-design/01-executive-summary.md`). Navigate via the Fragment Map in each landing page.
- Use the **top-level landing page path** as the default reference (stable, compact).
- Link to a **specific fragment** only when referencing a precise section.

Investigation landing pages:
- `docs/investigations/memory-architecture-design.md`
- `docs/investigations/language-stack-recommendation.md`
- `docs/investigations/sqlite-vs-postgresql.md`
- `docs/investigations/interface-design-mcp-rest.md`
- `docs/investigations/workflow-and-prompt-design.md`
- `docs/investigations/context-engineering-principles.md`
- `docs/investigations/openclaw-official-docs-review.md`
- `docs/investigations/openclaw-memory-architecture-analysis.md`

## Architectural Defaults

Unless explicitly changed by the PO:

- Use C# 12 on .NET 8+
- Use SQLite with FTS5 as the starting datastore
- Keep ASP.NET Core Minimal API as the REST host
- Keep MCP as a thin facade over the same shared service layer used by REST
- Keep Core free of framework dependencies
- Prefer hybrid retrieval: FTS5 + vector search + fusion/reranking

## Workflow Gate

This repository is workflow-first.

- For implementation work, do not start coding until a two-step `/plan` process has produced a Ready ExecPlan.
- Do not perform planning unilaterally. Query packets, story shaping, and ExecPlan direction must come from back-and-forth with the PO using `vscode_askQuestions`.
- Phase 1 creates a query packet through collaborative scoping.
- Phase 2 creates a self-contained ExecPlan that a stateless executor can follow.
- `/continue` executes Ready ExecPlans mechanically.
- `/recover` performs forensics and updates recovery guidance after failures.
- Do not contradict or loosen the governance workflow without consulting the PO.

For trivial documentation or housekeeping changes, direct edits are acceptable if they do not bypass an active story, conflict with the board, or change architecture/governance intent.

## Governance Files

When working in this repo, follow these files:

- Board: `.github/planning/story-board.md`
- ExecPlan template: `.github/planning/execplans/_TEMPLATE.md`
- Prompts: `.github/prompts/plan-new.prompt.md`, `.github/prompts/plan.prompt.md`, `.github/prompts/continue.prompt.md`, `.github/prompts/recover.prompt.md`
- Coding standards: `.github/instructions/coding-standards.instructions.md`
- Session resilience: `.github/instructions/session-resilience.instructions.md`
- Session handoff: `FollowUpSessionLog.txt`

## PO Interaction Rules

- When you need input, approval, clarification, or confirmation from the PO, use the VS Code Questions tool (`vscode_askQuestions`) rather than plain-text questions.
- Do not create or materially revise a query packet, story plan, or ExecPlan until you have worked back and forth with the PO through the questions tool.
- Immediately before each questions-tool interaction, post a short context message with clickable links to the relevant artifact.
- If the question is about a story, include the board link and the specific story line or section.
- If the question is about an ExecPlan, file, or investigation doc, include the relevant file link and line reference when practical.
- Keep each questions-tool round focused and bounded so the PO can answer with minimal ambiguity.

## Context Engineering Rules

Apply the context-engineering principles from the investigation docs to your own work:

- Point, do not dump
- Read targeted slices instead of whole large files when possible
- Prefer search before bulk reading
- Keep plans self-contained, but keep runtime context lean
- Phrase acceptance and validation in observable outcomes, not internal implementation terms
- Escalate when the plan is ambiguous instead of improvising

## Planning And Execution Behavior

- Preserve architecture decisions instead of re-litigating them on every task
- Make ExecPlans novice-guiding, self-contained, and outcome-focused
- Require explicit verification steps for implementation tasks
- Use atomic commits and keep recovery state current
- Record surprises, decisions, and outcomes as the work progresses

## Dogfooding

Once ai-memory is implemented enough to be usable, prefer dogfooding it in approved stories and plans. Do not invent premature dogfooding steps before the service exists.
