---
date: 2026-06-17
ticket: ""
type: feat
status: completed
origin: docs/brainstorms/wsl2-native-dev-workflow-requirements.md
---

# feat: Migrate to WSL2-Native Development Workflow

## Problem Frame

The current dev workflow runs Deno inside a Docker container via a `./server:/app` bind mount from NTFS. NTFS-to-ext4 cross-filesystem I/O is 5-20× slower than native ext4, and inotify events do not propagate across the Windows-WSL2 mount boundary, making `deno run --watch` unreliable. Docker Desktop adds ~1-2 GB of RAM overhead and abstracts the Docker daemon behind Hyper-V, producing subtle CI-divergence. (see origin: docs/brainstorms/wsl2-native-dev-workflow-requirements.md)

---

## Summary

Migrate ai-memory to a full WSL2-native dev environment: Docker Engine runs natively inside WSL2 (no Docker Desktop), the repo lives on WSL2 ext4, Deno runs natively with hot reload against a Dockerized Postgres, and supporting scripts plus documentation bring the setup to team-ready quality. CI and `docker-compose.yml` are unchanged.

---

## Key Technical Decisions

- **`docker-compose.yml` is unchanged.** Research confirms relative bind mounts (`./server:/app`) and `tmpfs` resolve correctly when `docker compose` is run from a WSL2 ext4 path with Docker Engine native in WSL2. No service, volume, or network definitions need editing.
- **`.env.dev` uses `127.0.0.1`, not `localhost`.** A confirmed bug on this Windows host causes VS Code to resolve `localhost` to `::1` (IPv6) while the server is only bound on IPv4, causing MCP connect failures. Pinning `127.0.0.1` avoids this for both the `DATABASE_URL` and any future client configuration.
- **Networking docs cover two paths.** On Windows 11 22H2+ with WSL 2.0.4+, `networkingMode=mirrored` in `~/.wslconfig` makes `127.0.0.1:3000` transparently reachable from Windows without `netsh portproxy`. On Windows 10 (or if mirrored mode causes Docker port issues), the default NAT mode with `localhostForwarding=true` (default) already works — no configuration change needed.
- **`.env.dev` is already gitignored.** The existing `.gitignore` pattern `.env.*` covers `.env.dev` — no `.gitignore` edit is needed.
- **Lockfile update path stays container-based.** The intentional `deno.lock` refresh path (`deno cache --lock=deno.lock --lock-write ...`) continues to run inside `mcp-test` to ensure CI and developer machines stay in sync. Native `deno run --watch` enforces frozen mode automatically via `server/deno.json`.
- **`dev.sh` must include `--allow-read`.** `migrate.ts` uses `Deno.readDir()` and `Deno.readTextFile()` to scan `server/db/*.sql` via `import.meta.url`-relative paths. Native Deno execution requires the flag that the Dockerfile's `CMD` already carries.
- **A `.env.dev.example` is added alongside `.env.example`.** The existing example only covers Docker Compose variables; a companion example for native Deno dev makes setup self-documenting.

---

## System-Wide Impact

- **Developers**: Primary beneficiaries — faster inner loop, reliable hot reload, lower RAM usage.
- **CI (GitHub Actions)**: Unaffected. CI runs on `ubuntu-latest` with Linux-native Docker; the existing workflow file requires zero changes.
- **`CLAUDE.md`**: Needs a new "WSL2-Native Dev" section added alongside the existing Docker Compose commands. The current heading "Cloud MCP (Deno, runs in container — host Deno is NOT a prerequisite)" is no longer the only path and the parenthetical will be updated.
- **`.github/instructions/dev-environment.instructions.md`**: The line "Deno runs inside the container — always use `docker compose exec mcp-test deno ...`" is no longer universally true and must be updated to reflect the dual-mode reality.
- **No schema, API, or protocol changes.** The MCP transport, auth, and tool surface are untouched.

---

## Implementation Units

### U1. Create `dev.sh` and `.env.dev.example`

**Goal:** Provide the primary entrypoint for the native dev inner loop: starts the `db` service if not running, then launches Deno natively with hot reload.

