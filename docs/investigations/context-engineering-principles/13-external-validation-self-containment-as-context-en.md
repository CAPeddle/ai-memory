## 12. External Validation: Self-Containment as Context Engineering (OpenAI Codex PLANS.md)

**Source:** OpenAI Codex ExecPlans cookbook — PLANS.md pattern for multi-hour autonomous work.

### 12.1 The Self-Containment Principle

The Codex PLANS.md establishes a principle that extends "point, don't dump" with a complementary rule: **when you do provide context, make it self-contained.**

> "Do not point to external blogs or docs; if knowledge is required, embed it in the plan itself in your own words."

This creates a nuanced two-rule context engineering framework:

| Rule | When It Applies | Example |
|------|-----------------|--------|
| **Point, don't dump** | Runtime context injection (memory → agent) | Search returns 10 scored results, not 500 raw facts |
| **Embed, don't reference** | Planning artifacts (ExecPlan, instructions) | Plan includes the needed SQL syntax, not "see SQLite docs" |

The distinction: *runtime* context should be minimal and layered; *planning* context should be complete and self-sufficient. A stateless agent with no prior memory must be able to execute from only the ExecPlan.

### 12.2 Observable Outcomes as Context Anchors

PLANS.md mandates anchoring plans with observable outcomes rather than implementation attributes:

```
BAD:  "Added a HealthCheck struct"              (implementation detail)
GOOD: "GET /health returns 200 with body OK"    (observable outcome)
```

This is context engineering at the planning layer — observable outcomes give the executing agent a concrete verification target, reducing the need for additional context about what "success" looks like.

**Application to ai-memory search results:** When memory returns episodic memories about past work, prefer outcome-framed summaries over implementation-framed ones:

```
BAD:  "Modified MemoryRepository.cs to add SQLite connection pooling"
GOOD: "SQLite connection pooling reduced p95 search latency from 45ms to 12ms"
```

### 12.3 Living Documents as Accumulated Context

PLANS.md mandates four living sections (Progress, Surprises & Discoveries, Decision Log, Outcomes & Retrospective). These are context engineering artifacts — they accumulate knowledge that would otherwise be lost between agent sessions:

| Living Section | Context Engineering Function |
|---------------|-----------------------------|
| **Progress** (timestamped) | Velocity context — how fast is work moving? |
| **Surprises & Discoveries** | Hard-won knowledge that prevents repeat mistakes |
| **Decision Log** | Rationale context — why was this approach chosen? |
| **Outcomes & Retrospective** | Summary context for future planning sessions |

These map directly to ai-memory's episodic memory type. When an ExecPlan is completed, its living sections should be ingested as episodic memories — they contain exactly the kind of hard-won context that future agents need.

---

