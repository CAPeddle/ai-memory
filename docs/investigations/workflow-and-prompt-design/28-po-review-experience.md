## 8. PO Review Experience

### 8.1 Mandatory Artifact Linking

All PO-facing interactions that require a response, approval, clarification, or confirmation must use `vscode_askQuestions`.

Before every `vscode_askQuestions` call, post a context message with clickable links to:
- The story entry in the board
- The ExecPlan being discussed
- Investigation/design docs referenced
- Specific files, directories, or outputs under discussion

When the question is about a specific story, include the relevant story line or section link so the PO can answer with local context.

### 8.2 Approval Gate Format

```
Context message with links:
- [Story ST-N](link)
- [ExecPlan](link)
- [Design doc](link)

Then vscode_askQuestions:
  Header: "Execution Plan" (or "Scope Confirmation", etc.)
  Question: One-sentence summary
  Options:
    - Approve
    - Approve with changes
    - Reject
    - Ask question
    - Switch to /plan
```

---

