---
name: "ADR-012: Replace Binary `profile` Field with `tags` Array"
asset_type: "adr"
status: "proposed"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-012-tags-replace-binary-profile.md"
created: "2026-06-26"
relates_to:
  - "docs/design/adr/ADR-005-memory-model.md"
  - "docs/design/adr/ADR-007-consolidation-pipeline.md"
---

# ADR-012: Replace Binary `profile` Field with `tags` Array

**Status:** Proposed
**Date:** 2026-06-26
**Deciders:** Christopher
**Relates to:** ADR-005 (Memory Schema), ADR-007 (Consolidation Scoring)

---

## Context

The current memory shard schema uses a binary `profile` field with two permitted values: `professional` and `personal`. This was designed to provide logical scoping between Developer Memory (professional context) and personal context.

Two forces now make this model insufficient:

1. **The colleague entity problem.** A work colleague exists simultaneously in Contact Memory (personal relationship, commitments, birthday, sentiment) and Developer Memory (architectural decisions made together, project constraints they own). A binary `profile` field cannot express this — a shard about a colleague's technical opinion on a database choice is both `professional` (domain) and `contact` (entity type). The binary enum forces a choice that loses information.

2. **Multi-product platform architecture.** The platform now supports multiple domain products (Developer Memory, Contact Memory, and future products). Scoping needs to be extensible — new products should be able to introduce their own scoping tags without schema changes to the platform.

The binary `profile` field is a **platform-level schema constraint that encodes a product-level concept**. It should be replaced with a flexible, extensible mechanism.

---

## Options Considered

### Option 1: Keep `profile` binary, add a secondary `domain` field
Add a second scoping field alongside `profile` for domain-level tagging.

| Pros | Cons |
|------|------|
| Backward compatible | Two scoping fields creates confusion about which to use |
| No breaking change | Still doesn't support multi-domain shards cleanly |
| | New products need schema changes to add domains |

### Option 2: Replace `profile` with `tags: string[]` array
A single, flexible array of string tags replacing the binary field. Tags are free-form but governed by convention. Example values: `contact`, `developer`, `colleague`, `project:phoenix`, `personal`, `professional`.

| Pros | Cons |
|------|------|
| Single mechanism for all scoping | No referential integrity — tags are strings |
| Supports multi-domain shards natively | Tag proliferation risk without governance |
| No schema changes for new products | Query patterns more complex than enum equality |
| Postgres GIN index makes tag queries fast | Existing data requires migration |
| Extensible to hierarchical tags if needed | |

### Option 3: Many-to-many junction table (`shard_tags`)
Normalised relational model: a separate table with `(shard_id, tag_id)` rows, and a `tags` lookup table.

| Pros | Cons |
|------|------|
| Full referential integrity | Join on every query |
| Tag management (rename, delete) is clean | Significantly more complex queries |
| Enforced tag vocabulary | Over-engineered for personal-use volume |

---

## Trade-off Analysis

| Dimension | Option 1 | Option 2 | Option 3 |
|-----------|----------|----------|----------|
| **Backward compatibility** | ✅ No breaking change | ❌ Migration required | ❌ Larger migration |
| **Multi-domain shard support** | ❌ No | ✅ Yes | ✅ Yes |
| **Extensibility for new products** | ❌ Schema change needed | ✅ Convention only | ✅ Tag table insert |
| **Query performance** | ✅ Enum equality | ✅ GIN index | ⚠️ Join overhead |
| **Implementation complexity** | Low | Low-Medium | High |
| **Referential integrity** | Partial | None | Full |

---

## Decision

**Replace `profile: professional | personal` with `tags: string[]`.**

The multi-domain colleague use case is not hypothetical — it is a concrete, motivating requirement for the Contact Memory product. A colleague shard must be queryable both from Developer Memory context ("what did Sarah decide about the database?") and Contact Memory context ("what did I commit to Sarah?"). The binary `profile` field cannot support this.

Option 3 is over-engineered for a personal-use platform at current volume. The normalisation benefit does not justify the query complexity cost.

Tag governance replaces referential integrity: a small set of reserved platform tags (`contact`, `developer`, `personal`, `professional`) is defined in documentation. Products may introduce their own namespaced tags (`project:*`, `contact:*`). Unknown tags are permitted but not indexed specially.

---

## Schema Change

```sql
-- Remove
profile VARCHAR CHECK (profile IN ('professional', 'personal'))

-- Add
tags TEXT[] NOT NULL DEFAULT '{}'

-- Index (Postgres GIN for array containment queries)
CREATE INDEX idx_memory_shards_tags ON memory_shards USING GIN (tags);
```

**Query patterns:**

```sql
-- Shards tagged as contact memory
WHERE tags @> ARRAY['contact']

-- Shards spanning both domains (the colleague case)
WHERE tags @> ARRAY['contact', 'developer']

-- Shards for a specific project
WHERE tags @> ARRAY['project:phoenix']
```

---

## Migration

Existing shards with `profile = 'professional'` -> `tags = ['developer']`
Existing shards with `profile = 'personal'` → `tags = ['personal']`

Low risk: local-first platform, single user, schema is not yet production-hardened.

---

## Accepted Trade-offs

| Trade-off | Mitigation |
|-----------|------------|
| No referential integrity on tags | Documented tag conventions; validation in capture agents |
| Tag proliferation risk | Namespaced convention (`domain:value`) for product-level tags |
| Breaking schema change | Migration is simple enum-to-array; data volume is low |

---

## Revisit Triggers

- If tag cardinality grows beyond ~50 distinct tags (consider Option 3)
- If tag rename/delete operations become frequent (consider Option 3)
- If hierarchical tag queries become a requirement (consider graph-based tagging)
