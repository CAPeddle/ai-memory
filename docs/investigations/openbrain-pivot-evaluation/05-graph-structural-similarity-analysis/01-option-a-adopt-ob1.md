### Option A — Adopt OB1

The `entity-extraction` schema provides `entities`, `edges`, and `thought_entities` tables — a basic labelled property graph in relational form. Relationships are typed (`co_occurs_with`, `works_on`, `uses`, `related_to`, `member_of`, `located_in`). An async worker must be built to populate these tables.

However, querying this graph is limited to PostgreSQL recursive CTEs (e.g., multi-hop `WITH RECURSIVE` queries). No graph query language (openCypher) is available without AGE. Subgraph matching requires custom SQL and becomes expensive at scale. Structural fingerprinting (encoding graph topology as a vector) requires additional development.

**Feasibility rating: Significant** — requires building an entity extraction worker, graph traversal queries in raw SQL, and cannot use openCypher. Supabase AGE unavailability is a hard constraint.

