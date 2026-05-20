### 5.1 Realistic Concurrency for ai-memory

- **Typical**: 1 agent session active at a time
- **Peak**: 2–3 sessions (user has multiple VS Code windows with Copilot)
- **Theoretical max**: 5 simultaneous sessions (user + automated background agents)
- **Write pattern**: Bursty — clusters of writes during active interaction, then quiet

