I’ve reviewed the project docs (CLAUDE.md, SRS, SystemDesign, ADRs 004–011, STRATEGY, delivery-plan, entity-provenance spec). Here are the answers, grounded in what the documentation actually says today.
# Memory Shard Model

## Granularity: what is a shard?
A shard is an episodic memory — a raw, timestamped unit of input. Per the SRS §3:
“Shard: An episodic memory — a raw, timestamped unit of input (transcript, commit message, observation, brainstorm). Shards are ingested and stored without curation.”
So a shard is not limited to one discrete fact. Your richer bundle example — “Rautie — Amsterdam trip June 26-30, logistics still pending, sentiment: excited” — is a valid shard: it is a raw observation captured as-is. The platform also has a separate Wiki tier for curated, evergreen semantic facts (e.g. “Rautie’s birthday is March 12” once promoted).
Implication: tag/query design should expect shards to be messy, multi-fact, and narrative. The heavy lifting of normalisation is meant to happen later in the consolidation pipeline, not at capture time.

## Supersession: contradiction handling
The documented model is soft-delete + correction pointer, not replacement or confidence scores on competing versions.
- SRS §5.3 / FR-M-002: “correcting a fact creates a new memory with a supersedes field referencing the old record; the old record is soft-deleted.”
- ADR-005: “Correction: new record with supersedes pointing to old UUID; old record soft-deleted. Full correction history preserved.”
- The semantic_memories schema includes supersedes and active fields.
So when a newer export contradicts an older shard, the platform keeps both: the old one is marked active = false, the new one points to it via supersedes, and both remain in the audit trail.
Open question for your product: if you want live “confidence scores” between competing claims, that is not in the current model. You would need to add it.

## Provenance: what fields exist?
The documented provenance fields are:

|Field						|Where documented		|Values / notes 						|
|------------------------	|--------------			|--------------------					|
|source						|SRS FR-I-010			|user-taught, auto-promoted, observed 	|					
|session_id					|SRS FR-I-002			|for episodic / shard memories 			|			
|project					|SRS FR-I-001 / ADR-005	|project slug 						    |
|profile					|ADR-005				|	professional | personal 			|			
|agent_context				|SRS FR-I-002			|capture agent / context 				|		
|created_at / occurred_at	|SRS, SystemDesign		|timestamps 						    |
|memory_type				|ADR-005				|	shard | wiki 						|
|confidence					|ADR-005 / ADR-007		|consolidation score (wiki) 			|			

Your proposed fields (source, captured_at, capture_agent) are largely covered, but “capture_agent” is not a first-class column. The closest is agent_context (a text field on episodic memories) and source (an enum). If you need a structured capture_agent value like CLI, Android, Claude Code, you would extend the schema.

# Capture & Curation
## Approval model
The current design uses a confidence threshold, not universal human approval.
- ADR-007: consolidation scores shards on frequency (40%), diversity (35%), and relevance feedback (25%).
- Score ≥ 0.7 → auto-promote to wiki.
- Score 0.5–0.69 → flagged for manual review.
- Score < 0.5 → skipped, remains a shard.
This is a generalised confidence-threshold model, not per-capture approval. However, the SRS §5.1 / FR-I-001 also supports explicit memory_teach (user-taught semantic facts), which are immediately committed as wiki-tier.
Implication: if your product needs a mandatory human-review gate for every capture path, you would layer that on top — it is not the default.

## Capture paths at launch
The SRS mentions three paths at §5.1 and §5.8:
1. Manual / user-taught (memory_teach) — explicit semantic facts.
2. MCP-write / agent observation (capture_thought, memory_log_episode) — AI agents and tools writing shards.
3. Conversation / session import (memory_log_episode with session_id) — importing conversation transcripts or session logs.
The current cloud server’s implemented tools are capture_thought, search_thoughts, list_thoughts, etc. (CLAUDE.md). The “WhatsApp export (CLI)” and “manual fact entry (Android)” paths you mention are not in the current documentation. They sound like product-specific capture surfaces you are considering; the platform’s capture plumbing (MCP/REST capture_thought and memory_log_episode) could support them, but they would be new clients, not existing launch paths.

