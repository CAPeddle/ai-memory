## 3. Lightweight Local Validation

The local smoke test followed the ExecPlan's revised WSL2 path and then fell back to docs+code mode when runtime validation still did not complete.

| Check | Result |
|-------|--------|
| Synthetic corpus creation | Succeeded: created `2026-05-04.md`, `session-st014.jsonl`, and `ai-memory-doc-sample.md` |
| WSL2 availability | Succeeded: default distro `Ubuntu`, default version `2` |
| Linux Python check | Succeeded: `Python 3.12.3` |
| Linux-side editable install | Succeeded: `memsearch[onnx]` installed into `.tmp/st-014-memsearch/venv-linux/` |
| Local indexing/search flow | Failed before validation outputs were produced |

Observed runtime outcome:

- Native Windows Milvus Lite validation was not viable because upstream `milvus-lite` does not provide Windows wheels for the local-file path used by the plan.
- The revised WSL2 retry installed successfully but the index attempt stopped in the `pymilvus` / `google.protobuf` import chain before any `search`, `expand`, or `transcript` output files were produced.
- Because of that gap, this review treats runtime-backed claims as unvalidated locally and relies on upstream docs and code for architecture conclusions.

This bounded runtime result is still useful: it confirms that memsearch's local story is more operationally fragile on this Windows-first workstation than ai-memory's current SQLite-first design target.

---

