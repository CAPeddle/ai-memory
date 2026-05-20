## 6. Service Layer Interface Contracts

### 6.1 Core Interfaces

```csharp
public interface IMemoryService
{
    // Write operations
    Task<SemanticMemory> TeachAsync(string content, string? project, string[]? tags);
    Task<EpisodicMemory> LogEpisodeAsync(string content, string sessionId, string? project, string[]? tags);
    Task<SemanticMemory> CorrectAsync(string memoryId, string newContent);
    Task DeleteAsync(string memoryId);
    Task<SemanticMemory> PromoteAsync(string episodicId);

    // Read operations
    Task<MemoryDetail> InspectAsync(string memoryId);
    Task<PagedResult<MemoryBase>> ListAsync(string? project, string? type, string[]? tags, string? cursor, int limit);
    Task<IReadOnlyList<SemanticMemory>> GetProjectFactsAsync(string project);
    Task<IReadOnlyList<EpisodicMemory>> GetRecentEpisodesAsync(int limit);

    // Feedback & consolidation
    Task RecordFeedbackAsync(string recallEventId, string feedback);
    Task<ConsolidationResult> ConsolidateAsync(bool dryRun);

    // Projects
    Task<IReadOnlyList<Project>> ListProjectsAsync();
    Task<Project> RegisterProjectAsync(string slug, string displayName, string? description, string? buildSystem, string[]? languages);

    // Stats
    Task<MemoryStats> GetStatsAsync(string? project);
}

public interface ISearchEngine
{
    Task<SearchResult> HybridSearchAsync(string query, string? project, string? type, int limit);
}

public interface IEmbeddingService
{
    Task<float[]> EmbedAsync(string text);
    Task<float[][]> EmbedBatchAsync(string[] texts);
}

public interface IMemoryRepository
{
    // Semantic CRUD
    Task<SemanticMemory> InsertSemanticAsync(SemanticMemory memory);
    Task<SemanticMemory?> GetSemanticByIdAsync(string id);
    Task UpdateSemanticAsync(SemanticMemory memory);
    Task SoftDeleteAsync(string id);

    // Episodic CRUD
    Task<EpisodicMemory> InsertEpisodicAsync(EpisodicMemory episode);
    Task<IReadOnlyList<EpisodicMemory>> GetEpisodesBySessionAsync(string sessionId);

    // Search
    Task<IReadOnlyList<FtsResult>> FtsSearchAsync(string query, string? project, int limit);
    Task<IReadOnlyList<VectorResult>> VectorSearchAsync(float[] embedding, string? project, int limit);

    // Recall tracking
    Task InsertRecallEventAsync(RecallEvent evt);
    Task IncrementRecallCountAsync(string memoryId, string memoryType);

    // Deduplication
    Task<bool> IsDuplicateAsync(float[] embedding, double threshold = 0.95);
}
```

### 6.2 Key Design Decision: Shared Service Layer

Both the REST controllers and MCP tools call the **same** `IMemoryService`. This guarantees:
- Consistent validation rules
- Consistent business logic (dedup, embedding, recall tracking)
- Single source of truth for behavior
- Easy testing — test the service layer once, both interfaces are covered

---

