## 5. Source Mixing as Context Engineering

### 5.1 The Cross-Project Knowledge Problem

An agent working on `zoom` needs to know zoom-specific facts. But it also benefits from:
- Cross-project facts (CI conventions, git workflow)
- Patterns from other projects that apply (Conan usage in both zoom and bcf-managers)

**Context engineering solution:** Source mixing with project boosting.

### 5.2 Weighting Strategy

| Source | Boost | Rationale |
|--------|-------|-----------|
| Same project | 1.2× | Most likely relevant |
| Cross-project (NULL) | 1.0× | Always potentially relevant |
| Other project | 1.0× | No penalty — let relevance decide |

This means a highly relevant fact from another project can still surface, but equally-relevant local facts win. The agent doesn't need to explicitly query multiple projects.

### 5.3 Context Shaping in Results

When mixing sources, format results to make provenance immediately clear:

```
