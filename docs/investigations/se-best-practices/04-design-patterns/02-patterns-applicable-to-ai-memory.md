### Patterns applicable to ai-memory

| Pattern | Where used | Purpose |
|---------|-----------|---------|
| **Repository** | `IMemoryRepository` / `SqliteMemoryRepository` | Encapsulates all SQLite access. Services never execute SQL directly. |
| **Strategy** | `IEmbeddingService` with OpenAI and future ONNX implementations | Allows swapping embedding providers without changing consuming services. |
| **Factory** | `IDbConnectionFactory` | Encapsulates `SqliteConnection` creation and configuration. Services never open connections directly. |
| **Result** | `Result<T>` return type for expected failures | Distinguishes expected domain failures (not-found, duplicate) from unexpected exceptions. Avoids exception-driven flow for normal cases. |

