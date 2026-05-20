# Investigation: Workflow & Prompt Design

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Planning, intake, execution, and recovery prompt workflow for ai-memory |
| **Sources** | `copilot_config/.github/prompts/`, `story-app/docs/investigations/AgenticWorkflow_PortabilityManual.md`, Cursor "Scaling long-running autonomous coding" (Jan 2026), OpenAI Codex ExecPlans / PLANS.md |

---

## Read This When

Designing workflow prompts, ExecPlan templates, board structure, or session resilience patterns. The primary planning governance reference.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. Two-Tier Model Workflow | [2. Two-Tier Model Workflow](./02-two-tier-model-workflow.md) |
| 3 | 3. Board Design | [3. Board Design](./03-board-design.md) |
| 4 | 4. ExecPlan Pattern | [4. ExecPlan Pattern](./04-execplan-pattern.md) |
| 5 | §1. Background & Context | [§1. Background & Context](./05-background-context.md) |
| 6 | §2. Definition of Done | [§2. Definition of Done](./06-definition-of-done.md) |
| 7 | §2b. Definition of Ready | [§2b. Definition of Ready](./07-2b-definition-of-ready.md) |
| 8 | §2c. Plan Review Notes | [§2c. Plan Review Notes](./08-2c-plan-review-notes.md) |
| 9 | §3. Preconditions | [§3. Preconditions](./09-preconditions.md) |
| 10 | §4. Task Definitions | [§4. Task Definitions](./10-task-definitions.md) |
| 11 | §5. State Recovery Protocol | [§5. State Recovery Protocol](./11-state-recovery-protocol.md) |
| 12 | §5b. Recovery Ledger | [§5b. Recovery Ledger](./12-5b-recovery-ledger.md) |
| 13 | §5c. Approach Ledger | [§5c. Approach Ledger](./13-5c-approach-ledger.md) |
| 14 | §6. Execution Log | [§6. Execution Log](./14-execution-log.md) |
| 15 | §6b. Surprises & Discoveries | [§6b. Surprises & Discoveries](./15-6b-surprises-discoveries.md) |
| 16 | §6c. Decision Log | [§6c. Decision Log](./16-6c-decision-log.md) |
| 17 | §7. Compound Step / Closeout | [§7. Compound Step / Closeout](./17-compound-step-closeout.md) |
| 18 | §7b. Outcomes & Retrospective | [§7b. Outcomes & Retrospective](./18-7b-outcomes-retrospective.md) |
| 19 | §6b. Surprises & Discoveries | [§6b. Surprises & Discoveries](./19-6b-surprises-discoveries-2.md) |
| 20 | §6c. Decision Log | [§6c. Decision Log](./20-6c-decision-log-2.md) |
| 21 | §7b. Outcomes & Retrospective | [§7b. Outcomes & Retrospective](./21-7b-outcomes-retrospective-2.md) |
| 22 | §2b. Definition of Ready | [§2b. Definition of Ready](./22-2b-definition-of-ready-2.md) |
| 23 | §5b. Recovery Ledger | [§5b. Recovery Ledger](./23-5b-recovery-ledger-2.md) |
| 24 | §5c. Approach Ledger | [§5c. Approach Ledger](./24-5c-approach-ledger-2.md) |
| 25 | 5. Prompt Contracts for ai-memory | [5. Prompt Contracts for ai-memory](./25-prompt-contracts-for-ai-memory.md) |
| 26 | 6. Session Resilience | [6. Session Resilience](./26-session-resilience.md) |
| 27 | 7. Role Model | [7. Role Model](./27-role-model.md) |
| 28 | 8. PO Review Experience | [8. PO Review Experience](./28-po-review-experience.md) |
| 29 | 9. Adaptations for ai-memory | [9. Adaptations for ai-memory](./29-adaptations-for-ai-memory.md) |
| 30 | 10. Artifact Layout for ai-memory | [10. Artifact Layout for ai-memory](./30-artifact-layout-for-ai-memory.md) |
| 31 | 11. Initial Story Backlog (Seed) | [11. Initial Story Backlog (Seed)](./31-initial-story-backlog-seed.md) |
| 32 | 12. External Validation: Multi-Agent Coordination (Cursor Research) | [12. External Validation: Multi-Agent Coordination (Cursor Research)](./32-external-validation-multi-agent-coordination-curso.md) |
| 33 | 13. External Validation: ExecPlan Design (OpenAI Codex PLANS.md) | [13. External Validation: ExecPlan Design (OpenAI Codex PLANS.md)](./33-external-validation-execplan-design-openai-codex-p.md) |
| 34 | 14. Open Questions | [14. Open Questions](./34-open-questions.md) |
| 35 | 15. Recommendations | [15. Recommendations](./35-recommendations.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
