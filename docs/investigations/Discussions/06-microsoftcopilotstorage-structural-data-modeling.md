## Structural Data Modeling

Structural retrieval requires explicit modeling.

### Option 1 — Hierarchical Structure (Tree)

Use:
- `parent_id`
- `path`
- `depth`

Applicable for:
- IFC models
- document hierarchies

---

### Option 2 — Graph Structure

Use:
- Nodes
- Typed edges

Applicable for:
- knowledge graphs
- linked documents
- IFC relationships

---

### Implication

The database evolves from:

> Document store → **Graph-aware retrieval system**

---

