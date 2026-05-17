## §R1 — Memory Tier Schema Recommendation

**Decision: Single-table discriminator (`memory_type` column on `thoughts`).**

OB1's `thoughts` table is extended with a `memory_type TEXT NOT NULL DEFAULT 'shard' CHECK (memory_type IN ('shard','wiki'))` column.

**Rationale:**
- Keeps BM25 + vector RRF fusion in a single query (no JOIN across tables)
- OB1's existing `upsert_thought()` pattern only needs `memory_type` added to its INSERT
- Wiki promotion is a simple `UPDATE thoughts SET active = false WHERE id = $shard_id` (shard stays `memory_type = 'shard'`, just deactivated) plus an INSERT of the new wiki row with `memory_type = 'wiki'` — no cross-table foreign key gymnastics
- Indexes on `memory_type`, `project`, and `active` keep queries fast

**Rejected alternative: Separate `shards` and `wiki` tables.**
Cross-tier queries (RRF fusion across tiers) require a UNION or JOIN. For a personal memory store at <100K rows, this would be premature optimisation with no measurable performance benefit.

**Schema location:** `server/db/schema.sql`

**Columns added to `thoughts`:**
| Column | Type | Purpose |
|--------|------|---------|
| `memory_type` | `text NOT NULL DEFAULT 'shard'` | Tier discriminator |
| `project` | `text` | Context scoping |
| `profile` | `text CHECK IN ('professional','personal')` | Context scoping |
| `active` | `boolean NOT NULL DEFAULT true` | Soft-delete (promoted shards set to false) |
| `supersedes` | `uuid REFERENCES thoughts(id)` | Wiki → superseded shard link |
| `recall_count` | `integer NOT NULL DEFAULT 0` | Consolidation scoring input |
| `last_recalled_at` | `timestamptz` | Consolidation scoring input |
| `source` | `text CHECK IN ('user-taught','auto-promoted','observed')` | Provenance |
| `confidence` | `float CHECK BETWEEN 0 AND 1` | Consolidation score at promotion time |
| `search_vector` | `tsvector GENERATED ALWAYS AS ... STORED` | BM25 full-text search |

---

