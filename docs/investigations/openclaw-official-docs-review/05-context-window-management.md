## 5. Context Window Management

| Technique | Purpose |
|-----------|---------|
| **Compaction** | Near context limit → summarize older messages, keep recent intact |
| **Memory Flush** | Before compaction, save important facts to persistent files |
| **Session Pruning** | Trim tool output without full summarization |
| **Successor Transcripts** | After compaction: summary + preserved state + unsummarized tail |
| **Active Memory** | Pre-loads relevant context as hidden prompt prefix (bounded: max 220 chars) |
| **Auto-loading rules** | MEMORY.md always; today+yesterday loaded; older requires explicit search |
| **Identifier preservation** | Compaction preserves opaque IDs/keys during summarization |

---