**Requirements:** R4, R3 (see origin)

**Dependencies:** None

**Files:**
- `dev.sh` — new file at repo root
- `.env.dev.example` — new file at repo root

**Approach:**
- `dev.sh` checks whether the `db` container is running (via `docker compose ps --status running db`); if not, starts it with `docker compose up -d db` and waits for its healthcheck to pass
- Sources `.env.dev` using the shell's `.` (dot) command before invoking Deno, so variables are present in the Deno process environment
- Invokes `deno run --watch --allow-net --allow-env --allow-read --env-file=.env.dev server/index.ts` from the repo root (the working directory must be the repo root so relative imports within `server/` resolve correctly via `import.meta.url`)
- Script must be POSIX-compatible (`#!/usr/bin/env bash` or `#!/bin/sh`) and executable (`chmod +x dev.sh`)
- `.env.dev.example` documents the three variables required for native Deno execution:
  - `DATABASE_URL=postgresql://ai_memory:<DB_PASSWORD>@127.0.0.1:5432/ai_memory`
  - `MEMORY_API_KEY=<same value as .env>`
  - `OPENROUTER_API_KEY=<same value as .env>`
  - A comment explaining that `<DB_PASSWORD>` must match `DB_PASSWORD` in `.env`

**Patterns to follow:** `.env.example` for file style; `server/Dockerfile` CMD for the Deno flag set

**Test scenarios:**
- Given `db` container is stopped, when `./dev.sh` is run, the `db` container starts and the server process launches (Covers AE3)
- Given `db` container is already running, when `./dev.sh` is run, no duplicate container is started and the server launches normally
- Given `.env.dev` is missing, when `./dev.sh` is run, the script exits with a clear error message rather than silently launching Deno without required env vars
- Given `.env.dev` is present, when `./dev.sh` launches the server, `Deno.env.get("DATABASE_URL")` resolves to the value from `.env.dev` (not from `.env`)

**Verification:** `./dev.sh` starts the server; `curl http://127.0.0.1:3000/health` returns `{"status":"ok"}`; editing a source file triggers a Deno reload visible in the terminal within 2 s

---

### U2. Update `.gitignore` verification and add `.env.dev.example` tracking

**Goal:** Confirm `.env.dev` is covered by the existing `.gitignore` and ensure `.env.dev.example` is tracked.

**Requirements:** R3, AE2 (see origin)

**Dependencies:** U1

**Files:**
- `.gitignore` — verify only; no edit expected (`.env.*` already covers `.env.dev`)
- `.env.dev.example` — must be tracked (not gitignored); the `!.env.example` pattern covers only `.env.example` by name, not `.env.dev.example`, so this file will be tracked automatically

**Approach:**
- Run `git check-ignore -v .env.dev` inside WSL2 to confirm coverage — expected output references `.env.*` pattern on line 43 of `.gitignore`
- Run `git check-ignore -v .env.dev.example` to confirm it is NOT ignored — expected: no output (file is trackable)
- If `.env.dev.example` would be ignored by `.env.*`, add a negation exception `!.env.dev.example` to `.gitignore` (analogous to the existing `!.env.example` exception)
- This unit may require no file edits at all — it is a verification gate before documentation is written

**Test scenarios:**
- `git status` in a repo with a real `.env.dev` file present does not show `.env.dev` as an untracked file (Covers AE2)
- `git status` shows `.env.dev.example` as a tracked new file after `git add .env.dev.example`

**Verification:** `git check-ignore -v .env.dev` outputs a match; `git check-ignore -v .env.dev.example` outputs nothing

---

### U3. Write `docs/wsl2-setup.md`

**Goal:** One-time setup guide covering everything a developer needs to go from bare Windows machine to a working WSL2-native dev environment.

**Requirements:** R10, R2, R5, AE1 (see origin)

**Dependencies:** U1, U2

**Files:**
- `docs/wsl2-setup.md` — new file

**Approach:**

The guide must cover these sections in order:

1. **Prerequisites** — Windows 10 build 19041+ or Windows 11; WSL2 feature enabled; hardware virtualisation enabled in BIOS

