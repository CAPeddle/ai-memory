### Applicability to ai-memory
- SQL query patterns across repository methods should be extracted to helpers rather than duplicated
- Configuration binding for OpenAI, SQLite connection strings, and search parameters should follow a single pattern registered once in `Program.cs`
- Constants like `DefaultSearchLimit = 10` must exist in one place only (`AiMemory.Core`) and be referenced by all consumers
- Two code blocks that look similar but serve domain-distinct purposes (e.g., FTS5 search vs. vector search) should remain separate until a third use proves the abstraction warrant

