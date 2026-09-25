# Memory Index

## Feedback

- [Always include the why in plans and docs](feedback_always_include_why.md) — Every spec, plan, ADR, story entry, and commit must state the rationale alongside the decision.
- [Plans are subagent-driven with orchestrator oversight](feedback_plans_are_subagent_driven.md) — All implementation plans describe subagent dispatch + review, not inline TDD checklists.
- [Dependency-gap fallback to schema fields](feedback_dependency_gaps_use_schema_fallback.md) — PO prefers schema-resident defaults over gating one feature on another's completion.

## Project

- [ST-008 consolidation v1 scope](project_st_008_consolidation_1to1.md) — 1:1 promotion, confidence-as-relevance fallback, case-by-case contradiction handling.
- [Git EOL semantics in ExecPlan ACs](project_git_eol_semantics.md) — `i/` is always LF for text files; `w/` follows `eol=`; `git status` clean is the real success indicator. Source of the ST-030 first plan-review.
- [ExecPlan verification must match deliverable scope](project_execplan_verification_scope.md) — Don't run unrelated test suites as a "safety net"; use the minimal command that proves the AC (e.g., `git diff -w` for whitespace stories). Source of the ST-030 second plan-review.
- [Deno runs in the mcp container, not on host](project_deno_in_container.md) — Use `docker compose exec mcp deno ...` in ExecPlan commands. Host Deno is not a project precondition. Dev bind mount `./server:/app` makes host source live in the container.