2. **Install WSL2 and Ubuntu** — `wsl --install` (Ubuntu default), or `wsl --install -d Ubuntu-24.04`; ensure `wsl --version` shows WSL 2

3. **Install Docker Engine inside WSL2 (not Docker Desktop)** — follow the official Docker Engine install for Ubuntu (`apt` repository method); install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`; add user to `docker` group (`sudo usermod -aG docker $USER`); enable daemon on boot (`sudo systemctl enable docker`)

4. **Install Deno 2.x** — using the official Deno install script (`curl -fsSL https://deno.land/install.sh | sh`); verify `deno --version` shows 2.x; add `~/.deno/bin` to `PATH` in `~/.bashrc` or `~/.zshrc`

5. **Clone the repository to WSL2 ext4** — `git clone <repo-url> ~/projects/ai-memory`; explain why: ext4 gives full inotify support and 5-20× better I/O than NTFS for `deno run --watch`

6. **Create `.env`** — copy `.env.example` to `.env` and fill in `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`; this file is for Docker Compose only

7. **Create `.env.dev`** — copy `.env.dev.example` to `.env.dev`; fill in `DATABASE_URL` using the `DB_PASSWORD` from `.env`; explain that `127.0.0.1` must be used (not `localhost`) due to IPv6 resolution behaviour on Windows; `MEMORY_API_KEY` and `OPENROUTER_API_KEY` copy from `.env`

8. **Start the dev environment** — `docker compose up -d` (starts `db` and `mcp`); or simply `./dev.sh` (starts `db` if needed and launches Deno natively)

9. **Verify the setup** — `curl http://127.0.0.1:3000/health`; `deno test --frozen --allow-net --allow-env --allow-read server/tests/search-mmr.test.ts` (quick native test)

10. **Windows port reachability (reaching WSL2 from Windows)** — two paths:
    - *Windows 11 22H2+ (recommended)*: add `networkingMode=mirrored` to `%USERPROFILE%\.wslconfig`; run `wsl --shutdown` then restart; verify with `wslinfo --networking-mode`; note that if Docker container port issues arise, add `ignoredPorts=3000,3001,5432` under `[experimental]`
    - *Windows 10 / fallback*: default NAT mode with `localhostForwarding=true` (default) already works; no `.wslconfig` change needed; use `127.0.0.1:3000` not `localhost:3000` (VS Code / MCP clients)

11. **Lockfile hygiene** — under normal operation `deno.json`'s `frozen: true` prevents accidental drift; to intentionally update dependencies, run `docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts` and commit the updated `server/deno.lock`

12. **If Docker Desktop is still installed** — disable its WSL2 integration (`Settings → Resources → WSL Integration → uncheck the distro`) to prevent it from taking over the Docker socket

**Patterns to follow:** Existing `docs/investigations/` landing-page style; `.env.example` for variable documentation

**Test scenarios:**
- Test expectation: none — this is a documentation unit; correctness is validated by AE1 (a developer following the guide produces a working environment) and by the shell commands in the guide executing without error

**Verification:** Document renders without broken links; all shell commands in the guide can be executed top-to-bottom and produce the expected output (validated manually by following the guide on a fresh WSL2 install)

---

### U4. Update `CLAUDE.md` and `dev-environment.instructions.md`

**Goal:** Update the project's primary agent-facing and developer-facing documentation to reflect the new dual-mode reality: Docker Compose remains valid, native Deno is now the preferred inner loop.

**Requirements:** R8, AE1, AE3 (see origin)

**Dependencies:** U1, U3

**Files:**
- `CLAUDE.md` — add WSL2-native workflow section; update section heading and parenthetical
- `.github/instructions/dev-environment.instructions.md` — update "Deno runs inside the container" note; add native Deno commands; add `--frozen` to CLAUDE.md test commands (reconcile with README and instructions file)

**Approach:**

