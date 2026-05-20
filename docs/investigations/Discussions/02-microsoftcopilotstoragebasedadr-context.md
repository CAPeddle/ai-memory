## Context

The system aims to provide a unified **memory layer** for:

1. **Coding agent memory**
   - Recall past solutions to build errors, bugs, and implementations
   - Operates across multiple interconnected codebases

2. **Conversation memory**
   - Recall prior discussions across models and platforms
   - Support long-term idea tracking and knowledge synthesis

3. **Agile task tracking**
   - Maintain and render a live task board
   - Allow agents to update task state via REST/MCP

These use cases introduce **different retrieval paradigms**:

| Use Case | Type | Retrieval Requirement |
|----------|------|----------------------|
| Coding memory | Search | Semantic + lexical recall |
| Conversation memory | Search | Semantic recall |
| Agile board | State/query | Structured filtering |

This distinction reveals that the system must support both:

- **Retrieval-oriented queries** (ranking-based)
- **State-oriented queries** (filtering-based)

---

