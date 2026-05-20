### Applicability to ai-memory
| Principle | Relevance |
|-----------|-----------|
| **SRP** | High — `ISearchService`, `IEmbeddingService`, `IMemoryRepository` each represent one bounded concern. Mixing search + consolidation into one class would violate SRP. |
| **OCP** | Medium — New embedding providers or search strategies should be addable without modifying existing implementations. Use the Strategy pattern (see §3). |
| **LSP** | Medium — All `IEmbeddingService` implementations must be substitutable. NSubstitute mocks in tests provide a lightweight LSP check. |
| **ISP** | High — Do not create a single `IMemoryService` that forces callers to depend on methods they don't use. Prefer `ISearchService`, `IEmbeddingService`, `IMemoryRepository` as separate interfaces. |
| **DIP** | High — Core defines interfaces; Server provides implementations registered in `Program.cs`. No `new ConcreteService()` anywhere except tests and DI registration. |

