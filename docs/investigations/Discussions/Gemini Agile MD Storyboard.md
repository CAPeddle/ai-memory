I want to discuss how to create a story based agent MD file type agile storyboard.

That sounds like an interesting project! To get started, are you thinking about structuring the user stories, defining the tasks for each story, or maybe how to visualize the whole thing on the board? What's the main part you'd like to focus on first?

The mechanics of how I would manage the stories so that my agents can pick up the stories.

Gotcha. For mechanics, you'd probably want to define a clear structure for each story in the MD file, maybe with a title, description, acceptance criteria, and maybe even individual tasks. You could use statuses like 'To Do', 'In Progress', and 'Done' to track their flow, and perhaps assign them to a specific agent. Are you thinking of using a file per story, or keeping them all in one big document?

Let's revisit the problem, the original requirement.

No problem, let's step back. You want to make sure your agents can clearly see which stories to work on and how to pick them up effectively. So, is the idea that an agent would read the MD files, look for a story with a 'To Do' status, and then change it to 'In Progress' when they start? And what information does an agent need to know to actually complete the story?

Well, that's the thing. I want to confirm that there isn't an existing solution that addresses the problem of human to agent task management.

Yes, there are actually quite a few tools out there that handle task management between humans and agents. Platforms like Wrike and ClickUp are embedding AI to help assign tasks or provide context. There are also frameworks like LangChain or CrewAI that developers use to customize those collaborations. Were you looking for something more specific that these don't cover?

You know, I don't know what they cover, so it would be a research spike to check for requirements overlap.

That makes sense. To help define those requirements for the agents, it might be useful to pinpoint what you're trying to achieve. For example, do the agents need to update status, read specific tasks, or maybe even provide progress reports back to your human team? Knowing those priorities would clarify what you're looking for.

Let's start with a proposed workflow and then try and map that to existing tools.

I like that approach. So, for a basic workflow, maybe you create a story in an MD file with a status of 'To Do'. Then, when an agent picks it up, it changes the status to 'In Progress', and when they're done, they update it to 'Done'. You might also want a human to do a final review after that. How does that basic flow sound to you?

Sounds good. Drop the assumption that it's an MD file. We need to define how the agent interacts with the story first.

Understood, let's drop the MD format. So, for the agent interaction, we could say that there's a central system where stories are stored. The agent pulls details from there, maybe via an API, to find a suitable story with that status. It then updates the status in the system directly and works on it. Does that make sense for how the agent would pull the work?

That sounds great.

Perfect. So we've got the start of a workflow where agents pull tasks from a central system by updating status. We could also define that agents need to look for structured tasks within the story description and update those individually. Before we move to mapping to tools, are there any other actions you want the agent to take within the story?

The agent needs to be able to interact with codebases.

Got it, interacting with codebases is crucial. So, we'll need the agent to be able to read files, write new code, run tests, and push changes, all related to the specific story tasks. We could also include that the agent needs to link the codebase commits to the story on the board for clarity. Does that sound like what you had in mind?

And that does yes.

Great. So we've got the workflow defined and that the agent interacts with the codebase. Now, thinking about tools, many platforms like Jira or GitLab have integrations with AI coding tools, like GitHub Copilot. There are also local approaches like taskmd, which manage tasks on your repo. Based on your requirements, does one of those broad categories feel like a closer fit?

It would have to be a free system for me to use it on personal scale.

A free system on a personal scale is definitely doable. Trello is great for free, simple visual task boards and can have basic automations added. ClickUp also offers a free plan with a lot of features and some AI capabilities like document editing. Or, if you want local control, those text-based markdown files maintained with your codebase can be managed for free using any code editor. Do any of those sound interesting to explore?

They do capture this in a document that we can pick this up later.

Yes, I've captured the key points. We've discussed a workflow where agents pull tasks from a central system, interact with codebases, and we focused on free tools like Trello, ClickUp, or markdown files. This conversation is recorded, so we can pick this up anytime. Is there anything else you'd like to add about that?

Make sure to capture the tasks.md option as well.

Absolutely, I'll make sure tasks.md is included in the summary. We can definitely think through how those files might be structured to work best with your agents. Anything else you'd like to make sure is noted?

I like the concept of layered context so that the agents don't have to pull everything all at once. They can incrementally find details that are needed.

Layered context is a great idea for efficiency. We can document that the agent would first pull the high level summary and status, and then dig into the specific task details or acceptance criteria only when it starts working on them. That prevents information overload. Is there any other part of the process where that kind of tiered information would be helpful?

