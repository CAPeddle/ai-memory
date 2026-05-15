Combining these into a **Hybrid Memory System** isn't just possible—it’s arguably the most robust way to build an autonomous agent. In this model, you treat the **Open Brain** as your "Subconscious/Long-Term Memory" and the **LLM Wiki** as your "Working/Executive Memory."

This architecture solves the primary weakness of each: it removes the high "write-tax" of the Wiki while fixing the "noise and drift" issues of the Open Brain.

## The Hybrid Architecture: A Three-Tiered Approach

You can structure your Obsidian vault as a pipeline where information is "promoted" through different levels of refinement.

### 1. Tier 1: The Shards (The Subconscious)

This is the **Open Brain** layer.

* **Input:** Every chat transcript, raw brainstorm, Git commit message, and "note to self."
* **Storage:** A `/shards/` folder with timestamped files.
* **Function:** Raw storage. You never manually edit these. They provide the "historical vibe" and the granular "why" behind decisions.

### 2. Tier 2: The Wiki (The Knowledge Base)

This is the **Curated** layer.

* **Process:** An agent (or you) periodically "harvests" the shards. It identifies patterns, technical constraints, and finalized decisions.
* **Storage:** The `/wiki/` or `/knowledge/` folder.
* **Function:** The "Source of Truth." These files are clean, interlinked, and easy for an agent to parse quickly without getting lost in old, discarded ideas.

### 3. Tier 3: The Storyboard (The Action Layer)

This is the **Executive** layer.

* **Input:** High-level goals derived from the Wiki.
* **Storage:** The `Stories/` folder with YAML metadata (`status: To Do`).
* **Function:** This is the agent's immediate "To-Do" list. It tells the agent **what** to do right now.

---

## How the Agent Navigates This System

When you ask an agent to pick up a task, it follows a **Reclamation & Synthesis** loop:

1. **Goal Identification:** The agent scans the **Storyboard** (Tier 3) for a `To Do` task.
2. **Knowledge Retrieval:** It reads the linked **Wiki** files (Tier 2) to understand the current technical standards (e.g., "How do we handle 2D physics in this specific Godot project?").
3. **Context Synthesis:** It performs a semantic search of the **Shards** (Tier 1) for the last 5 days to see if there were any specific "messy" conversations or failed experiments that haven't been "promoted" to the Wiki yet.
4. **Execution:** It acts with the wisdom of the history (Shards) and the clarity of the current plan (Wiki).

## Comparing the Hybrid Roles

| Layer | Type | Agent's Cognitive Role | Human Interaction |
| --- | --- | --- | --- |
| **Shards** | Raw Data | **Archaeologist:** Digging for clues. | High (The "Brain Dump"). |
| **Wiki** | Curated | **Librarian:** Referencing the rules. | Low (Occasional cleanup). |
| **Storyboard** | Active | **Specialist:** Executing the task. | Medium (Setting goals). |


## Potential Additional Features
### Implementation in Obsidian

You can automate the "Promotion" phase. You could have a "Janitor Agent" that runs every night, looks at the new shards, and asks: *"Is there anything in these raw notes that changes our official 'Steering Logic' wiki page?"* If yes, it updates the Wiki and archives the shard.

This creates a **Living Documentation** system where the storyboard isn't just a list of tasks, but the tip of an iceberg of synthesized project intelligence.

Does the idea of a background "Janitor Agent" promoting shards to the Wiki feel like a useful automation, or would you prefer to keep that curation step manual to ensure total control?
