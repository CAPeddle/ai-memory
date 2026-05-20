## 9. What About a Hybrid Approach?

**Don't do this.** Some might suggest:
- "Write the MCP layer in TypeScript, business logic in C#"
- "Use Python for embeddings, C# for everything else"

This adds operational complexity (multiple processes, IPC, deployment coordination) that is completely unnecessary for a local single-user service. Pick one language and commit to it.

The one exception: if you add local embedding generation later, running a Python `sentence-transformers` sidecar or using ONNX Runtime directly in .NET are both acceptable. But that's a future addon, not a core architecture decision now.

---

