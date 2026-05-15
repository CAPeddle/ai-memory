# Microsoft Copilot – Project Overview
## A View‑Based Hybrid Memory System for Agentic Work

---

## Overview

This project defines a **Hybrid Memory System** designed to support autonomous coding agents, long‑term personal and professional memory, and active task coordination.

At the center of the system is a single **Core Brain** that acts as the canonical memory substrate.  
All other components — including the Wiki and the Storyboard — are **derived views and tools** operating on top of this brain.

There are **no competing or autonomous memory tiers** and no competing sources of truth. The Brain contains two logically-distinct memory types (episodic Shards and semantic Wiki), with derived projections (Views) layered on top.

---

## Design Principles

1. **One Brain, Many Views**  
   The brain is the sole system of record. Views can be regenerated, refreshed, or discarded without loss of memory.

2. **Append‑First Memory**  
   Raw experience is preserved. Nothing is overwritten or deleted by default.

3. **Views Are Optimizations, Not Truth**  
   The Wiki and Storyboard exist to reduce cognitive and agent load — not to replace memory.

4. **Agents Are First‑Class Actors**  
   Agents read from and write to the brain, and update views through explicit tools (REST/MCP).

---

## The Core Brain (Canonical Memory)

The **Core Brain** stores all episodic and semantic memory.

### What the Brain Contains
- **Shards**: raw, timestamped events
  - chat transcripts
  - build errors and fixes
  - design discussions
  - agent actions
- embeddings (semantic representations)
- metadata (project, repo, source, agent, time)
- structural relationships (project → repo → module → file)
- provenance (who/what created the memory)

### What the Brain Supports
- hybrid retrieval:
  - BM25 (lexical)
  - vector similarity (semantic)
- structural filtering (scope/context)
- long‑term recall and synthesis

The brain is **append‑heavy, retrieval‑heavy**, and intentionally noisy.  
Noise is managed through **views**, not deletion.

---

## Shards (Episodic Memory)

**Shards** are the atomic units of memory in the brain.

### Characteristics
- append‑only
- immutable by default
- high write volume
- never manually edited

### Purpose
Shards capture *what actually happened* — including false starts, failed experiments, and partial ideas.

They preserve:
- causality
- historical context
- the “why” behind decisions

Shards are never “promoted” or replaced.  
They remain permanently available for recall and synthesis.

---

## The Wiki (Semantic View)

The **Wiki** is a **curated semantic view** over the brain.

### What the Wiki Is
- a synthesized projection of shards
- stable explanations and decisions
- agent‑ and/or human‑authored
- regenerated or refreshed over time

### What the Wiki Is Not
- not a separate memory system
- not authoritative over the brain
- not required for recall

### Purpose
The Wiki answers:
- *What do we know?*
- *What decisions have stabilized?*
- *How should agents reason today without re‑reading history?*

Think of the Wiki as **semantic compression**.

---

## The Storyboard (State View)

The **Storyboard** is a **semi‑frozen, stateful working view** of ongoing work.

### Characteristics
- strongly structured
- time‑bounded
- partially mutable
- intentionally transient
- supports personal and professional scopes

### What the Storyboard Represents
- tasks
- goals
- status (todo / doing / blocked / done)
- ownership (human or agent)
- progress signals

### What the Storyboard Is Not
- not memory
- not retrieval
- not historical truth

The Storyboard is a **coordination surface**, not a knowledge store.

It can drift from raw brain state — and that drift is intentional.

---

## How Agents Use the System

Agents do not navigate tiers.  
They interact with **views and the brain directly**.

### Typical Agent Loop

1. **Read intent**
   - Query the Storyboard to understand current goals and tasks

2. **Retrieve context**
   - Query the Brain using hybrid search (BM25 + vector)
   - Apply structural filters (project, repo, timeframe)

3. **Optional semantic compression**
   - Read relevant Wiki entries for stabilized knowledge

4. **Act**
   - Modify code, investigate issues, generate output

5. **Write memory**
   - Append new shards to the Brain
   - Update Storyboard state via REST/MCP tools

The Brain remains authoritative throughout.

---

## Synthesis and Automation

### Synthesis (Not Promotion)

Background agents may:
- analyze recent shards
- detect emerging patterns
- refresh or create Wiki entries

This process is:
- additive
- reversible
- auditable

Shards are **never discarded** as part of synthesis.

---

## Storage and Retrieval Model (High Level)

- Brain storage:
  - SQLite‑first
  - FTS5 for BM25
  - vector extension for embeddings
  - relational tables for structure
- Structural relationships:
  - used as **pre‑filters**, not ranking signals
- Ranking:
  - BM25 + Vector fused via RRF

Views are materialized or queried on demand.

---

## Why This Model Works

- Preserves full history without overwhelming agents
- Enables long‑term memory across projects and platforms
- Separates **memory**, **knowledge**, and **state**
- Scales from personal use to professional contexts
- Simpler than alternatives (e.g., Open Brain's cloud edge functions + sync daemon) while remaining feature-complete at personal scale

---

## Key Insight

> The system does not have **competing or autonomous** tiers of memory.  
> It has **one brain** (containing Tier 1 Shards and Tier 2 Wiki) and multiple **derived views** of that brain.

This distinction keeps the architecture simple, powerful, and evolvable.

---

## Evolution Opportunities (Not Blockers)

**Already addressed in the approved design (ADRs + SRS):**
- Wiki refresh strategy: incremental updates tracking the last-synthesised memory ID per view (SRS FR-V-002; ADR-006)
- Storyboard state transitions: controlled state machine with MCP tools `story_claim` + `story_complete` (SRS FR-B-004; ADR-006)

**Intentionally deferred (with documented evolution path):**
- Structural similarity as a ranking signal: explicitly deferred in ADR-003 as a future third RRF lane once structural fingerprints are validated. Not needed for v1.0.

---
