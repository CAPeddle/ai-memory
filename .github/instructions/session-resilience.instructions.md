# Session Resilience

These rules apply to every agent session regardless of prompt mode.

## Atomic Commits

After every ExecPlan task completion:
1. Stage changed files with `git add`
2. Commit with Conventional Commit format:
   ```
   type(scope): description

   Story: ST-N
   Task: §4.X
   ```
3. Update Recovery Ledger §5b immediately after commit
4. Refresh `Current Resume State` and append a timestamped `Progress History` row

## Conventional Commit Types

| Type | Use |
|------|-----|
| `feat` | New functionality |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `chore` | Build, CI, tooling |
| `style` | Formatting, whitespace |

## FollowUpSessionLog

At session end, replace (not append) `FollowUpSessionLog.txt` with:
- What was accomplished this session (max 10 lines)
- Where next session should resume (ExecPlan path + task number)
- Any Avoidance rules from this session
- Current board state (one-line summary per In Progress/Review story)

Maximum 40 lines. Must be parseable by a fresh agent with no prior context.

## WIP Limits

- Maximum 1 story In Progress at a time
- Maximum 1 story in Review at a time
- If both slots full, resolve Review before starting new work

## Lock Protocol

Only one story may hold a module lock at a time. Locks are declared in the story's ExecPlan §3 Preconditions and released on story completion.

| Module | Lock Scope |
|--------|-----------|
| `src/AiMemory.Core/` | Domain models and interfaces |
| `src/AiMemory.Server/Program.cs` | Application root / DI registration |
| `.github/planning/` | Governance files (LE only) |
| `.github/planning/story-board.md` | Board state (LE only) |
