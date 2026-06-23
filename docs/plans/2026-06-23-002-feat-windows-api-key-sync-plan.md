---
title: "feat: WSL→Windows MEMORY_API_KEY sync script"
type: feat
status: completed
date: 2026-06-23
deepened: 2026-06-23
origin: docs/brainstorms/wsl2-native-dev-workflow-requirements.md
---

# feat: WSL→Windows MEMORY_API_KEY sync script

## Summary

A WSL bash setup script (`sync-api-key.sh`) reads `MEMORY_API_KEY` from the canonical repo `.env`, pushes it to the Windows user-level environment variable (so VS Code's `.vscode/mcp.json` `${env:MEMORY_API_KEY}` authenticates), and rewrites the hardcoded `Bearer` placeholder in the tracked `opencode-mcp.json` and `.opencode/config.json`. It is idempotent, verifies writes by SHA-256 read-back, never prints the key, and emits a deterministic `VS_CODE_RESTART_REQUIRED` marker when the Windows value actually changed. This closes the "missing configuration step" gap surfaced in `docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md` so the first VS Code MCP connection on a fresh machine just works.

---

## Problem Frame

VS Code on Windows expands `${env:MEMORY_API_KEY}` from the Windows process environment, not from the WSL `.env` the server reads. The server's `server/src/auth.ts` does an exact `Bearer <key>` match and fails closed with `401`. The manual sync step is already documented in `docs/wsl2-setup.md` §5/§11 and the troubleshooting table, but it is discretionary — with no executor enforcing it, the step silently doesn't happen and auth fails on first use. The institutional learning (`docs/solutions/workflow-issues/missing-start-stop-scripts-planning-gap-2026-06-18.md`, `docs/solutions/workflow-issues/story-board-stale-updates-2026-06-19.md`) is unambiguous: required setup steps with no enforcing script become recurring friction.

---

## Requirements

- R1. A single WSL-side script synchronizes `MEMORY_API_KEY` from repo `.env` to the Windows user-level environment variable used by VS Code `${env:MEMORY_API_KEY}` expansion.
- R2. The script materializes the real `opencode-mcp.json` and `.opencode/config.json` (gitignored) from committed `.example` templates containing only placeholders, injecting the canonical key. The committed templates never hold a real secret.
- R10. Acceptance checks: no real OpenCode config is tracked by git; no secret appears in any tracked file; `.gitignore` covers the real files; `.example` templates exist.
- R3. The script is idempotent: a re-run with no drift performs zero writes (no EOL-only churn, no registry churn) and emits no `VS_CODE_RESTART_REQUIRED` marker.
- R4. The script never prints the raw key to stdout/logs and never passes it on the `powershell.exe` argv (uses an env var transport to avoid `ps` leakage and command injection).
- R5. The script fails loud (non-zero exit, no partial writes) when: `.env` is missing, `MEMORY_API_KEY` is empty/malformed, `.env.dev`'s `MEMORY_API_KEY` differs from `.env`'s, `powershell.exe` is unavailable, an opencode file holds a different non-placeholder key, or the post-write SHA-256 read-back mismatches.
- R6. When the Windows env value actually changes, stdout contains a deterministic `VS_CODE_RESTART_REQUIRED` marker (stable for test/assertion grep) alongside a human-readable banner; when nothing changed, the marker is absent.
- R7. `.vscode/mcp.json` is verify-only: the script warns if the `${env:MEMORY_API_KEY}` reference is missing/malformed but never rewrites this gitignored, locally-owned file.
- R8. A `--check` (dry-run) mode reports what *would* change and exits non-zero if drift is detected, without performing any write. This enables safe verification and a deterministic self-test path.
- R9. `docs/wsl2-setup.md` and `README.md` point at the script as the automated setup path, and the developer-experience solutions doc is updated to reference the automation (manual `SetEnvironmentVariable` remains a documented fallback).

**Origin flows:** F1 (Native dev inner loop) — the sync script is a one-time setup step in the same surface as `dev.sh`/`start.sh`.
**Origin acceptance examples:** AE1 (developer follows `docs/wsl2-setup.md` and produces a working connection) — the script replaces the manual `SetEnvironmentVariable` step in AE1's flow.

---

## Scope Boundaries

- The script syncs `MEMORY_API_KEY` only. `DB_PASSWORD` and `OPENROUTER_API_KEY` are out of scope (no Windows consumer for them in the VS Code MCP path).
- The script does not restart or reconfigure Docker containers (`mcp`/`mcp-test` read `MEMORY_API_KEY` from `.env` via Compose, not from the Windows env).
- The script does not auto-rewrite `.env.dev` when it drifts — it fails loud and points to `.env` as canonical, so a deliberate test key is never silently clobbered.
- The script does **not** claim global all-or-nothing atomicity across the Windows registry and WSL files — no shared transaction coordinator exists for bash/powershell. It claims the convergence invariant (see System-Wide Impact): after a clean Phase 0 preflight, a re-run converges all managed surfaces to the `.env`-dictated state.
- The script does not change Which OpenCode config file opencode functionally loads at runtime — that resolution order is an implementation/validation concern; the script keeps both files consistent so the question does not affect correctness.
- Windows process-level vs. user-level env var scope: user-level only (persists across sessions, picked up by VS Code launched from any shell).
- No new `scripts/` directory; the script lives at repo root alongside `dev.sh`/`start.sh` (the established convention for bash dev scripts).

### Deferred to Follow-Up Work

- A CI rollout that runs the script's `--check` mode to detect repo-wide drift (e.g., a committed `opencode-mcp.json` whose placeholder was accidentally overwritten): separate governance/CI story.
- Generation of `.env`/`.env.dev` from `.example` templates when absent: orthogonal to sync (sync reads existing canonical files, does not bootstrap them).

---

## Context & Research

### Relevant Code and Patterns

- `server/src/auth.ts` — exact `Bearer <key>` match, fails closed, no whitespace tolerance (a trailing `\r` silently breaks auth). Sets the byte-identical invariant the sync script must satisfy.
- `.vscode/mcp.json` — uses `Authorization: Bearer ${env:MEMORY_API_KEY}`, URL `http://127.0.0.1:3000/mcp`. Gitignored (`.gitignore` line 16) but force-tracked; may not exist on a fresh clone — script must not assume it.
- `opencode-mcp.json` (root, tracked) and `.opencode/config.json` (tracked) — both use literal `Bearer YOUR_MEMORY_API_KEY` placeholder. These are the rewrite targets.
- `dev.sh`, `start.sh`, `stop.sh` — established bash-dev-script convention: `set -euo pipefail`, `cd "$(dirname "$0")`, `if [ ! -f .env.dev ]; then echo "ERROR..."; exit 1`, reference `docs/wsl2-setup.md` in error messages.
- `tools/*.ps1` — precedent for PowerShell scripts (cross-platform tooling helpers).

### Institutional Learnings

- `docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md` — the exact failure and the SHA-256 hash-compare verification pattern without printing secrets.
- `docs/solutions/workflow-issues/missing-start-stop-scripts-planning-gap-2026-06-18.md` — "plan the full script set up front, not just the happy-path one"; "every setup assumption needs an enforcing script, not a discretionary doc step."
- `docs/solutions/workflow-issues/story-board-stale-updates-2026-06-19.md` — "make required steps mechanical and enforced, not discretionary afterthoughts"; fix recipe = checklist an executor mechanically performs with a verification command.

### External References

- None required. This is repo-local dev tooling; no external best-practice research is warranted.

---

## Key Technical Decisions

- **Canonical source is repo `.env`'s `MEMORY_API_KEY`.** `.env.dev` must agree *on this key only* (not the whole file — `.env.dev` uses `DATABASE_URL`, `.env` uses `DB_PASSWORD` by design). The script reads `.env` as truth and cross-checks `.env.dev`, failing loud on drift.
- **Script host: WSL bash driver invoking `powershell.exe`.** Ergonomic — runs from the same shell as `dev.sh`/`start.sh` and can be chained. Introduces a new WSL→Windows bridge pattern with no repo precedent, but avoids forcing the developer to drop into Windows PowerShell. Matches the user's chosen direction.
- **Key transport via env var, not argv.** `MEMORY_API_KEY_SYNC=<value> powershell.exe -Command '...'` reads `$env:MEMORY_API_KEY_SYNC` inside the PS snippet. Prevents `ps`/process-listing leakage on both sides and removes single-quote-injection risk if the key ever contains a quote.
- **Windows write verified by a second `powershell.exe` call** that re-reads the User env var and SHA-256 compares. A single set-then-get can mask registry write lag or swallowed permission errors.
- **`.vscode/mcp.json` is verify-only, with a real predicate.** It's gitignored and locally owned; rewriting it would surprise the dev. The verify must confirm the literal `${env:MEMORY_API_KEY}` token sits **inside** the `Authorization` header; if it is missing, outside the header, or replaced with a hardcoded `Bearer <key>`, fail loud. Without this predicate, verify is a no-op.
- **OpenCode config files: gitignore the real files, commit `.example` templates, materialize from templates.** Mirrors the repo's existing `.env` (gitignored) / `.env.example` (committed) pattern. The script copies the `.example` template → real (gitignored) file → injects the canonical key. This eliminates three risks at once: the working tree is not perpetually dirty, `git add -A && git commit` cannot leak the secret, and `git checkout`/`git reset` cannot silently revert to the placeholder. The committed files retain only the `Bearer YOUR_MEMORY_API_KEY` placeholder.
- **Idempotent key classification (trichotomy) — correctness bug fixed.** For each managed OpenCode file: `placeholder → rewrite`; `existing key equals the .env target → no-op, no file write`; `existing different real key → abort before any write`. The previous framing ("fail-loud on any non-placeholder real key") would treat a successful first sync as divergent on every subsequent run, breaking idempotency. Missing real file → create from template and inject target key.
- **Phase 0 read-only preflight gate.** All reads and checks complete with zero side effects before any write: `.env` present and key parseable; `.env.dev` matches on this key; `.example` templates and ignore rules exist; real OpenCode config files are untracked; OpenCode key states are classified (trichotomy); `powershell.exe` available; `.vscode/mcp.json` carries the `${env:MEMORY_API_KEY}` token in the Authorization header. Any failure aborts with no writes.
- **Write order: repo-local OpenCode files first, then Windows env, then verify-all.** Surface B (repo-local, narrow blast radius) before Surface A (user-wide, broad blast radius). OpenCode rewrites use temp-file → SHA-256 verify temp → `mv` (rename), with the two `mv`s consecutive so the kill-window is two syscalls wide. If Surface B fails, Surface A never runs (no spurious VS Code restart signal). The two surfaces are logically independent: VS Code reads the Windows env, opencode reads the real files — a partial write *across* A and B does not break either consumer; only a partial write *within* Surface B (between the two `mv`s) is a torn state, healed on the next run.
- **EOL / no-op behavior.** If the key content is already correct for a real file, skip the write entirely — do **not** rewrite a file solely to normalize line endings (avoids a pure-EOL rewrite dirtying the tree for nothing). When a file is written, write LF per `.gitattributes`; SHA-256 the final on-disk bytes after normalization.
- **Restart-notice marker `VS_CODE_RESTART_REQUIRED` emitted only when `windows_changed=true`.** A stable machine-parseable line (suitable as an optional sentinel file too) for tests and fresh shells to detect; suppressed in `--check` mode and when the Windows value was already correct. Crying wolf on idempotent runs trains devs to ignore it.
- **`--check` dry-run mode shares the exact Phase 0 code path** so dry-run and real-run never disagree on detection; it reports decisions, exits non-zero if any drift is detected, performs zero writes, and emits no restart marker.

---

## Open Questions

### Resolved During Planning

- Missing opencode config file (warn + continue, don't block the Windows env sync which is the higher-value step). Resolved per flow analysis default.
- Multiple `MEMORY_API_KEY=` lines in `.env` → fail loud (ambiguous state). Resolved per flow analysis default.
- `.env` inline comments (`MEMORY_API_KEY=abc # comment`) → take everything after `=` literally (matches Deno `--env-file` semantics, which does not strip inline comments). Documented in the script.

### Deferred to Implementation

- Exact name of the env-var transport (`MEMORY_API_KEY_SYNC` is the working name; the implementing agent may choose any clearly-named var).
- Whether to detect a running `code.exe` and emit an extra "VS Code is currently running" reminder via `powershell.exe Get-Process` — nice-to-have, not load-bearing.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
sync-api-key.sh flow
├── Phase 0: read-only preflight (ZERO side effects; any failure -> exit 1, no writes)
│   ├── cd "$(dirname "$0")"; set -euo pipefail
│   ├── command -v powershell.exe           else "requires WSL with Windows interop" -> exit 1
│   ├── [ -f .env ]                         else ERROR -> exit 1
│   ├── parse MEMORY_API_KEY from .env (strip trailing \r; reject empty/contains-newline; reject multiple lines)
│   ├── [ -f .env.dev ]                     else ERROR -> exit 1   # .env.dev must exist
│   ├── parse .env.dev MEMORY_API_KEY; SHA-256 compare -> fail loud on drift (name .env canonical)
│   ├── [ -f <each>.example ] and ignore rules exist; real OpenCode files are untracked (acceptance precondition)
│   ├── classify each real file: placeholder | already-target | divergent (trichotomy); divergent -> exit 1
│   ├── .vscode/mcp.json: present and Authorization header contains literal "${env:MEMORY_API_KEY}"? else fail loud
│   └── --check? -> report decisions and exit (non-zero if any drift); NO restart marker
├── Phase 1: Surface B — repo-local OpenCode files (narrow blast radius)
│   ├── for each real file (opencode-mcp.json, .opencode/config.json):
│   │   ├── placeholder -> copy template -> inject target key -> temp file -> SHA-256 verify temp -> mv into place
│   │   ├── already-target-key -> SKIP write entirely (no EOL churn)
│   │   ├── missing -> create from template + inject
│   │   └── temp-file -> SHA-256 verify temp -> mv (the two mv's consecutive; kill-window = two syscalls)
│   └── if any Phase 1 step fails -> abort before Phase 2 (Windows env untouched -> no spurious restart)
├── Phase 2: Surface A — Windows user env (broad blast radius)
│   ├── read current Windows User MEMORY_API_KEY via powershell.exe; SHA-256 compare to target
│   ├── if equal -> windows_changed=false
│   └── else -> MEMORY_API_KEY_SYNC=<v> powershell.exe SetEnvironmentVariable('User')
│              -> second powershell.exe re-read; SHA-256 compare -> fail loud on mismatch
├── Phase 3: verify-all + report
│   ├── re-read each surface, SHA-256 compare to target
│   ├── Windows env: in-sync | changed
│   ├── opencode files: rewritten | unchanged (already-target) | created (was missing, per file)
│   └── if windows_changed -> emit "VS_CODE_RESTART_REQUIRED" (+ optional sentinel file); suppressed otherwise and in --check
```

**Convergence invariant:** Re-running the script after an interrupted prior run leaves every managed surface in the state dictated by the current `.env`, regardless of which subset of writes the prior run completed — provided Phase 0 preflight is clean. No surface requires manual intervention unless a *pre-existing divergent* key was present before the first run, and the script never introduces divergence itself. Global all-or-nothing atomicity is **not** claimed (no shared transaction coordinator across the Windows registry and WSL files); the residual risk is a microsecond window between the two `mv`s and a latency-width window between Surface B and the powershell call, both self-healing on the next run.

---

## Implementation Units

### U1. sync-api-key.sh core script

**Goal:** A single WSL bash script that performs the full sync (Windows env var + opencode config rewrites), with a `--check` dry-run mode, idempotent SHA-256 verification, and a deterministic restart marker.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Dependencies:** None

**Files:**
- Create: `sync-api-key.sh` (repo root, alongside `dev.sh`/`start.sh`)
- Read: `.env`, `.env.dev` (gitignored inputs)
- Read/Verify: `.vscode/mcp.json` (verify-only, with token predicate)
- Modify tracked → template: rename current `opencode-mcp.json` → `opencode-mcp.json.example` (placeholder only); rename current `.opencode/config.json` → `.opencode/config.example.json`
- Materialize (gitignored targets): `opencode-mcp.json`, `.opencode/config.json`
- Test: `tests/sync-api-key.test.sh` (self-test harness driving the script's `--check` mode against fixtures; see U2 for the harness rationale)

**Approach:**
- Follow the `dev.sh`/`start.sh` convention: `#!/usr/bin/env bash`, `set -euo pipefail`, `cd "$(dirname "$0")`, guarded file checks with `echo "ERROR: ..."` + `exit 1` + a pointer to `docs/wsl2-setup.md`.
- **Phase 0 read-only preflight (zero side effects):** parse `MEMORY_API_KEY` from `.env` (strip trailing `\r`; fail loud on empty/contains-newline/multiple-lines); cross-check `.env.dev`'s `MEMORY_API_KEY` matches (this key only — not the whole file) via SHA-256; verify `.example` templates exist and ignore rules exist; verify real OpenCode files are untracked (`git check-ignore`); classify each real file via the trichotomy (placeholder / already-target / divergent → exit 1 on divergent); confirm `powershell.exe` on PATH; confirm `.vscode/mcp.json` exists and its `Authorization` header contains the literal `${env:MEMORY_API_KEY}` token (fail loud otherwise).
- **Phase 1 (Surface B — repo-local OpenCode files):** for each real file, copy its `.example` template → temp file, inject the target key, SHA-256 verify the temp, then `mv` into place. The two `mv`s are consecutive so the torn-state window is two syscalls. For `already-target` files: SKIP the write entirely (no EOL churn). For a missing real file: create from template + inject. If any Phase 1 step fails, abort before Phase 2 (Windows env untouched → no spurious restart signal).
- **Phase 2 (Surface A — Windows user env):** read current User `MEMORY_API_KEY` via `powershell.exe`, SHA-256 compare; if equal → `windows_changed=false`; else set via `MEMORY_API_KEY_SYNC=<value> powershell.exe -NoProfile -Command '...'` (value never on argv or in the command string), then a *second* `powershell.exe` call re-reads and SHA-256 compares — fail loud on mismatch.
- **Phase 3 (verify-all + report):** re-read every surface, SHA-256 compare to target; print a per-surface summary; emit `VS_CODE_RESTART_REQUIRED` (stable line; optional sentinel file) *only* when `windows_changed=true`.
- `--check` shares the exact Phase 0 code path: reports decisions, exits non-zero if any drift detected, performs zero writes, emits no restart marker.
- `chmod +x sync-api-key.sh` on creation.

**Patterns to follow:**
- `dev.sh`, `start.sh` (bash dev-script conventions, guard-and-fail-loudly, `docs/wsl2-setup.md` pointer).
- `docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md` (SHA-256 hash-compare verification pattern, never print the key).

**Test scenarios:**
- **First sync from placeholders (Happy path):** `.env` and `.env.dev` carry the same valid `MEMORY_API_KEY`; Windows env differs; both real OpenCode files absent (only `.example` templates present); on `./sync-api-key.sh`, real files are created from templates with the canonical key, Windows user env is updated, stdout contains `VS_CODE_RESTART_REQUIRED`, exit 0.
- **Idempotent second sync (Edge case):** Immediately re-running `./sync-api-key.sh` with everything in sync: real OpenCode files already hold the target key (already-target → SKIP write), no `mv`/file write occurs, Windows env already equal, stdout does NOT contain `VS_CODE_RESTART_REQUIRED`, exit 0. `git status` is unchanged for the real files (they are gitignored anyway, so tree is clean).
- **Divergent real key abort with no writes (Error path):** A managed real OpenCode file holds `Bearer <some-other-real-key>` (not the placeholder and not the target) → Phase 0 trichotomy detects `divergent` → exit 1, no OpenCode write, no Windows env write.
- **Failure before writes in Phase 0 (Error path):** Any Phase 0 precondition failing (missing `.env`, missing `.env.dev`, `.env.dev` drift, empty/malformed key, missing template, tracked real file, absent `.vscode/mcp.json` token, `powershell.exe` unavailable) → exit 1 with a clear message and zero writes. Verified by asserting the real files' SHA-256 and Windows env SHA-256 are unchanged before/after.
- **Interruption after first local write → convergence on re-run (Edge case / Recovery):** Simulate a torn Surface B (one real file written, the second `mv` not performed — e.g., the script is killed mid-Phase 1) or a Surface-B-done-but-Surface-A-skipped stop, then re-run `./sync-api-key.sh`; the re-run converges both real files to the target key and the Windows env to the target key. No manual intervention required.
- **VS Code token absent or outside the Authorization header (Error path):** `.vscode/mcp.json` exists but `${env:MEMORY_API_KEY}` is missing, or is present outside the `Authorization` header (e.g., in a comment or another field), or replaced with a hardcoded `Bearer <key>` → Phase 0 fail loud, no writes.
- **Missing real file → create from template (Happy path):** `opencode-mcp.json` real file absent but `.example` template present → Phase 1 creates the real file with the target key; other surfaces still sync; exit 0.
- **`--check` detects drift, performs zero writes (Happy path):** With Windows env (or a managed file) out of sync, `./sync-api-key.sh --check` exits non-zero, prints the would-change decision, performs zero writes (verify by re-reading Windows env and real files and confirming SHA-256 unchanged), and emits NO `VS_CODE_RESTART_REQUIRED` marker.
- **`--check` clean (Happy path):** With everything in sync, `./sync-api-key.sh --check` exits 0 and reports no drift.
- **Real files ignored/untracked and templates secret-free (Acceptance / Invariant):** After running, `git check-ignore opencode-mcp.json .opencode/config.json` returns both (gitignored); `git status` does not list them; `git ls-files` does not list them; and the `.example` templates contain only the `Bearer YOUR_MEMORY_API_KEY` placeholder (grep the templates for the canonical 64-char hex key shape yields zero matches).
- **`.env.dev` drift (Error path):** `.env.dev` `MEMORY_API_KEY` differs from `.env`'s → exit 1, both SHA-256 prefixes printed, `.env` named canonical, no writes.
- **Empty/malformed key (Error path):** `MEMORY_API_KEY=` empty, whitespace-only, or contains a newline → exit 1, no writes.
- **`powershell.exe` unavailable (Error path):** `command -v powershell.exe` fails (non-WSL or interop disabled) → clear "requires WSL with Windows interop enabled" message → exit 1, no writes.
- **Key never printed (Invariant):** Running `./sync-api-key.sh | tee log.txt` then grepping the log for the 64-char hex key yields zero matches; only SHA-256 fingerprints appear. Powershell invocations transport the key via env var, not argv.
- **Post-write SHA-256 mismatch (Error path):** If the read-back hash differs from the written hash (Windows or OpenCode file), exit 1 with "verification failed"; partial state left is healed on the next run per the convergence invariant.

**Verification:**
- `./sync-api-key.sh --check` against a healthy repo exits 0 and reports in-sync.
- After `./sync-api-key.sh` with drift: Windows User env SHA-256 matches the `sha256sum` of `.env`'s `MEMORY_API_KEY`; both real OpenCode files' `Authorization` header SHA-256 (key portion) matches the same target.
- Acceptance: `git check-ignore opencode-mcp.json .opencode/config.json` succeeds for both; `git ls-files opencode-mcp.json .opencode/config.json` returns nothing; `.example` templates contain only the placeholder.
- A Windows-side MCP probe returns `STATUS=200` after fully restarting VS Code if it was running (probe command left to the operator; not asserted by the script).
- Re-running on an in-sync repo leaves `git status` unchanged and emits no `VS_CODE_RESTART_REQUIRED` marker.

---

### U2. Wire the script into the dev workflow docs and the solutions learning

**Goal:** Convert the tracked OpenCode configs into the `.example`-template pattern (gitignored real files + committed placeholder templates), wire `.gitignore`, and make the script the documented automated path. `docs/wsl2-setup.md`, `README.md`, and the developer-experience solutions doc all point at `sync-api-key.sh`; the manual `SetEnvironmentVariable` step stays as a fallback.

**Requirements:** R2, R9, R10

**Dependencies:** U1

**Files:**
- Rename tracked → template: `opencode-mcp.json` → `opencode-mcp.json.example`; `.opencode/config.json` → `.opencode/config.example.json` (placeholder-only, no real secret)
- Modify: `.gitignore` — add `opencode-mcp.json` and `.opencode/config.json` (real, generated) but **negate** the `.example` files so templates stay tracked
- Modify: `docs/wsl2-setup.md` (§5 after the manual `SetEnvironmentVariable` block — add the automated alternative; note the OpenCode `.example` split)
- Modify: `README.md` (the VS Code Copilot section — add the `./sync-api-key.sh` step before the manual PowerShell snippet; note tracked-vs-generated OpenCode files)
- Modify: `docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md` (Guidance / Related — add an "Automated path" subsection pointing at `sync-api-key.sh`; note the `.example` model)
- Optional test harness: `tests/sync-api-key.test.sh` — drives `./sync-api-key.sh --check` against fixture trees to assert the Phase 0 decisions deterministically without requiring a live Windows env (the repo has no bash-test precedent, so this is a lightweight harness, not part of the Deno suite)

**Approach:**
- Rename the current tracked `opencode-mcp.json` and `.opencode/config.json` into `opencode-mcp.json.example` and `.opencode/config.example.json` (keeping only the `Bearer YOUR_MEMORY_API_KEY` placeholder — verify no real secret is in them before renaming; if a real key is present, strip it to the placeholder first).
- Update `.gitignore` to ignore the real `opencode-mcp.json` and `.opencode/config.json` while keeping `.example` files tracked (negation entries, mirroring the `.env` / `!.env.example` pattern).
- In `docs/wsl2-setup.md` §5, after the existing manual PowerShell `SetEnvironmentVariable` block, add: "Alternatively, from WSL: `./sync-api-key.sh` reads `.env`, materializes the gitignored OpenCode configs from their `.example` templates, and sets the Windows user `MEMORY_API_KEY` for you. Re-run it after rotating the key." Keep the manual block as a fallback for non-WSL-driven setups.
- In `README.md`'s VS Code Copilot section, insert `./sync-api-key.sh` as the recommended step before the manual `SetEnvironmentVariable` snippet; note that the real OpenCode config files are now gitignored and generated from `.example` templates.
- In the solutions doc's **Guidance** section, add an "Automated path" bullet referencing `sync-api-key.sh` and the `--check` mode, noting the `.example` model. In **Related**, add `sync-api-key.sh` and the `.example` files. Do not remove the manual fallback — it remains valid for environments without WSL interop.
- Lightweight `tests/sync-api-key.test.sh` harness (optional): builds a fixture tree (fixture `.env`/`.env.dev`/templates, stubbed `powershell.exe` on PATH) and asserts `--check` exit codes and the restart-marker presence/absence across the key scenarios. Not gated by CI by default; runs from repo root where the script lives.

**Patterns to follow:**
- `docs/wsl2-setup.md` existing tone (numbered sections, code fences, `> ` callouts).
- `README.md` VS Code Copilot section structure.

**Test scenarios:**
- Test expectation: none — documentation cross-references only, no behavioral change. Verified by reading the updated sections and confirming the `sync-api-key.sh` path is mentioned in all three files alongside the retained manual fallback.

**Verification:**
- All three docs mention `sync-api-key.sh` as the automated path; the manual `SetEnvironmentVariable` fallback is retained in `docs/wsl2-setup.md` and `README.md`.
- `grep -n "sync-api-key.sh" docs/wsl2-setup.md README.md docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md` returns matches in all three.

---

## System-Wide Impact

- **Interaction graph:** The script writes to the Windows user registry (via `[Environment]::SetEnvironmentVariable('User')`), rewrites two tracked JSON files, and reads (verify-only) one gitignored JSON file. It does not touch the running MCP server, Docker containers, or the database.
- **Error propagation:** All failures are loud (non-zero exit with a clear message); no partial-write state is left. Pre-flight validations complete before any write.
- **State lifecycle risks:** Global all-or-nothing atomicity is **not** claimed (no shared transaction coordinator across the Windows registry and WSL files). **Convergence invariant:** after a clean Phase 0 preflight, re-running the script converges all managed surfaces (real OpenCode files, Windows env) to the `.env`-dictated state regardless of which subset of writes a prior interrupted run completed; the only un-healable state is a *pre-existing divergent* real key, which fails loud by design (Phase 0, before any write). Residual: a microsecond window between the two `mv`s and a latency-width window between Surface B and the powershell call — both self-healing on the next run. Write order Surface B (repo-local) before Surface A (broad blast radius) means a failed Surface B never triggers a spurious Windows env change.
- **API surface parity:** No server API change. The server's exact-match auth contract (`server/src/auth.ts`) is unchanged — the script only ensures the value VS Code sends matches what the server expects.
- **Integration coverage:** Unit tests alone cannot prove the WSL→Windows bridge works end-to-end (requires WSL + Windows). The script's built-in SHA-256 read-back (Phase 3 verify-all) is the primary verification gate; the manual Windows PowerShell MCP probe (`STATUS=200`) is the integration confirmation.
- **Unchanged invariants:** `server/src/auth.ts` exact-match behavior, `.vscode/mcp.json` contents (verify-only), Docker container env (Compose reads `.env`, not Windows env), the `.env`/`.env.dev`/`.env.example`/`.env.dev.example` files themselves (script reads but does not write them), and which OpenCode file opencode functionally loads at runtime (script keeps both consistent so resolution order does not affect correctness).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Secret embedded in git-tracked OpenCode files → dirty tree / accidental commit / `git checkout` reverts to placeholder | Adopt the repo's existing `.env` / `.env.example` pattern: gitignore the real `opencode-mcp.json` and `.opencode/config.json`, commit `.example` templates, script materializes real files from templates. Documented acceptance checks confirm no real file is tracked and no secret is in a tracked file. |
| Idempotency broken: a successful prior sync makes every re-run look "divergent" | Trichotomy classification in Phase 0: `placeholder → rewrite`, `already-target → no-op`, `different-real → abort`. `already-target` is a true no-op (no file write). |
| Partial-write torn state (Window between writes) | Phase 0 gate (no write until all checks green); Surface B before Surface A; temp-file + `mv` per file with consecutive renames; convergence invariant on re-run. Residual windows stated explicitly in System-Wide Impact. |
| No repo precedent for WSL→`powershell.exe` bridge; quoting/escaping edge cases | Pass the key via env var transport (never argv, never string-interpolated into `-Command`); SHA-256 read-back verifies the round-trip. |
| `powershell.exe` unavailable (non-WSL, interop disabled, exec policy) | Detect with `command -v powershell.exe`; fail loud with a clear "requires WSL with Windows interop enabled" message; no silent skip. |
| EOL churn dirties the tree on a no-op run | If key content already correct, SKIP the write entirely — never rewrite solely to normalize line endings. When a write happens, write LF per `.gitattributes` and SHA-256 the final on-disk bytes. |
| `.vscode/mcp.json` verify step is a no-op without a predicate | Phase 0 asserts the literal `${env:MEMORY_API_KEY}` token sits inside the `Authorization` header; else fail loud. |
| Raw key leaks to stdout/logs/`ps` | Print only SHA-256 fingerprints; transport the value via env var, not argv; ensure `set -x` is off. |
| VS Code already running when the env var changes — dev forgets to restart | Emit `VS_CODE_RESTART_REQUIRED` marker only on actual change (optional sentinel file); suppressed in `--check` and when nothing changed. Implementer may add a `Get-Process code.exe` reminder as a nice-to-have. |

---

## Documentation / Operational Notes

- The script is a one-time-per-key-rotation setup step, not part of the hot inner loop. It complements `dev.sh`/`start.sh`/`stop.sh` (which run on every session).
- After running the script with `windows_changed=true`, the developer must fully restart VS Code (not reload) for `${env:MEMORY_API_KEY}` to pick up the new value. The script cannot do this for them.
- The `--check` mode is suitable for a future CI gate that detects accidental repo-wide drift (e.g., a committed `opencode-mcp.json` whose placeholder was overwritten locally and committed). Deferred to follow-up work.

---

## Sources & References

- **Origin document:** [docs/brainstorms/wsl2-native-dev-workflow-requirements.md](docs/brainstorms/wsl2-native-dev-workflow-requirements.md) (F1, AE1 context)
- Related code: `server/src/auth.ts`, `.vscode/mcp.json`, `opencode-mcp.json`, `.opencode/config.json`, `dev.sh`, `start.sh`
- Institutional learnings:
  - [docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md](docs/solutions/developer-experience/windows-vscode-mcp-memory-api-key-mismatch-2026-06-23.md)
  - [docs/solutions/workflow-issues/missing-start-stop-scripts-planning-gap-2026-06-18.md](docs/solutions/workflow-issues/missing-start-stop-scripts-planning-gap-2026-06-18.md)
  - [docs/solutions/workflow-issues/story-board-stale-updates-2026-06-19.md](docs/solutions/workflow-issues/story-board-stale-updates-2026-06-19.md)
- Dev workflow doc: [docs/wsl2-setup.md](docs/wsl2-setup.md) §5, §11, troubleshooting table