# Investigation: Context Engineering Principles

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Context engineering strategy for ai-memory — how to feed agents the right information at the right time |
| **Guiding Principle** | **Point, don't dump** — layered, targeted context injection |
| **Sources** | Alfred blog (cognitive memory), Cursor "Scaling Agents" (Jan 2026), OpenAI Codex ExecPlans / PLANS.md |

---

## 1. Executive Summary

Context engineering is the discipline of **designing what information an AI agent receives, when it receives it, and in what form** — as distinct from prompt engineering (how you phrase instructions) or RAG (how you retrieve documents).

For ai-memory, context engineering operates at two levels:

1. **The service as a context provider** — How ai-memory delivers memories to consuming agents (Copilot). The memory service IS a context engineering tool.
2. **The workflow as a context consumer** — How the `/plan`, `/continue`, `/recover` prompts manage their own context budgets to stay effective within token limits.

The core principle: **Point, don't dump.** Never flood an agent's context window with everything available. Instead, provide precise pointers to relevant information and let the agent pull what it needs in layers.

---

## 2. What Context Engineering Means

### 2.1 The Problem It Solves

AI agents have finite context windows. Even at 128K+ tokens, dumping everything an agent might need creates:

| Symptom | Cause |
|---------|-------|
| Hallucination on details | Important facts buried in noise |
| Instruction amnesia | System prompts pushed out by injected content |
| Slow responses | Processing irrelevant material |
| Poor decision quality | Cannot distinguish signal from noise |
| Cost explosion | Paying for tokens that don't contribute |

### 2.2 Context Engineering vs Adjacent Disciplines

| Discipline | Question Answered | ai-memory Relevance |
|------------|-------------------|---------------------|
| **Prompt engineering** | How do I phrase instructions? | Prompt templates in MCP Prompts |
| **RAG** | How do I find relevant documents? | The retrieval engine (FTS5 + vector) |
| **Context engineering** | What goes in the window, when, and how? | The delivery strategy on top of retrieval |

Context engineering sits *above* RAG. RAG finds candidates; context engineering decides what actually enters the context window and in what shape.

### 2.3 The "Point, Don't Dump" Principle

```
BAD:  "Here are all 47 facts about the zoom project..." (dump)
GOOD: "The zoom project uses CMake 3.25+. For more, search memory." (point)
```

Layered context means:
1. **Layer 0 (Always present):** Minimal orientation facts (project name, build system, key constraints)
2. **Layer 1 (On request):** Specific facts relevant to the current task
3. **Layer 2 (Deep dive):** Full episode history, detailed context, only when explicitly needed

The agent should be able to function with Layer 0 alone, get better with Layer 1, and only reach into Layer 2 when solving a specific problem.

---

## 3. Context Delivery Strategy for ai-memory

### 3.1 Three Delivery Mechanisms

| Mechanism | MCP Feature | When Used | Context Cost |
|-----------|-------------|-----------|--------------|
| **Resources** (passive injection) | `memory://facts/{project}` | Agent startup / context refresh | Low — curated summary |
| **Tools** (active pull) | `memory_search` | Agent needs specific information | Variable — depends on query |
| **Prompts** (structured request) | `recall_context` | Before starting a new task | Medium — targeted retrieval |

### 3.2 Resource Design (Layer 0 — Always Available)

MCP Resources are read-only context that agents can request at any time. Design them as **summaries, not dumps**:

```
memory://facts/{project}
```

Returns a **curated, compact** representation:
- Maximum 20 most-recalled facts per project
- Formatted as bullet points (token-efficient)
- Sorted by recall frequency (most useful first)
- Includes fact IDs for drill-down via `memory_inspect`

```
memory://recent-episodes
```

Returns:
- Last 10 episodes across all projects
- One-line summaries (not full content)
- Grouped by session for context

**Design rule:** Resources should fit in ~500 tokens. If an agent needs more, it should use a Tool.

### 3.3 Tool Design (Layer 1 — On Demand)

`memory_search` is the primary context-pull mechanism. Its design embeds context engineering principles:

| Design Choice | Principle Applied |
|---------------|-------------------|
| Default `limit = 10` | Don't flood — return enough, not everything |
| MMR diversity ranking | Don't repeat — each result adds new information |
| Project boosting | Relevance over completeness — local context first |
| Return scores alongside content | Let agent judge what to use |
| Return recall_event_id | Enable feedback loop (not just dump-and-forget) |

