## 10. Artifact Layout for ai-memory

```
.github/
├── prompts/
│   ├── plan.prompt.md
│   ├── continue.prompt.md
│   └── recover.prompt.md
├── planning/
│   ├── story-board.md
│   ├── query-packets/
│   │   └── QP-001-scaffold-project.md (example)
│   └── execplans/
│       ├── _TEMPLATE.md
│       └── exec-plan-ST-001.md (example)
├── instructions/
│   ├── session-resilience.instructions.md
│   └── coding-standards.instructions.md
└── skills/
    └── compound-engineering/
        └── SKILL.md

docs/
├── investigations/           # Research and design docs
├── board-impact/             # Spike outputs
└── architecture/             # Stable architecture docs

FollowUpSessionLog.txt        # Session delta (root)
```

---

