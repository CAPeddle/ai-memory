## 11. Project Structure

```
src/
├── AiMemory.Core/                 # Domain models, interfaces, service logic
│   ├── Models/
│   │   ├── SemanticMemory.cs
│   │   ├── EpisodicMemory.cs
│   │   ├── RecallEvent.cs
│   │   └── Project.cs
│   ├── Interfaces/
│   │   ├── IMemoryService.cs
│   │   ├── IMemoryRepository.cs
│   │   ├── ISearchEngine.cs
│   │   └── IEmbeddingService.cs
│   ├── Services/
│   │   ├── MemoryService.cs
│   │   ├── HybridSearchEngine.cs
│   │   └── ConsolidationPipeline.cs
│   └── AiMemory.Core.csproj
│
├── AiMemory.Data/                 # SQLite implementation of repository
│   ├── SqliteMemoryRepository.cs
│   ├── Migrations/
│   ├── Extensions/
│   └── AiMemory.Data.csproj
│
├── AiMemory.Embeddings/           # Embedding provider abstraction
│   ├── OpenAiEmbeddingService.cs
│   ├── OnnxEmbeddingService.cs    # Future local alternative
│   └── AiMemory.Embeddings.csproj
│
├── AiMemory.Server/               # ASP.NET Core host (REST + MCP)
│   ├── Program.cs
│   ├── Endpoints/                 # REST Minimal API groups
│   │   ├── MemoryEndpoints.cs
│   │   ├── EpisodeEndpoints.cs
│   │   ├── ConsolidationEndpoints.cs
│   │   └── ProjectEndpoints.cs
│   ├── Mcp/                       # MCP tool/resource definitions
│   │   ├── MemoryTools.cs
│   │   ├── MemoryResources.cs
│   │   └── MemoryPrompts.cs
│   ├── appsettings.json
│   └── AiMemory.Server.csproj
│
└── AiMemory.Tests/                # All test projects
    ├── Unit/
    ├── Integration/
    └── AiMemory.Tests.csproj
```

---

