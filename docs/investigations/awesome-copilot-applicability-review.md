# Investigation: Awesome Copilot Applicability for ai-memory

| Field | Value |
|-------|-------|
| **Created** | 2026-05-02 |
| **Status** | Complete |
| **Scope** | Applicability of `github/awesome-copilot` patterns to the creation and maintenance of the ai-memory repository |
| **Method** | Exhaustive review split across delegated slices: customization assets, automation surfaces, governance model, and onboarding/discoverability |
| **Recommendation** | Adopt a narrow subset now: metadata-backed asset contracts, validation, inventories, contribution rules, and selective governance automation. Defer marketplace-style packaging and large-scale public distribution patterns. |
| **Sources** | Local: `docs/investigations/workflow-and-prompt-design.md`, `docs/investigations/context-engineering-principles.md`. External primary sources: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/README.agents.md`, `docs/README.instructions.md`, `docs/README.skills.md`, `docs/README.hooks.md`, `docs/README.workflows.md`, `cookbook/README.md`, `https://awesome-copilot.github.com/llms.txt` from `github/awesome-copilot` |

---

## Read This When

Reviewing repo governance and AI-customization asset patterns; deciding which awesome-copilot practices to adopt for prompts, instructions, and validation.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. Executive Summary | [1. Executive Summary](./01-executive-summary.md) |
| 2 | 2. Evaluation Frame | [2. Evaluation Frame](./02-evaluation-frame.md) |
| 3 | 3. Adoption Candidates | [3. Adoption Candidates](./03-adoption-candidates.md) |
| 4 | 4. Maintenance Patterns Worth Reusing | [4. Maintenance Patterns Worth Reusing](./04-maintenance-patterns-worth-reusing.md) |
| 5 | 5. Gaps Versus the Current Repo | [5. Gaps Versus the Current Repo](./05-gaps-versus-the-current-repo.md) |
| 6 | 6. Concrete Follow-up Tasks | [6. Concrete Follow-up Tasks](./06-concrete-follow-up-tasks.md) |
| 7 | 7. Patterns To Defer or Reject | [7. Patterns To Defer or Reject](./07-patterns-to-defer-or-reject.md) |
| 8 | 8. Recommended Backlog Translation | [8. Recommended Backlog Translation](./08-recommended-backlog-translation.md) |
| 9 | 9. Bottom Line | [9. Bottom Line](./09-bottom-line.md) |

## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale behind approved decisions.
Binding requirements and architecture decisions live in the Tier 1 documents:
- [SRS v1.1](../../requirements/SRS.md)
- [ADRs](../../design/adr/)
- [SystemDesign.md](../../design/SystemDesign.md)
- [delivery-plan.md](../../planning/delivery-plan.md)
