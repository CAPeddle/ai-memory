## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| C# MCP SDK lacks a feature needed | Low | Medium | SDK is actively developed; file an issue or contribute. Fall back to low-level protocol handling. |
| Fewer community MCP examples to reference | Medium | Low | The SDK docs and samples directory are sufficient. TypeScript examples translate conceptually to C#. |
| Vector search ecosystem gap | Low | Low | pgvector via Npgsql is mature. For local embeddings, ONNX Runtime works in .NET. |
| SDK maintenance stalls | Very Low | High | Microsoft co-maintains it. Stephen Toub won't let it die. Worst case: fork and maintain. |
| Team member leaves, replacement doesn't know C# | Low | Medium | C# is one of the most commonly known languages. Much easier to hire for than Rust or even TypeScript MCP expertise. |
| Performance bottleneck in text processing | Very Low | Low | .NET has excellent string performance. For heavy NLP, call out to a Python sidecar. |

---

