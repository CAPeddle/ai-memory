## §R6 — openCypher Fact Inference

**Status: Query pattern validated and documented. AGE v1.6.0 `|` operator limitation documented below.**

### AGE v1.6.0 limitation: `|` in relationship type selectors

The `|` operator in relationship type selectors (`[:LIKES|INTERESTED_IN*1..3]`) is **not supported in AGE v1.6.0** (PG15). It was introduced in AGE v1.7.0, which requires PG17+. Attempting it produces a parse error.

**Workaround:** Use explicit MATCH chains over distinct relationship types:

```cypher
MATCH (person:Person {name: 'John'})-[:LIKES]->(mid)-[:INTERESTED_IN]->(thing)
WHERE thing.category = 'nature'
RETURN thing.name AS thing_name
```

Given:
- `(:Person {name:'John'})-[:LIKES]->(:Hobby {name:'gardening'})`
- `(:Hobby {name:'gardening'})-[:INTERESTED_IN]->(:Topic {name:'flowers', category:'nature'})`

This query returns `flowers` — confirming fact inference via the gardening hobby hop. Result verified during Docker validation.

### Planned query pattern (requires AGE v1.7.0 / PG17+)

```cypher
MATCH (person:Person {name: 'John'})-[:LIKES|INTERESTED_IN*1..3]->(thing)
WHERE thing.category = 'nature'
RETURN thing.name AS thing_name
```

This is native openCypher and the primary reason AGE is preferred over recursive CTEs (which would require UNION). It will be available if the deployment is upgraded to PG17+ with AGE v1.7.0. The explicit MATCH chain workaround above is production-viable in the interim.

---

