## §6b. Surprises & Discoveries

- Observation: SQLite FTS5 tokenizer strips hyphens from ULIDs
  Evidence: `SELECT * FROM memories_fts WHERE content MATCH '01HXY-...'` returns 0 rows
  Impact: Must use rowid lookup for ID-based queries, not FTS
```

**§6c. Decision Log** — Record every design decision made during execution with rationale and date.

```markdown
