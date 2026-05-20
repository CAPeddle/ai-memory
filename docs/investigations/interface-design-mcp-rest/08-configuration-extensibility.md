## 8. Configuration & Extensibility

### 8.1 Configuration Schema

```json
{
  "AiMemory": {
    "Database": {
      "Path": "~/.ai-memory/memory.db",
      "WalMode": true,
      "MaxConnections": 5
    },
    "Embeddings": {
      "Provider": "openai",
      "Model": "text-embedding-3-small",
      "Dimensions": 1536,
      "ApiKey": "${AI_MEMORY_OPENAI_KEY}",
      "BatchSize": 50
    },
    "Search": {
      "DefaultLimit": 10,
      "MaxLimit": 100,
      "MmrLambda": 0.7,
      "RrfK": 60,
      "FtsWeight": 0.5,
      "VectorWeight": 0.5
    },
    "Consolidation": {
      "PromotionThreshold": 0.7,
      "NearThreshold": 0.5,
      "FrequencyWeight": 0.40,
      "DiversityWeight": 0.35,
      "RelevanceWeight": 0.25,
      "MinRecallsForPromotion": 2,
      "AutoTriggerAfterEpisodes": 50
    },
    "Server": {
      "HttpPort": 5280,
      "EnableSwagger": true
    }
  }
}
```

### 8.2 Dependency Injection Registration

```csharp
// ServiceCollectionExtensions.cs
public static IServiceCollection AddAiMemory(this IServiceCollection services, IConfiguration config)
{
    services.Configure<AiMemoryOptions>(config.GetSection("AiMemory"));

    // Core services
    services.AddSingleton<IMemoryRepository, SqliteMemoryRepository>();
    services.AddSingleton<IEmbeddingService, OpenAiEmbeddingService>();
    services.AddSingleton<ISearchEngine, HybridSearchEngine>();
    services.AddSingleton<IMemoryService, MemoryService>();
    services.AddSingleton<IConsolidationPipeline, ConsolidationPipeline>();

    return services;
}
```

---

