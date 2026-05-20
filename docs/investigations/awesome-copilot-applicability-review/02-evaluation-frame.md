## 2. Evaluation Frame

The local design authority already fixes the technical shape of ai-memory:

- .NET 8+, C# 12, SQLite + FTS5, Minimal API, and MCP facade remain the default architecture
- The repo is workflow-first, with PO-gated `/plan`, `/continue`, and `/recover`
- Context should be layered and pointed, not dumped

Because of that baseline, the useful question is not "Should ai-memory copy awesome-copilot?" The useful question is:

"Which repository-maintenance patterns from awesome-copilot reduce governance drift, improve discoverability, and make future AI-customization artifacts easier to author and review inside this repo?"

That framing rules out a large amount of the external repository by design:

- It is not necessary to adopt the full public catalog model
- It is not necessary to mirror the website, install buttons, or marketplace surfaces
- It is not necessary to adopt the external contribution branching model just because awesome-copilot uses one

---

