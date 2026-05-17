## 7. Patterns To Defer or Reject

Not every impressive pattern from awesome-copilot belongs here.

### 7.1 Defer

- Full website or marketplace presentation layers
- Plugin packaging and CI materialization flows
- Workflow compilation infrastructure for repository automation
- Large-scale persona catalogs and install-button distribution

### 7.2 Reject for Current Repo Shape

- The `staged` branch contribution model. ai-memory already has a board-driven, PO-gated workflow and does not need a second governance lane.
- Remote plugin ingestion. awesome-copilot's own contribution rules flag the supply-chain risk, and ai-memory has no current need for it.
- Session auto-commit hooks. The local session-resilience rules already require deliberate atomic commits at meaningful boundaries; an automatic session-end commit would work against that discipline.

---

