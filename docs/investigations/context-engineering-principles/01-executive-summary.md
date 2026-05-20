## 1. Executive Summary

Context engineering is the discipline of **designing what information an AI agent receives, when it receives it, and in what form** — as distinct from prompt engineering (how you phrase instructions) or RAG (how you retrieve documents).

For ai-memory, context engineering operates at two levels:

1. **The service as a context provider** — How ai-memory delivers memories to consuming agents (Copilot). The memory service IS a context engineering tool.
2. **The workflow as a context consumer** — How the `/plan`, `/continue`, `/recover` prompts manage their own context budgets to stay effective within token limits.

The core principle: **Point, don't dump.** Never flood an agent's context window with everything available. Instead, provide precise pointers to relevant information and let the agent pull what it needs in layers.

---

