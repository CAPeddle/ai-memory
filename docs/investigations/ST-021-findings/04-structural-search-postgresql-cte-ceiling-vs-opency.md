## §R3 — Structural Search: PostgreSQL CTE Ceiling vs. openCypher

**Decision: openCypher via Apache AGE is required. Recursive CTEs are not sufficient.**

### PostgreSQL recursive CTE ceiling

PostgreSQL supports recursive CTEs via `WITH RECURSIVE`. These work for fixed-depth or bounded-depth traversal in a single table but require the graph to be stored as an adjacency list in PostgreSQL itself (not in AGE's internal storage). Key limitations:

- Variable-length edge patterns (`*1..n`) require explicit recursion termination logic
- Multi-label path matching (`[:LIKES|INTERESTED_IN*1..3]`) requires UNION inside the recursive CTE
- Relationship type filters across heterogeneous node types become unwieldy SQL
- No native openCypher syntax — every pattern must be hand-translated to SQL

### openCypher via AGE (confirmed viable)

AGE v1.7.0 exposes `cypher('graph_name', $$ MATCH ... RETURN ... $$)` as a PostgreSQL function returning `agtype`. Both required query patterns were validated:

**Multi-hop causation (coding agent debugging):**
```cypher
MATCH path = (err:Error {name: 'TimeoutError'})-[:CAUSED_BY*1..5]->(root)
RETURN path
```

**Fact inference (does John like flowers?):**
```cypher
MATCH (person:Person {name: 'John'})-[:LIKES|INTERESTED_IN*1..3]->(thing)
WHERE thing.category = 'nature'
RETURN thing.name AS thing_name
```

Both patterns are idiomatic openCypher and would require significant SQL scaffolding to replicate with recursive CTEs. AGE is the right tool.

---

