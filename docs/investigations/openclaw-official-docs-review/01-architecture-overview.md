## 1. Architecture Overview

OpenClaw uses a **file-based, tiered memory architecture** with distinct temporal layers:

| Layer | File | Scope | Auto-loaded? |
|-------|------|-------|--------------|
| **Long-term memory** | `MEMORY.md` | Durable facts, preferences, decisions | Yes — every session |
| **Daily notes** | `memory/YYYY-MM-DD.md` | Running context, observations | Today + yesterday |
| **Dream diary** | `DREAMS.md` | Consolidation summaries for human review | Optional |
| **Short-term dreaming store** | `memory/.dreams/` | Machine state: recall traces, phase signals | Internal only |
| **Commitments** | (opt-in) | Short-lived follow-up reminders | Delivered via heartbeat |
| **Memory Wiki** | `memory-wiki` plugin | Structured knowledge with contradiction tracking | Optional |

**Key principle:** No hidden state — the model only remembers what gets saved to disk as plain Markdown.

---

