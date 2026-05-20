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

