## 9. Compound Engineering as Context Engineering

### 9.1 The Connection

Compound engineering (Tier 1 detections + Tier 2 session review) IS context engineering for future sessions:

- **Tier 1 detections** = identifying what should become permanent context
- **Tier 2 promotion** = writing it into governance files that get loaded as Layer 0
- **Memory consolidation** = automated version of the same process

### 9.2 The Flywheel

```
┌──────────────────────────────────────────────────┐
│ Session N                                         │
│                                                    │
│ 1. Agent works, encounters facts                  │
│ 2. Tier 1: detects "this is worth remembering"   │
│ 3. memory_log_episode() records the observation  │
│ 4. Tier 2 (session end): reviews detections      │
│ 5. Promotes to instructions/skills/memory         │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼ (consolidation / promotion)
┌──────────────────────────────────────────────────┐
│ Session N+1                                       │
│                                                    │
│ 1. Layer 0 now includes promoted facts            │
│ 2. Agent starts with better context               │
│ 3. Better context → better decisions              │
│ 4. Better decisions → fewer errors to remember    │
│ 5. System converges toward effective context      │
└──────────────────────────────────────────────────┘
```

Each session improves the context available to the next. This is the "compound" in compound engineering.

---

