## 2. The Retrieval Mechanic: Synthesis at Recall

When the agent is ready to work, it doesn't "look for a task." It performs a **Synthesis Query**.

### The "Virtual Board" vs. The "Static Board"

* **LLM Wiki (Static):** The agent reads `Stories/Task_01.md`.
* **Open Brain (Virtual):** The agent runs a query: *"Based on all shards from the last 48 hours and the current state of the Godot project, what are the top 3 high-priority technical debt items?"*

The "Storyboard" doesn't actually exist as a file. It is a **temporary hallucination** (in the positive sense) generated in the agent's context window based on the raw data it just retrieved.

---

