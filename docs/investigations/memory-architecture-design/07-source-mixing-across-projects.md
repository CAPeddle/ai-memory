## 7. Source Mixing Across Projects

### 7.1 Multi-Project Awareness

The memory service stores memories from all projects in a unified store but maintains project attribution:

| Scope | Description | Example |
|-------|-------------|---------|
| **Project-specific** | Facts about one project | "zoom uses Qt 6.5 for the UI layer" |
| **Cross-project** | Facts that apply broadly | "Our CI uses GitHub Actions with self-hosted runners" |
| **Cross-pollination** | Patterns from one project useful in another | "The pattern we used for async loading in zoom also works for BCF import" |

### 7.2 Query-Time Source Mixing

When an agent queries from a specific project context:

1. **Primary results** — memories tagged with that project (boosted 1.2×)
2. **Cross-project results** — memories with `project = NULL` (no boost)
3. **Adjacent results** — memories from other projects that are semantically relevant (no penalty, but not boosted)

This ensures that working on the zoom project surfaces zoom-specific knowledge first, but doesn't hide broadly useful facts or relevant discoveries from other projects.

### 7.3 Project Inference

If an agent doesn't explicitly specify a project, the service infers from:
1. File paths mentioned in the query context
2. Build system markers (CMakeLists.txt → cmake projects, .csproj → .NET projects)
3. Package references (conan requires → conan libraries)

---

