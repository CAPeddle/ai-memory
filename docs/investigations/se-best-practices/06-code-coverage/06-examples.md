### Examples
- ✅ Do: Test `SearchService.SearchAsync` with both a seeded in-memory SQLite database (verifying ranked results) and a mock `IEmbeddingService`
- ❌ Don't: Test only the fact that `SearchAsync` returns a non-null result; that assertion provides no signal

---

