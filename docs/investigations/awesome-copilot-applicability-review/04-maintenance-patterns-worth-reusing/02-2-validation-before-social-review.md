### 4.2 Validation Before Social Review

The external repo uses validation steps such as `skill:validate`, `plugin:validate`, and build regeneration to reject malformed artifacts before reviewers spend time on them. ai-memory should reuse the principle even if the exact tooling differs. The important part is not Node.js. The important part is that malformed governance artifacts should fail fast.

