# ai-memory Workspace Instructions

> ⚠ **Architecture has evolved.** Several documents in `.github/` (including this file and the `/plan*`, `/continue`, `/recover`, `/governance-review` prompts) were authored when the v1 design targeted a single C# / SQLite / FTS5 stack. The cloud MCP server is now **Deno 2.0 + TypeScript** on **PostgreSQL 15 + pgvector + Apache AGE**, hosted in Docker. See [ADR-009](../docs/design/adr/ADR-009-deployment-model.md) (deployment) and [ADR-011](../docs/design/adr/ADR-011-storage-strategy.md) (storage) for the binding decisions. The C# / .NET 8 solution under `src/` is now scoped to the **local synthesis companion** (ST-019), not the cloud MCP. When stack details in this folder disagree with the ADRs, the ADRs win.

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

- **Cloud MCP server** (`server/`) — Deno 2.0 / TypeScript / Hono / `@modelcontextprotocol/sdk`, hosted in Docker. Runs against PostgreSQL 15 with `pgvector` and Apache AGE in the same instance ([ADR-009](../docs/design/adr/ADR-009-deployment-model.md), [ADR-011](../docs/design/adr/ADR-011-storage-strategy.md)).
- **Local synthesis companion** (`src/`, planned) — C# 12 on .NET 8+, MCP client only (not a server). Will read from the cloud MCP and write Markdown to an Obsidian vault ([ST-019](planning/story-board.md)).
- **Governance tooling** (`tools/`) — C# 12 on .NET 8+. Coding standards in [.github/instructions/coding-standards.instructions.md](instructions/coding-standards.instructions.md) apply here and to the local companion.
- Keep MCP tools as a thin facade over the shared Postgres-backed service layer.
- Prefer hybrid retrieval: BM25 (Postgres `tsvector`) + vector search (`pgvector`) + RRF fusion + MMR re-ranking. Add graph traversal (Apache AGE / openCypher) where structural inference is required.

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

## Deno Lockfile Hygiene (server)

- `server/deno.json` enforces frozen lock mode (`lock.frozen = true`).
- Keep normal test runs frozen so `server/deno.lock` does not drift during routine iteration.
- When dependencies/imports change intentionally, refresh the lock explicitly:

```powershell
docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts
```

- Commit the updated `server/deno.lock` in the same change as the dependency/import update.

## Session Review — Continuous Improvement

At the end of each non-trivial session, review the work for **reusable nuggets** — recurring patterns, gotchas, workflow gaps, or conventions that a fresh agent would miss. When you identify one, suggest creating or updating:

- A **`.github/instructions/*.instructions.md`** file — for conventions, commands, or constraints that should auto-load into every Copilot session.
- A **skill** (`.github/skills/*/SKILL.md`) — for domain-specific procedural knowledge (multi-step workflows, research patterns).
- An update to **`CLAUDE.md`** or **`.github/copilot-instructions.md`** — for architectural context or workflow-level guidance.

Don't create these unilaterally — propose them to the PO with a one-line rationale. The goal is to compound project knowledge so future sessions start smarter.