**Result format is engineered for context efficiency:**
```
[Score: 0.92] (semantic, zoom) CMake 3.25+ required for zoom project
[Score: 0.87] (episodic, 2025-04-15) Fixed find_package(Qt6) by setting Qt6_DIR first
[Score: 0.81] (semantic, cross-project) Conan 2 toolchain sets CMAKE_PREFIX_PATH
```

- One line per result (not full objects)
- Type and project immediately visible
- Scores help agent decide which to read deeper
- IDs available for `memory_inspect` if deeper context needed

### 3.4 Prompt Design (Layer 1.5 — Structured Retrieval)

MCP Prompts (`recall_context`) provide **guided retrieval patterns** so agents don't have to figure out how to query:

```
Agent thinks: "I'm about to work on CMake configuration for zoom"
Agent uses: recall_context(topic="CMake configuration", project="zoom")
Memory returns: Top relevant facts + recent episodes, pre-formatted for context injection
```

This is the "point" in "point, don't dump" — the prompt tells the memory system what domain to surface, and the system returns only what's relevant.

---

## 4. Context Budget Management

### 4.1 Token Budget Allocation

For a typical 32K output / 128K context agent:

| Category | Token Budget | Use |
|----------|-------------|-----|
| System instructions | ~4K | Prompt file (plan/continue/recover) |
| Governance context | ~2K | Board state, ExecPlan current section |
| Memory context (Layer 0) | ~500 | Project facts resource |
| Memory context (Layer 1) | ~2K max | Search results for current task |
| Working context | ~8K | File contents, tool outputs |
| Available for reasoning | Remainder | Agent thinking + output |

**Rule:** Memory injections should never exceed 10% of the available context window.

### 4.2 Context Conservation in Workflow Prompts

The `/continue` prompt explicitly practices context engineering:

```
Minimise context consumption. Only read what is needed —
never load entire large files when a targeted read suffices.
```

