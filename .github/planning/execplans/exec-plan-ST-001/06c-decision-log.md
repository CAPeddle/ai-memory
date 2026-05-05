## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: Install SDK 8.0.100 directly from Microsoft installer after package-manager install could not provide the exact pinned band.
  Rationale: Preserve approved Task 4.1 requirement (`global.json` version 8.0.100) without altering ExecPlan scope.
  Date: 2026-05-05

- Decision: Use `git add -f Directory.Build.props` and a corrective Task 4.2 commit instead of changing ignore configuration.
  Rationale: Minimal, task-scoped fix that preserves existing user/global git settings and keeps required file tracked.
  Date: 2026-05-05

- Decision: Stop at Task 4.3 and escalate to plan-review instead of introducing ad-hoc restore-source workarounds.
  Rationale: ExecPlan did not define behavior for private-feed auth conflicts; `/continue` rules require escalation for uncovered issues.
  Date: 2026-05-05