Thank you. You can close the live session for now.

You're very welcome! I've got all the key details noted from our project planning. Feel free to continue discussing this with me or the other Gemini interface whenever you're ready to pick it up again. Have a great day!

Let's add to the mix the option of tracking all this through an obsidian document database file structure?

Using **Obsidian** as a document database for an agile storyboard is a great fit for AI agents because it treats **files as records** and **folders as tables**. Since everything is plain text (Markdown), an agent can parse and edit the data without a heavy API layer.

Here is how you can structure an Obsidian vault to act as a functional, layered-context agile board for your agents:

### 1. The "Database" Structure

In Obsidian, you move away from one big file and toward a **Folder-per-Type** or **Property-driven** system.

* **`Stories/` Folder:** Each `.md` file is a single User Story.
* **`Tasks/` Folder:** (Optional) More granular sub-tasks linked to a story.
* **`Codebase_Maps/` Folder:** Markdown files describing the file structure or logic of your repositories to provide context.

### 2. Properties as Metadata (The Agent's API)

Use Obsidian's **Properties** (YAML frontmatter) at the top of each story file. This is what the agent "reads" to understand the state of the board.

```markdown
---
type: story
status: To Do
priority: High
assignee: Agent_A
layered_context: [[Technical_Spec_A]]
created: 2026-05-10
---
# Story: Implement Godot Physics Tracker
As a developer, I want the agent to...

```

### 3. The "Board" (The Human View)

To make this look like a storyboard for *you*, use the **Dataview** plugin. It creates dynamic tables that look like a database but are actually just queries of your files.

> **Example Dataview Query for your "To Do" list:**
> ```dataview
> TABLE priority, assignee
> FROM "Stories"
> WHERE status = "To Do"
>
> ```
>
>

### 4. Implementing Layered Context

This addresses your requirement for **incremental discovery**. You can prevent the agent from "hallucinating" or getting overwhelmed by splitting information across linked files:

1. **Layer 1 (The Story):** The agent reads the `.md` file in the `Stories/` folder. It sees the high-level goal and metadata.
2. **Layer 2 (The Links):** Inside the story, you include `[[Internal Links]]` to specific technical requirements or codebase maps.
3. **Layer 3 (The Pull):** The agent only reads those linked files *after* it has committed to the story. It "navigates" the vault like a wiki rather than downloading a massive prompt.

### 5. The Agent Interaction Mechanic

Since you're a developer, you can have your agent script interact with the vault like this:

* **Scanning:** The agent runs a simple `grep` or uses the `obsidian-cli` to find all files where `status: To Do`.
* **Claiming:** It modifies the file's YAML to change `status` to `In Progress` and `assignee` to its name.
* **Execution:** It follows the `[[links]]` inside the file to find which parts of the codebase it needs to touch.
* **Closing:** It updates the YAML to `status: Done` and appends a link to the Pull Request or a `Review_Notes.md` file.

### Why this works for "Personal Scale":

* **Free:** No monthly subscription like Jira or ClickUp.
* **Git-Ready:** Since it's all text files, you can version control your "Storyboard Vault" alongside your code.
* **Offline/Local:** Your agents can run locally on your machine, reading the files directly from the disk with zero latency.

Does this "files-as-records" approach feel like it aligns with how you'd want to script your agents' behavior?

Something like andrey karpathy 's llm wiki?

Exactly—this aligns perfectly with Karpathy's **"LLM Knowledge Base"** (or LLM Wiki) philosophy he popularized recently.

The core shift in his approach is moving from **"Retrieve" to "Compile."** Instead of an agent just searching for chunks of data when it needs them (standard RAG), the agent actively maintains and "compiles" a structured, interlinked set of Markdown files that represent the project's current "truth."

Here is how your **Agile Storyboard** maps to that Karpathy-style architecture:

### 1. The "Librarian" Agent (Status Management)

In Karpathy’s model, the LLM acts as a librarian. For your storyboard, this means the agent doesn't just read the `To Do` list; it **manages the integrity** of the board.

* **The Index:** You have a `Main_Board.md` (or index file) that acts as the entry point. The agent reads this first to see the high-level state of all stories.
* **The Linking:** When a story references a specific part of your code or a previous design decision, it uses a `[[wiki-link]]`. The agent knows it can "hop" to that file only if it needs deeper context.

### 2. The `raw/` vs. `wiki/` Split

