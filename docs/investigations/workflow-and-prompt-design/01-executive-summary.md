## 1. Executive Summary

This document defines the **board-driven, PO-gated workflow** for developing the ai-memory service. It adapts the continuous-flow kanban system from `copilot_config` and `story-app` into a self-contained workflow within this repository.

The workflow uses three primary prompts plus one intake prompt:

| Prompt | Model Tier | Purpose |
|--------|-----------|---------|
| `/plan-new` | Strong (Opus) | Add a story, perform targeted research, and scope impact/priority with the PO |
| `/plan` | Strong (Opus) | Collaborative scoping, story creation, ExecPlan authoring, plan-review resolution |
| `/continue` | Cost-efficient (Sonnet) | Task execution from Ready ExecPlans, atomic commits, board maintenance |
| `/recover` | Strong (Opus) | Session forensics, ExecPlan annotation after failures |

**Key principle:** The ExecPlan is the handoff artifact between tiers. `/plan-new` creates the intake artifact, `/plan` writes the recipe, and `/continue` follows it mechanically.

---

