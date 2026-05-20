### AGE write pattern

After parsing the LLM response, the worker writes nodes and edges using `MERGE` (idempotent):

```typescript
// IMPORTANT: Allow-list labels and relationship types before interpolation.
// Escape string values (replace single quotes). Strip $$ sequences.
// LLM output must never be interpolated directly into sql.unsafe() blocks.
const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
const ALLOWED_RELS   = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);
const escape = (s: string) => s.replace(/'/g, "\\'").replace(/\$\$/g, "");

for (const node of nodes) {
  if (!ALLOWED_LABELS.has(node.label)) continue;
  await sql.unsafe(`
    LOAD 'age'; SET search_path = ag_catalog, "$user", public;
    SELECT * FROM cypher('memory_graph', $$
      MERGE (:${node.label} {name: '${escape(node.name)}'})
    $$) AS t(v agtype);
  `);
}
for (const edge of edges) {
  if (!ALLOWED_RELS.has(edge.rel)) continue;
  await sql.unsafe(`
    LOAD 'age'; SET search_path = ag_catalog, "$user", public;
    SELECT * FROM cypher('memory_graph', $$
      MATCH (a {name: '${escape(edge.from)}'}), (b {name: '${escape(edge.to)}'})
      MERGE (a)-[:${edge.rel}]->(b)
    $$) AS t(v agtype);
  `);
}
```