Karpathy suggests a "sacred" `raw/` directory for immutable source data. You can apply this to your agile workflow:

* **`raw/requirements/`**: This is where you dump your initial brain-dumps, chat transcripts, or messy feature requests. The agent never edits these.
* **`storyboard/`**: This is the "compiled" wiki. The agent reads the raw requirements and "compiles" them into clean, structured User Story files with YAML properties (`status`, `priority`, etc.).

### 3. Layered Context (Preventing the "Lobotomy")

One of the main problems Karpathy addresses is the "context-limit reset"—where an agent forgets the "vibe" or logic of a project once a session ends.

* **Incremental Discovery:** By using the Obsidian folder structure, the agent "traverses" the knowledge graph.
* **Context Injection:** Instead of passing the whole codebase, you pass the `index.md` and the specific `story_file.md`. The story file contains links to `[[Architecture_Map.md]]` or `[[API_Specs.md]]`. The agent follows these links only as needed, keeping its "working memory" (the context window) focused on the task at hand.

### 4. Vibe Coding & The Agent UI

Karpathy often mentions having an agent open on one side and Obsidian on the other.

* **Human-in-the-loop:** You can watch the "graph view" in Obsidian grow as the agent creates new tasks or links stories together.
* **The MD Database:** Since you’re looking for a free, personal-scale solution, using a Git-backed Obsidian vault means your "database" is just a folder of files. You can use **Claude Code** or a custom script to point an agent at that folder and say, *"Scan the index, pick the highest priority story, and update the status to 'In Progress'."*

### How this maps to your "Story Agent" script:

| Karpathy Concept | Your Storyboard Implementation |
| --- | --- |
| **CPU** | The LLM (Agent) |
| **RAM** | The Context Window (Current Story + active linked files) |
| **Disk** | The Obsidian Vault (Markdown files) |
| **Compiler** | The agent’s process of turning `raw/` notes into `storyboard/` tasks |

By treating your **Agile Storyboard** as an **LLM Wiki**, you aren't just tracking tasks—you're building a "Project Memory" that gets smarter the more stories the agent completes.

Does this "compilation" mindset change how you'd want to handle the initial hand-off from your "raw" ideas to the actual storyboard?

The llm wiki frames the input as the curating, so we make links and summarise incoming data. Updating the wiki.
How would it be different if we follow the open brain approach of synthesis at point of recall. The idea being all data is stored and only queried later, synthesis at retrieval.

Moving from the **LLM Wiki** (curated/compiled) to an **Open Brain** (synthesis at recall) shifts the complexity from the "write" phase to the "read" phase.

In the Wiki approach, you pay the "compute tax" upfront to organize the data. In the Open Brain approach, you store everything in its raw, messy state and pay the tax only when you need to act.

For an agent-led agile storyboard, here is how that architecture would look and how it differs from the curated model:

---

## Read This When

Reviewing the original discussion or research notes for context behind investigation findings.

---

## Fragment Map

| # | Section | Fragment |
|---|---|---|
| 1 | 1. The Storage Mechanic: Atomic Shards | [1. The Storage Mechanic: Atomic Shards](./01-gemini-agile-md-storyboard-the-storage-mechanic-atomic-shards.md) |
| 2 | 2. The Retrieval Mechanic: Synthesis at Recall | [2. The Retrieval Mechanic: Synthesis at Recall](./02-gemini-agile-md-storyboard-the-retrieval-mechanic-synthesis-at-recall.md) |
| 3 | 3. Comparing the Two Architectures | [3. Comparing the Two Architectures](./03-gemini-agile-md-storyboard-comparing-the-two-architectures.md) |
| 4 | 4. How to build "Open Brain" in Obsidian | [4. How to build "Open Brain" in Obsidian](./04-gemini-agile-md-storyboard-how-to-build-open-brain-in-obsidian.md) |
| 5 | 5. The Layered Context in "Open Brain" | [5. The Layered Context in "Open Brain"](./05-gemini-agile-md-storyboard-the-layered-context-in-open-brain.md) |
| 6 | The Risk: "Context Drift" | [The Risk: "Context Drift"](./06-gemini-agile-md-storyboard-the-risk-context-drift.md) |


## Design Authority Note

This is a **Tier 2 Reference** document. Consult it for context and rationale.
Binding decisions live in [SRS](../../../requirements/SRS.md), [ADRs](../../../design/adr/), and [SystemDesign.md](../../../design/SystemDesign.md).
