---
name: compound-engineering
description: 'Capture governance drift and workflow learnings during a session, then promote them into prompts, instructions, skills, stories, or query packets. Use for governance audits, prompt drift, and recurring workflow remediation.'
summary: 'Capture governance drift and workflow learnings during a session, then promote them into prompts, instructions, skills, stories, or query packets. Use for governance audits, prompt drift, and recurring workflow remediation.'
asset_type: "skill"
status: "active"
owners:
	- "ai-memory-maintainers"
source_path: ".github/skills/compound-engineering/SKILL.md"
user-invocable: true
---

# Compound Engineering — Minimal Governance Review Skill

Use this skill when a session needs to preserve governance learnings that should survive beyond the current chat.

## Tier 1 — Detect During Work

Record a detection when any of the following occurs:

1. A prompt points to a missing artifact or directory.
2. Two governance files define the same workflow differently.
3. A board story and an investigation doc disagree about ownership or acceptance criteria.
4. A session creates a workaround that should become a standing instruction, prompt rule, or checklist item.

Each detection should capture:

- What drift or gap was found
- Which files proved it
- Whether the fix belongs in a prompt, instruction, skill, board story, or query packet

## Tier 2 — Review At Session End

Before ending a governance-focused session:

1. Convert unresolved detections into a board story or query packet.
2. Promote stable workflow rules into `.github/prompts/`, `.github/instructions/`, or this skill.
3. Update `FollowUpSessionLog.txt` so the next session can resume with minimal context.
4. Do not promote speculative ideas; only promote rules supported by concrete evidence from the working tree.

## Git Tooling Interaction Loop

Use this optional loop when git operations required repeated retries, tool changes, or fallback behavior during a session.

1. Count interactions: record how many times git was used for status, add, diff, log, or commit during the workflow.
2. Count pivots: record each time the git execution path changed because output was unusable or the prior path failed.
3. Capture evidence paths: point to concrete artifacts such as `FollowUpSessionLog.txt`, the active ExecPlan §5b/§6c, and related board or story files.
4. Promote with thresholds:
	- If one-off and session-specific, keep it as an `Avoidance` note in `FollowUpSessionLog.txt`.
	- If repeated or process-level, promote a concise fallback rule to `.github/instructions/session-resilience.instructions.md`.
5. Keep promotions minimal: avoid duplicating the same fallback rule across prompt, instruction, and skill unless each layer serves a distinct purpose.

## Promotion Heuristic

- Prompt: use when the behavior should guide a repeatable agent workflow.
- Instruction: use when the rule should always apply to the repository.
- Skill: use when the workflow is optional and domain-specific.
- Board story: use when the change needs a scoped planning and execution cycle.
- Query packet: use when planning should start from a preserved evidence bundle.

## Anti-Patterns

1. Do not convert every observation into a permanent rule.
2. Do not duplicate the same rule across prompt, instruction, and skill without a clear reason.
3. Do not treat a query packet as a substitute for an ExecPlan.