**`CLAUDE.md` changes:**
- Change the section heading from `"Cloud MCP (Deno, runs in container — host Deno is NOT a prerequisite)"` to `"Cloud MCP server"` (the parenthetical is now untrue)
- Add `--frozen` to the two `deno test` commands in the existing Docker Compose commands block (aligns with README and `dev-environment.instructions.md`)
- Add a new subsection `"### WSL2-Native Dev (recommended inner loop)"` immediately after the Docker Compose commands block, containing:
  - Prerequisites link to `docs/wsl2-setup.md`
  - `./dev.sh` — starts Postgres if needed, launches Deno natively with hot reload
  - `deno test --frozen --allow-net --allow-env --allow-read server/tests/<file>.test.ts` — quick native test against dev Postgres
  - Note: for full isolation tests, continue using the Docker test profile
  - Note: `DATABASE_URL` in `.env.dev` must use `127.0.0.1`, not `localhost`

**`dev-environment.instructions.md` changes:**
- Update or remove the line `"Deno runs inside the container — always use docker compose exec mcp-test deno ..."` to reflect that native Deno is now the preferred dev path; container-based execution remains valid for isolation tests
- Add native Deno commands alongside the Docker Compose commands
- Note the `dev.sh` entrypoint

**Patterns to follow:** Existing `CLAUDE.md` section structure and PowerShell code block style

**Test scenarios:**
- Test expectation: none — documentation unit; validated by human review against AE1 and AE3: a developer reading CLAUDE.md can follow the native workflow without consulting any other document

**Verification:** CLAUDE.md renders correctly in a Markdown viewer; all commands in the new section are syntactically valid; the `--frozen` flag is present on all `deno test` commands in the file

---

## Scope Boundaries

- Migrating Postgres out of Docker is out of scope — Postgres remains containerized (see origin)
- Changes to `docker-compose.yml`, existing Dockerfiles, or CI configuration are out of scope (see origin)
- Windows-native development (without WSL Remote) remains a supported fallback but is not optimized by this work
- Uninstalling Docker Desktop is the developer's choice; the plan documents how to disable its WSL2 integration

### Deferred to Follow-Up Work

- Adding a `deno task dev` shortcut in `server/deno.json` — the `dev.sh` script covers this for now; a Deno task could simplify the command further but is not required by R4
- Running `/ce-compound` to capture the WSL2 inotify/NTFS, `localhost`→`127.0.0.1`, and lockfile hygiene learnings in `docs/solutions/` — recommended at story close

---

## Test Scenarios Summary

All feature-bearing units in this plan produce scripts and documentation rather than application code. The verification strategy is end-to-end execution:

1. `./dev.sh` boots the stack, server responds on `http://127.0.0.1:3000/health`
2. Editing a source file triggers a visible Deno reload within 2 s
3. `deno test --frozen --allow-net --allow-env --allow-read server/tests/search-mmr.test.ts` passes natively
4. `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/` passes (full isolation suite unchanged)
5. `git status` does not show `.env.dev` as untracked
6. CI run passes with zero config changes

---

## Dependencies / Assumptions

- WSL2 is available on the developer's Windows machine (Windows 10 build 19041+ or Windows 11)
- Docker Engine (`docker-ce`) and the Docker Compose plugin are installable inside WSL2 via `apt`
- Deno 2.x is available for Linux x86_64 via the official install script
- The `db` service healthcheck in `docker-compose.yml` is sufficient for `dev.sh` to know when Postgres is ready
- The existing `.env` file is already populated with valid values (`MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`) before the native workflow is first used
- `networkingMode=mirrored` is available on Windows 11 22H2+ (WSL 2.0.4+); Windows 10 users rely on the default NAT + `localhostForwarding=true`

---

## Deferred Implementation Notes

- Exact `docker compose ps` command variant to check service running state — the implementer should verify `docker compose ps --services --filter status=running` vs `docker compose ps --status running db` works correctly in the installed Docker Compose plugin version
- Whether `--env-file=.env.dev` in `deno run` and sourcing `.env.dev` in `dev.sh` are redundant — `--env-file` sets variables in Deno's env; the shell `source` sets them in the shell's env; both are present to ensure the variable is available regardless of how Deno resolves its environment. The implementer may simplify to one if testing confirms no difference
