## 12. External Validation: Multi-Agent Coordination (Cursor Research)

**Source:** Cursor "Scaling long-running autonomous coding" (Jan 2026) — running hundreds of concurrent agents for weeks on single projects (1M+ LoC).

### 12.1 Coordination Approaches Tested

| Approach | Result | Lesson for ai-memory |
|----------|--------|----------------------|
| **Flat self-coordination** (shared file + locks) | Failed — agents held locks too long, forgot to release, throughput collapsed to 2-3 effective agents from 20 | Validates our single-LE model with explicit lock table |
| **Optimistic concurrency** (read freely, fail on write conflict) | Better but agents became risk-averse — avoided hard problems, no ownership | Validates PO-gated story assignment over self-selection |
| **Planner/Worker separation** | Worked — planners explore and create tasks, workers execute without coordinating with each other | **Directly validates our `/plan` (Opus) + `/continue` (Sonnet) split** |
| **Integrator role** (quality control agent) | Removed — created more bottlenecks than it solved | Validates not adding a separate QA/review agent |
| **Judge agent** (end-of-cycle evaluation) | Useful — determines whether to continue or restart | Maps to our PO review gate at story completion |

### 12.2 Key Findings

**"Prompts matter more than harness or models."** Getting agents to coordinate well, avoid pathological behaviours, and maintain focus over long periods required extensive prompt experimentation. This validates our investment in detailed prompt contracts (§5) and ExecPlan explicitness (§4).

**"The right amount of structure is somewhere in the middle."** Too little → conflicts, duplication, drift. Too much → fragility. Our approach (structured ExecPlans + flexible scoping rounds) sits in this middle ground.

**Different models for different roles.** Cursor found GPT-5.2 is a better planner than GPT-5.1-Codex (which is trained specifically for coding). This validates our two-tier model approach — strong model for planning, cost-efficient model for execution — rather than using one model for everything.

**Periodic fresh starts combat drift.** Long-running agents accumulate stale assumptions. Our session-based architecture with FollowUpSessionLog + Recovery Ledger provides natural restart points that Cursor's system had to engineer separately.

**Workers don't need to coordinate with each other.** Cursor eliminated inter-worker coordination. Our WIP-1 limit achieves the same effect — only one story executes at a time, so there are no coordination concerns.

### 12.3 Implications for ai-memory Workflow

| Cursor Finding | ai-memory Response |
|---------------|--------------------|
| Planner/Worker is the right split | Already our architecture — `/plan` plans, `/continue` executes |
| Remove unnecessary roles | Keep PO + LE + SA + Explorer. No integrator or QA agent |
| Prompts > harness | Invest in prompt quality for §5 contracts; iterate based on failures |
| Fresh starts needed | FollowUpSessionLog.txt + Recovery Ledger provide these |
| Model selection per role | Opus for `/plan` + `/recover`, Sonnet for `/continue` |

---