# Retrieval & MCP
## Query contract: search API vs answer API
The current platform is a search API, not an answer API.
- SRS FR-MCP-003: “MCP tool responses shall return formatted text/Markdown rather than raw JSON to optimise for agent consumption.”
- The format is: [Score: X.XX] (type, project) content summary — ID: xxx
- STRATEGY frames the core bet as “actively synthesizing and assembling the right prior context,” but the actual synthesis happens asynchronously in the consolidation pipeline and view generation, not at query time.
So for “what did I commit to deliver to Sarah by end of sprint?” the server returns ranked matching shards/wiki entries, and Claude (the MCP client) synthesises the answer from them.
Implication: if your product needs the platform itself to return a synthesised answer, that would require a new tool/endpoint (e.g. an LLM-backed answer tool) and is not in the current design.

## MCP clients at launch
ADR-004 lists the target chat platforms:
- Claude.ai
- ChatGPT
- Google Gemini
- GitHub Copilot
- Cursor
README adds Claude Code, Claude Desktop, VS Code Copilot, custom agents, and your own scripts.
Your list (Claude.ai mobile/desktop, Claude Code, Android app) overlaps but is narrower. The “Android app” is not documented as a current or planned client; if that is your own client, it would connect via the same StreamableHTTP MCP endpoint with the API key.

# Non-Functional
## Latency expectation
SRS NFR-P1:
“Hybrid search (BM25+Vector via RRF, post-MMR) shall return a response in < 100 ms (p95) on up to 100,000 memory records on a local machine.”
The target is well under 500 ms, and comfortably under 2 seconds. The current server uses pgvector HNSW and tsvector GIN indexes (ADR-011), so the design is explicitly built for real-time mid-conversation retrieval.

## Volume horizon
ADR-011 budgets for 100,000 memories as the design target:
- Vectors: 100K × 512 × 4 bytes = ~200 MB
- Content + indexes + AGE graph = ~150 MB
- Total ~350 MB
The original SRS NFR-S2 projected ~310,000 records in 1 GB. So the documented horizon is roughly tens to low-hundreds of thousands of shards, not tens of thousands of shards per contact.

## Data sensitivity model
This is not explicitly decided in the current docs.
- STRATEGY has a “Trust, privacy, and control” track mentioning: per-client permissions, project isolation, audit logging, write confirmation, secret redaction, memory forgetting.
- ADR-010 uses a single shared API key across all platforms; there is no per-client or per-data-class authorisation.
- Context scoping (project, profile) provides logical separation, not storage-level isolation.
There is no mention of separate tables, separate encryption keys, or separate storage for “Contact Memory” vs “Developer Memory.” If your product requires that level of isolation, it would be a new architectural decision.

# Platform-fit observations
A few things stand out if you are considering this project as the base for another product:
1. The documented domain is AI coding-agent memory, not personal relationship/contact memory. Your WhatsApp/Android/Contact Memory direction would be a significant product extension, not a configuration of existing features.
2. Capture is intentionally frictionless and append-only. If your product needs strict per-entry human approval, you would be fighting the core design.
3. Query-time synthesis is not implemented. The platform retrieves; the client answers. A true “answer API” would be new work.
4. Storage-level isolation is undefined. Logical separation via project/profile exists, but encryption-key or table-level isolation does not.
5. The cloud MCP server is the active implementation; the C#/.NET local companion is skeletal. If your product needs a local-first client, you would be building on a scaffold.
If you want to explore any of these as an actual feature direction, the next step would be ce-brainstorm on the specific decision (e.g. “Contact Memory isolation model” or “WhatsApp export capture path”).