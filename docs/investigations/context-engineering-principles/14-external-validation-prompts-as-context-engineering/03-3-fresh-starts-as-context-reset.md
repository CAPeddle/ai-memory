### 13.3 Fresh Starts as Context Reset

Cursor found that long-running agents need "periodic fresh starts to combat drift and tunnel vision." This is a context engineering problem — accumulated context becomes stale or biased over time.

**Our architecture already handles this:**

| Drift Vector | Our Mitigation |
|-------------|----------------|
| Stale assumptions from earlier in the session | Session boundaries + FollowUpSessionLog |
| Context window filled with irrelevant history | `/continue` reads board fresh each session |
| Tunnel vision on one approach | §5c Approach Ledger with rollback triggers |
| Accumulated noise in memory | Consolidation pipeline (future ST-008) |

