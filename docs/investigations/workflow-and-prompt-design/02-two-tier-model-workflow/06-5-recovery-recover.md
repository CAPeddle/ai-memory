### 2.5 Recovery (`/recover`)

1. Gather evidence: git state, ExecPlans, artifact existence checks
2. Build timeline: classify each action as LANDED / PARTIAL / MISSING / INTERRUPTED / NEVER STARTED
3. Identify failure mode (context overflow, retry loop, plan gap, etc.)
4. Annotate §5b Recovery Ledger with concrete Avoidance instructions
5. Update FollowUpSessionLog.txt
6. Commit annotations only — never re-execute

