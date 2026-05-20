### 13.5 Key Additions to Adopt

1. **Timestamp progress entries** — `- [x] (2025-05-15 14:00Z) Implemented FTS5 schema` in Recovery Ledger
2. **Mandatory verification step per task** — every §4 task must end with a command or assertion the executor can run
3. **Observable acceptance criteria** — phrase as behaviour ("GET /memories returns 200 with JSON array") not implementation ("added GetMemories method")
4. **Self-containment rule** — ExecPlans must not reference external blogs or docs; embed the needed knowledge directly
5. **Revision notes** — when updating an ExecPlan, append a note at the bottom explaining what changed and why

---

