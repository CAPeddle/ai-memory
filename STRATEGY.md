---
name: ai-memory
last_updated: 2026-06-14
---

# ai-memory Strategy

## Target problem

AI services (Claude, Copilot, ChatGPT, Gemini) maintain isolated memory silos, meaning knowledge, architectural decisions, and prior solutions never cross service boundaries. 

However, the deeper engineering challenge is the **Friction of Knowledge Promotion**. When a developer moves between tools, they face a dual-sided failure mode:
1. **The Structure Tax:** Forcing a developer to pause mid-flow to manually categorize, format, or document a realization kills capture entirely. 
2. **Retrieval Chaos:** Conversely, dumping raw, unstructured conversation shards into a cross-platform bucket shifts the burden to the retrieval phase. As the dataset scales, this creates massive noise, bloats context windows, and fails to maintain a stable, compounded foundation of truth for long-term project intelligence.

## Our approach

Provide a cross-AI context layer that acts as a decentralized, multi-layered knowledge substrate. The core bet is on **Asynchronous Knowledge Promotion**—decoupling high-speed, frictionless context capture from background curation. 

Instead of forcing the developer to choose between a heavy structure tax or unstructured chaos, the system treats human-AI interaction as an append-only event stream (Raw Substrate) that is asynchronously compiled by background agents into a durable, typed knowledge base (Structured Wiki) based on workflow state changes. We win on context assembly quality by surfacing the right prior context with strict provenance at the exact moment an agent needs it.

## Who it's for

**Primary:** Developer working across multiple AI platforms -- They're hiring ai-memory to carry context between AI services so they don't have to re-explain prior decisions and project knowledge when switching tools mid-project.

## Key metrics

- **Search relevance (Recall@5 / MRR)** -- does the expected memory appear in the top results; measured via eval harness
- **Retrieval latency (p95)** -- end-to-end MCP tool response time; measured via server metrics
- **Cross-tool continuity rate** -- can a new AI session produce a project-aware answer without the user restating context; measured via eval scenarios
- **Stale-memory rate** -- how often retrieval surfaces outdated or superseded context; measured via eval harness

## Tracks

### Memory model and capture (The Event Stream)

Define what a memory is -- types (decision, constraint, preference, project fact, codebase note), lifecycle, metadata, provenance, scope, confidence, deduplication, and supersession. Build the capture pipeline for manual, MCP-write, and conversation-import paths to support zero-overhead, stream-based capture.

_Why it serves the approach:_ Context assembly is only as good as what's been captured. A frictionless, append-only capture layer completely eliminates the Structure Tax.

### Context assembly (The Compilation Engine)

Hybrid BM25 + vector search, MMR re-ranking, entity-aware retrieval, recency weighting, synthesis, and contradiction handling. Includes relationship-aware retrieval via extracted entities and metadata links, graduating to graph traversal when evals prove it adds value. This track handles the asynchronous compilation of raw event data into structured context packets containing ranked memories, active decisions, relevant constraints, and provenance.

_Why it serves the approach:_ The core bet -- actively synthesizing and assembling the right prior context rather than just returning raw keyword search results, defeating Retrieval Chaos.

### MCP access layer

MCP server, tool definitions, transport, auth, and client compatibility. The universal connector that lets authorized MCP-capable AI tools retrieve memory, suggest new memories, and update memory through controlled write paths.

_Why it serves the approach:_ Cross-service memory only works if every service can plug in through an open protocol with appropriate access controls.

### Trust, privacy, and control

Per-client permissions, project isolation, audit logging, write confirmation, secret redaction, memory forgetting, and prompt-injection defenses.

_Why it serves the approach:_ A memory layer holding sensitive project and personal context must earn trust as a first-class concern, not bolt it on later.

## Not working on

- Not a general-purpose note-taking app.
- Not a replacement for source control, issue trackers, or documentation.
- Not an automatic store-everything surveillance layer -- memory quality requires intentional capture.
- Not vendor-specific memory for one AI service.
- Not graph-first knowledge management -- graph capabilities are evidence-driven, not foundational.
