### 3.3 Tool Design (Layer 1 — On Demand)

`memory_search` is the primary context-pull mechanism. Its design embeds context engineering principles:

| Design Choice | Principle Applied |
|---------------|-------------------|
| Default `limit = 10` | Don't flood — return enough, not everything |
| MMR diversity ranking | Don't repeat — each result adds new information |
| Project boosting | Relevance over completeness — local context first |
| Return scores alongside content | Let agent judge what to use |
| Return recall_event_id | Enable feedback loop (not just dump-and-forget) |

**Result format is engineered for context efficiency:**
```
[Score: 0.92] (semantic, zoom) CMake 3.25+ required for zoom project
[Score: 0.87] (episodic, 2025-04-15) Fixed find_package(Qt6) by setting Qt6_DIR first
[Score: 0.81] (semantic, cross-project) Conan 2 toolchain sets CMAKE_PREFIX_PATH
```

- One line per result (not full objects)
- Type and project immediately visible
- Scores help agent decide which to read deeper
- IDs available for `memory_inspect` if deeper context needed

