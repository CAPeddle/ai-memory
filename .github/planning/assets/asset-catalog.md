# Governance Asset Catalog

## Assets

| asset_id | asset_type | name | status | owners | source_path | summary |
|---|---|---|---|---|---|---|
| instruction:.github/instructions/coding-standards.instructions.md | instruction | Coding Standards | active | ai-memory-maintainers | .github/instructions/coding-standards.instructions.md | Repository coding conventions and architecture constraints for ai-memory |
| instruction:.github/instructions/session-resilience.instructions.md | instruction | Session Resilience | active | ai-memory-maintainers | .github/instructions/session-resilience.instructions.md | Session-level execution safety and commit hygiene rules |
| prompt:.github/prompts/continue.prompt.md | prompt | Continue | active | ai-memory-maintainers | .github/prompts/continue.prompt.md | Execute Ready ExecPlans mechanically for ai-memory, with atomic commits and board maintenance |
| prompt:.github/prompts/governance-review.prompt.md | prompt | Governance Review | active | ai-memory-maintainers | .github/prompts/governance-review.prompt.md | Audit ai-memory governance artifacts for drift, apply safe fixes, escalate risky changes |
| prompt:.github/prompts/plan-new.prompt.md | prompt | Plan New | active | ai-memory-maintainers | .github/prompts/plan-new.prompt.md | Add a new ai-memory story through PO-guided intake, targeted research, and priority scoping |
| prompt:.github/prompts/plan.prompt.md | prompt | Plan | active | ai-memory-maintainers | .github/prompts/plan.prompt.md | Collaborative planning for ai-memory: scoping, story creation, query packets, and ExecPlan authoring |
| prompt:.github/prompts/recover.prompt.md | prompt | Recover | active | ai-memory-maintainers | .github/prompts/recover.prompt.md | Recover ai-memory sessions through forensic analysis, avoidance notes, and ExecPlan annotations |
| skill:.github/skills/compound-engineering/SKILL.md | skill | compound-engineering | active | ai-memory-maintainers | .github/skills/compound-engineering/SKILL.md | Capture governance drift and workflow learnings during a session, then promote them into prompts, instructions, skills, stories, or query packets. Use for governance audits, prompt drift, and recurring workflow remediation. |

## Reserved Future Categories

- agent
- hook
- workflow
- plugin
