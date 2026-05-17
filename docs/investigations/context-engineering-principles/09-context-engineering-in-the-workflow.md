## 8. Context Engineering in the Workflow

### 8.1 How `/plan` Engineers Context

| Phase | Context Strategy |
|-------|-----------------|
| Board read | Full board (needed for prioritization) |
| Story scoping | Only the target story + its dependencies |
| ExecPlan writing | Target story + investigation docs (pointed, not all) |
| Review rounds | Incremental — show PO only what changed since last round |

### 8.2 How `/continue` Engineers Context

| Step | Context Strategy |
|------|-----------------|
| Board read | Full board (cheap, single file) |
| Find work | Only In Progress column |
| Load ExecPlan | §2b first (is it Ready?), then §5b (where to resume), then current task only |
| Execute task | Task instructions + targeted file reads |
| After task | Minimal — update §5b, commit |

### 8.3 How Memory-Augmented Agents Should Work

```
1. Session start:
   → Agent receives Layer 0 automatically (memory://facts/{project} resource)
   → ~500 tokens of core project facts

2. Task context:
   → Agent uses recall_context prompt before starting work
   → Memory service returns targeted Layer 1 facts for the specific topic
   → ~1-2K tokens of relevant knowledge

3. Problem-solving:
   → Agent hits an issue and actively searches memory
   → memory_search("specific question about specific thing")
   → Gets 5-10 diverse, scored results
   → Optionally drills into one with memory_inspect

4. Session learning:
   → Agent observes something worth remembering
   → memory_log_episode("discovered that X because Y", session, project)
   → Minimal token cost (write operation)

5. Session end:
   → Agent summarizes key learnings as episodes
   → Future sessions benefit via Layer 0/1 retrieval
```

---

