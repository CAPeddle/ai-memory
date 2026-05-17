### Critical Design Principle

Abstract the storage layer from day one:

```csharp
public interface IMemoryStore
{
    Task<string> StoreSemanticMemory(SemanticMemory memory);
    Task<string> StoreEpisodicMemory(EpisodicMemory memory);
    Task<IReadOnlyList<MemorySearchResult>> Search(MemoryQuery query);
    Task<IReadOnlyList<MemorySearchResult>> VectorSearch(float[] embedding, int k);
    Task LogRecall(RecallEvent recallEvent);
}

// Configuration-driven backend selection
services.AddSingleton<IMemoryStore>(sp =>
    configuration["Storage:Backend"] switch
    {
        "sqlite" => new SqliteMemoryStore(configuration["Storage:SqlitePath"]),
        "postgresql" => new PgMemoryStore(configuration["Storage:PostgresConnection"]),
        _ => throw new InvalidOperationException("Unknown storage backend")
    });
```

This ensures the database engine is an implementation detail, not an architectural commitment.

---

