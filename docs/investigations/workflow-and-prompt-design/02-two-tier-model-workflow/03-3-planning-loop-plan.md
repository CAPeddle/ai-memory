### 2.3 Planning Loop (`/plan`)

Two-phase planning model with a context compact between phases:

**Non-negotiable rule:** planning is collaborative. No query packet, story shaping, or ExecPlan direction may be produced unilaterally without back-and-forth with the PO using `vscode_askQuestions`.

**Phase 1 — Query Packet (collaborative scoping)**
1. PO runs `/plan` with a strong model
2. LE determines planning mode: user-directed, plan-review resolution, or board scan
3. LE runs interactive scoping rounds with PO using `vscode_askQuestions`:
   - Intent check — confirm understanding
   - Direction exploration — surface trade-offs with bounded options
   - Scope lock — confirm in/out scope and key decisions
4. LE captures all decisions in a **query packet** under `.github/planning/query-packets/`
5. Signal PO to compact context