Specific rules applied:
- Read board fresh but only the relevant section
- Read ExecPlan §5b (resume point) before reading all of §4 (tasks)
- Use `grep_search` over `read_file` for large files
- Delegate research to Explorer sub-agents (their context doesn't count)
- Don't load compound-engineering skill unless session is ending

### 4.3 Progressive Disclosure Pattern

```
┌─────────────────────────────────────────────────────┐
│  Agent starts task                                   │
│                                                      │
│  Layer 0: memory://facts/zoom (auto-injected)       │
│  → "zoom uses CMake 3.25+, Qt 6.5, Conan 2"       │
│                                                      │
│  Agent hits a question about find_package            │
│                                                      │
│  Layer 1: memory_search("find_package Qt6 CMake")   │
│  → 3 relevant results with scores                   │
│                                                      │
│  Agent needs full episode context                    │
│                                                      │
│  Layer 2: memory_inspect("01HXY...")                 │
│  → Full episode with agent_context, tags, session   │
└─────────────────────────────────────────────────────┘
```

Each layer costs more tokens but provides deeper context. The agent decides when to escalate.

---

## 5. Source Mixing as Context Engineering

### 5.1 The Cross-Project Knowledge Problem

An agent working on `zoom` needs to know zoom-specific facts. But it also benefits from:
- Cross-project facts (CI conventions, git workflow)
- Patterns from other projects that apply (Conan usage in both zoom and bcf-managers)

**Context engineering solution:** Source mixing with project boosting.

### 5.2 Weighting Strategy

| Source | Boost | Rationale |
|--------|-------|-----------|
| Same project | 1.2× | Most likely relevant |
| Cross-project (NULL) | 1.0× | Always potentially relevant |
| Other project | 1.0× | No penalty — let relevance decide |

This means a highly relevant fact from another project can still surface, but equally-relevant local facts win. The agent doesn't need to explicitly query multiple projects.

### 5.3 Context Shaping in Results

When mixing sources, format results to make provenance immediately clear:

```
## Memory Context (zoom, CMake task)

### From zoom project:
- CMake 3.25+ required
- Qt6_DIR must be set before find_package(Qt6)

### Cross-project:
- Conan 2 toolchain auto-sets CMAKE_PREFIX_PATH

### From similar work (bcf-managers):
- BCF Manager had same Qt6 find issue — resolved via CMAKE_FIND_USE_CMAKE_SYSTEM_PATH
```

The agent can immediately see what's local vs cross-pollinated.

---

## 6. Feedback Loops and Context Quality

### 6.1 The Feedback Problem

Without feedback, the memory system doesn't know which recalled facts actually helped. Over time, noise accumulates and context quality degrades.

### 6.2 Implicit Feedback Signals

| Signal | How Detected | Meaning |
|--------|--------------|---------|
| Fact was in search results AND agent's response references it | Correlation between search and output | Memory was useful |
| Fact was in search results BUT agent ignored it | No reference in output | Memory was possibly irrelevant |
| Agent explicitly called `memory_feedback("helpful")` | Direct tool call | Confirmed useful |
| Same fact recalled 5+ times across different queries | Recall count | Strong utility signal |

### 6.3 Explicit Feedback via Tool

```
memory_feedback(recall_event_id="evt_01HXY...", feedback="helpful")
```

This directly influences:
- **Consolidation scoring** — helpful feedback increases the relevance component
- **Future ranking** — frequently-helpful facts get a subtle boost in RRF

### 6.4 Context Quality Metrics

Track these to ensure the system delivers good context, not just any context:

| Metric | Target | Alarm |
|--------|--------|-------|
| Helpful/Total recall ratio | >60% | <30% suggests noise |
| Average result diversity (inter-result cosine) | <0.7 | >0.85 suggests near-duplication |
| Mean results used by agent | >3 of 10 | <1 of 10 suggests poor relevance |
| Context tokens per useful fact | <200 | >500 suggests verbose formatting |

---

## 7. Anti-Patterns to Avoid

### 7.1 The Seven Context Engineering Anti-Patterns

| # | Anti-Pattern | Description | Mitigation |
|---|-------------|-------------|------------|
| 1 | **Context dumping** | Injecting all known facts at session start | Use Resources (Layer 0) — curated, compact |
| 2 | **Eager retrieval** | Searching memory before knowing what's needed | Let the agent pull when it has a question |
| 3 | **Stale context** | Injecting deprecated facts alongside current ones | `active = 0` soft-delete; supersession chain |
| 4 | **Mono-source** | Only surfacing same-project facts | Source mixing with cross-project visibility |
| 5 | **Duplicate flooding** | Near-identical facts crowding results | MMR diversity ranking (λ = 0.7) |
| 6 | **Unbounded results** | Returning 50 results when 5 suffice | Hard limit default (10), let agent ask for more |
| 7 | **Opaque context** | Injecting facts without provenance or scores | Always include source, project, confidence, score |

### 7.2 The "Dump Detector" Rule

If a context injection exceeds 1000 tokens, ask: **Could this be a pointer instead?**

- Instead of injecting 20 facts: inject top 3 + "use `memory_search` for more about X"
- Instead of full episode history: inject "last session worked on X; search for details"
- Instead of full ExecPlan: inject §5b recovery ledger + task count remaining

---

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

## 10. Implementation Priorities for ai-memory

### 10.1 Phase 1: Minimum Viable Context Engineering

| Feature | Priority | Delivery Track |
|---------|----------|----------------|
| `memory_search` with limit + MMR | Critical | In ST-005 |
| Resource `memory://facts/{project}` (top 20 curated) | High | In ST-007 |
| Formatted results with scores and provenance | High | In ST-007 |
| Default limit = 10, max = 100 | High | In ST-005 |

### 10.2 Phase 2: Feedback and Learning

| Feature | Priority | Delivery Track |
|---------|----------|----------------|
| Recall event logging | High | In ST-005 |
| `memory_feedback` tool | Medium | In ST-007 |
| Recall count tracking on memories | Medium | In ST-003 |
| Context quality metrics endpoint | Low | Future |

### 10.3 Phase 3: Advanced Context Shaping

| Feature | Priority | Delivery Track |
|---------|----------|----------------|
| Consolidation pipeline (auto-promotion) | Medium | ST-008 |
| Cross-project boosting tuning | Low | Future |
| Token budget awareness in results | Low | Future |
| Agent-specific context profiles | Low | Future |

---

## 11. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Resources max 500 tokens | Forces curation; prevents Layer 0 bloat |
| Search default limit 10 | Balances coverage with context cost |
| MMR λ = 0.7 | Slight diversity bias; avoids duplicate flooding |
| Results formatted as one-liners | Token-efficient; agent can drill deeper if needed |
| Feedback is optional, not blocking | Don't add friction to the recall path |
| Provenance always shown | Agent can judge relevance by source + project |
| No auto-injection beyond Resources | Agent controls its own context budget |

---

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

## 13. External Validation: Prompts as Context Engineering (Cursor Research)

**Source:** Cursor "Scaling long-running autonomous coding" (Jan 2026) — trillions of tokens deployed across hundreds of concurrent agents.

### 13.1 "Prompts Matter More"

Cursor's most significant finding for context engineering:

> "A surprising amount of the system's behaviour comes down to how we prompt the agents. Getting them to coordinate well, avoid pathological behaviours, and maintain focus over long periods required extensive experimentation. The harness and models matter, but the prompts matter more."

This validates the entire premise of ai-memory as a context engineering tool. The system prompt IS the primary context engineering surface. Memory augmentation makes that surface richer and more adaptive.

### 13.2 Model Selection as Context Engineering

Cursor found that different models excel at different roles:
- Planning models (GPT-5.2) are better at maintaining big-picture focus
- Coding models (Codex) are better at precise implementation
- Planning models "tend to stop earlier and take shortcuts" when used for execution

**Context engineering implication:** The model itself is a context engineering variable. A planning model processes context differently than an execution model. Our two-tier architecture (Opus for `/plan`, Sonnet for `/continue`) isn't just about cost — it's about matching context processing style to the task.

| Model Tier | Context Processing Style | Task Match |
|-----------|------------------------|------------|
| Strong (Opus) | Broad context synthesis, trade-off evaluation | Planning, recovery, scoping |
| Efficient (Sonnet) | Narrow context following, precise execution | Task execution from explicit plans |

### 13.3 Fresh Starts as Context Reset

Cursor found that long-running agents need "periodic fresh starts to combat drift and tunnel vision." This is a context engineering problem — accumulated context becomes stale or biased over time.

**Our architecture already handles this:**

| Drift Vector | Our Mitigation |
|-------------|----------------|
| Stale assumptions from earlier in the session | Session boundaries + FollowUpSessionLog |
| Context window filled with irrelevant history | `/continue` reads board fresh each session |
| Tunnel vision on one approach | §5c Approach Ledger with rollback triggers |
| Accumulated noise in memory | Consolidation pipeline (future ST-008) |

### 13.4 The Right Amount of Structure

Cursor's coordination spectrum:

```
Too little structure          Right amount           Too much structure
────────────────────┼───────────────────────┼────────────────────
Conflicts, duplication,        Structured plans +     Fragility, bottlenecks,
drift, no ownership            flexible execution      lock contention

                            ▲ Our approach sits here
```

For ai-memory's context delivery, the same principle applies:

| Too little context structure | Right amount | Too much context structure |
|------------------------------|-------------|----------------------------|
| Raw search dump, no scores | Scored results with provenance, layered access | Elaborate metadata, explanatory wrapping, context-about-context |
| No project scoping | Project-boosted results with cross-project visibility | Rigid project isolation |
| No feedback loop | Optional helpfulness feedback | Mandatory feedback blocking recall |

---

## 14. Open Questions

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | Should Resources auto-refresh during a session? | Yes (subscription) vs No (one-shot) | MCP complexity |
| 2 | Should search results include a "try also" suggestion? | Yes (guided exploration) vs No (simpler) | Context discovery |
| 3 | Token budget awareness — should the memory service know the agent's context limit? | Yes (adaptive results) vs No (fixed limits) | Sophistication |
| 4 | Should episodic memories summarize before returning, or return raw? | Summarize (cheaper) vs Raw (more detail) | Token cost vs fidelity |
| 5 | Should ExecPlan living sections (Surprises, Decisions) be auto-ingested as episodic memories on story completion? | Yes (automatic knowledge capture) vs No (manual curation) | Automation vs noise |
