### 6.2 Implicit Feedback Signals

| Signal | How Detected | Meaning |
|--------|--------------|---------|
| Fact was in search results AND agent's response references it | Correlation between search and output | Memory was useful |
| Fact was in search results BUT agent ignored it | No reference in output | Memory was possibly irrelevant |
| Agent explicitly called `memory_feedback("helpful")` | Direct tool call | Confirmed useful |
| Same fact recalled 5+ times across different queries | Recall count | Strong utility signal |

