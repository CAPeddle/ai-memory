### 3.4 Shared Module Locks

| Module | Lock Holder | Reason |
|--------|-------------|--------|
| `src/AiMemory.Core/` | — | Domain models and interfaces |
| `src/AiMemory.Server/Program.cs` | — | Application root |
| `.github/planning/` | — | Governance files |
| `.github/planning/story-board.md` | — | Board (LE only) |

Rule: Only one story may hold a lock at a time. Only the LE edits the board.

