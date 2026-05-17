## 5. Recall Tracking and Promotion Scoring

### 5.1 Recall Flow

```
Agent query arrives
        │
        ▼
┌─────────────────┐
│  Search both    │
│  semantic +     │
│  episodic       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rank + MMR     │
│  diversify      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Return results │────▶│  Log recall     │
│  to agent       │     │  events         │
└─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Update recall  │
                        │  counts on      │
                        │  memories       │
                        └─────────────────┘
```

### 5.2 Feedback Loop

After returning results, agents can optionally report feedback:
- `helpful` — the memory was used in the response
- `irrelevant` — the memory was ignored

This feedback directly influences the relevance score in the consolidation pipeline.

---

