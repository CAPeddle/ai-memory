## §R5 — openCypher Multi-hop Traversal (Coding Agent Debugging)

**Status: Query pattern validated and documented.**

```cypher
MATCH path = (err:Error {name: 'TimeoutError'})-[:CAUSED_BY*1..5]->(root)
RETURN path
```

When `TimeoutError` → `CAUSED_BY` → `callStripeAPI` → `CAUSED_BY` → `validateCard` → `CAUSED_BY` → `processPayment` is in the graph, this query returns the full chain. The `*1..5` syntax limits depth and prevents infinite traversal on cyclic graphs.

**Result format:** AGE returns paths as `agtype` JSON. The application layer formats these for MCP text output.

---

