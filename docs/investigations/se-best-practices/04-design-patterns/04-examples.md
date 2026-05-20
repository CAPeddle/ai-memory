### Examples
- ✅ Do: `SqliteMemoryRepository` implements `IMemoryRepository`; `SearchService` depends on `IMemoryRepository` via constructor injection
- ❌ Don't: `SearchService` takes `SqliteConnection` as a constructor parameter and builds queries inline

---

