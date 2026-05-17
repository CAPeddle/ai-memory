### LCM Summary DAG

- Messages fill context window → LCM creates **leaf summaries** (depth 0) from oldest messages
- Leaf summaries accumulate → merged into **higher-level summaries** (depth 1, 2, ...)
- Context assembly walks DAG per turn to select most relevant summaries
- **Nothing deleted** — originals recoverable by drilling into summaries

