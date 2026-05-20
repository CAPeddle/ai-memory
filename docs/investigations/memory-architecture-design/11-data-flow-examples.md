## 11. Data Flow Examples

### 11.1 User Teaches a Fact

```
User: "Remember that the zoom project requires Qt 6.5 or higher"
  │
  ▼
memory_teach(content="zoom project requires Qt 6.5+", project="zoom")
  │
  ▼
┌─────────────────────┐
│ 1. Generate embedding│
│ 2. Dedup check      │ ← cosine sim < 0.95 to all existing? proceed
│ 3. Insert semantic  │
│ 4. Return ID        │
└─────────────────────┘
```

### 11.2 Agent Observes During Session

```
Agent working on zoom CMake configuration discovers a fact
  │
  ▼
memory_log_episode(
  content="Qt6_DIR must be set before find_package(Qt6) in CMake",
  session_id="sess_01HXY...",
  project="zoom"
)
  │
  ▼
┌─────────────────────┐
│ 1. Generate embedding│
│ 2. Insert episodic  │
│ 3. Return ID        │
└─────────────────────┘
```

### 11.3 Consolidation Promotes a Pattern

```
Consolidation pipeline runs (scheduled or triggered)
  │
  ▼
┌─────────────────────────────────────────────┐
│ 1. Cluster recent episodic memories         │
│ 2. Find cluster: 4 episodes mention         │
│    "Qt6_DIR needed before find_package"     │
│    across zoom and bcf-managers projects    │
│ 3. Score: freq=0.8, diversity=0.9, rel=0.6 │
│    composite = 0.78 ≥ 0.7 threshold        │
│ 4. Generate consolidated fact               │
│ 5. Insert into semantic_memories            │
│    source='promoted', project=NULL          │
│ 6. Mark source episodes promoted=1          │
└─────────────────────────────────────────────┘
```

---

