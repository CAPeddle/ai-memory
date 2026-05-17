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

