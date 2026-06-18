---
date: 2026-06-17
topic: wsl2-native-dev-workflow
---

# WSL2-Native Development Workflow for ai-memory

## Summary

Migrate ai-memory to a full WSL2-native development environment: the repository moves from NTFS to WSL2 ext4, Docker Engine runs natively inside WSL2 (replacing Docker Desktop), and Deno executes natively with hot reload against a Dockerized Postgres, backed by a standardized dev script, gitignored environment configuration, and updated project documentation.

---

## Problem Frame

The current dev workflow relies on Docker Desktop for Windows with the repo on NTFS. Deno runs inside a Docker container via bind mount. This produces two compounding friction points: (1) NTFS-to-ext4 cross-filesystem I/O is 5-20× slower than native ext4 on every `deno test` and file-watch cycle; (2) inotify events do not propagate across the Windows-WSL2 mount boundary, so `deno run --watch` does not reliably detect file changes, forcing manual `docker compose restart` restarts. Together these push the inner loop above the threshold where a developer breaks concentration waiting for feedback. Docker Desktop also adds ~1-2 GB of RAM overhead for its GUI VM and abstracts the Docker daemon behind Hyper-V, producing subtle behavioral differences from the Linux-native Docker Engine used in CI.

---

## Actors

- A1. **Developer**: Modifies code, runs tests, runs the MCP server, relies on fast and reliable feedback
- A2. **CI pipeline (GitHub Actions)**: Runs the full test suite in isolated containers; must not be affected by dev environment changes

---

## Key Flows

- F1. **Native dev inner loop**
  - **Trigger:** Developer makes code changes and wants to run or test the MCP server
  - **Actors:** A1
  - **Steps:** Edit source -> `deno run --watch -A --env-file=.env.dev server/index.ts` auto-restarts on save; Postgres is already up via `docker compose up -d`
  - **Outcome:** Server reloads in <1 s, no Docker interaction needed
  - **Covered by:** R1, R2, R5, R7

- F2. **Quick native test loop**
  - **Trigger:** Developer wants to run a single test file quickly
  - **Actors:** A1
  - **Steps:** `deno test --allow-net --allow-env --allow-read tests/search-mmr.test.ts` against the shared dev Postgres
  - **Outcome:** Test executes in seconds, not minutes; shared database means test data may pollute dev data (trade-off accepted)
  - **Covered by:** R4, R7

- F3. **Full isolation test suite**
  - **Trigger:** Developer or CI needs to confirm all tests pass without data pollution
  - **Actors:** A1, A2
  - **Steps:** `docker compose --profile test up -d` (ephemeral db-test + seed + mcp-test) -> `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/`
  - **Outcome:** Full test suite runs in an isolated, ephemeral database; no data persists
  - **Covered by:** R3, R8

---

## Requirements

**Migration and repository layout**
- R1. The repository must live on a WSL2 ext4 filesystem (e.g. `~/projects/ai-memory`), not accessed from the NTFS host
- R2. Docker Engine must run natively inside WSL2, without Docker Desktop. The WSL2 distro must start the Docker daemon on boot or on demand

**Developer environment configuration**
- R3. A gitignored `.env.dev` file must provide `DATABASE_URL` and other environment overrides for native Deno execution. It must be sourced by the dev script and must not affect Docker Compose operation
- R4. A `dev.sh` script must start the Postgres Docker service if not already running, source `.env.dev`, and launch `deno run --watch -A --env-file=.env.dev server/index.ts`
- R5. The frozen lockfile (`deno.json` lock) must remain frozen under normal operation. The setup guide must explain how to temporarily unfreeze, update dependencies, and re-freeze

**Testing**
- R6. Developers must be able to run `deno test` natively against the shared dev Postgres for quick iteration. Test-data pollution is accepted as a trade-off
- R7. The `docker compose --profile test` workflow must remain the authoritative path for full isolation test runs

**Documentation and CI**
- R8. `CLAUDE.md` must document the native WSL2 development workflow (setup, commands, conventions) alongside the existing Docker Compose commands
- R9. CI (GitHub Actions) must continue using the Docker test profile with the frozen lockfile, unchanged by this migration
- R10. A `docs/wsl2-setup.md` guide must document the full one-time setup process: WSL2 distro configuration, Docker Engine install inside WSL2, Deno install, repo clone, `.env.dev` creation, and port-reachability configuration

---

## Acceptance Examples

- AE1. **Covers R1, R2, R8, R10.** A developer follows `docs/wsl2-setup.md`, clones the repo to a WSL2 ext4 path, installs Docker Engine inside WSL2, and produces a working `deno run --watch` against the Dockerized Postgres without Docker Desktop involvement
- AE2. **Covers R3, R5.** `.env.dev` is listed in `.gitignore`, does not appear in `git status` when present, and the frozen lockfile remains unchanged after a fresh `deno install`
- AE3. **Covers R4, R6.** Running `./dev.sh` starts the Postgres service (if down), sources `.env.dev`, and launches the MCP server with hot reload. A subsequent `deno test tests/search-mmr.test.ts --allow-net --allow-env --allow-read` passes natively
- AE4. **Covers R9.** A CI run passes with zero changes to the CI configuration files

---

## Success Criteria

- A developer editing source files sees the MCP server reload in <2 s without any Docker interaction
- The project's CI stays green with zero configuration changes
- A new team member can set up the environment from scratch in <30 minutes using only `docs/wsl2-setup.md` and `CLAUDE.md`
- The frozen lockfile never breaks on a developer's machine; dependency updates are an explicit, documented action

---

## Scope Boundaries

- Migrating Postgres out of Docker into a native PostgreSQL installation is explicitly out of scope (Postgres remains Dockerized)
- Changes to the existing Docker Compose profiles or Dockerfiles are out of scope (the `db` and `mcp` services are unchanged)
- Windows-native development (VS Code without WSL Remote, Docker Desktop, NTFS) remains supported as a fallback but is not the optimized path
- Uninstalling Docker Desktop is left to the developer's discretion; its WSL2 integration must be disabled if it remains installed
- Changes to CI configuration are out of scope (CI stays on the existing Docker test profile with a frozen lockfile)

---

## Key Decisions

- **Deno native, Postgres in Docker**: Fastest Deno inner loop while keeping Postgres containerized for reproducibility. Leverages the existing `db` service and `docker-compose.yml` unchanged
- **`.env.dev` as gitignored override**: Keeps native dev config separate from the Docker Compose env. The existing `.env` file continues to supply Docker Compose variables
- **Mixed test strategy**: Fast native `deno test` against dev Postgres for iteration, Docker test profile for isolation. Data pollution is accepted for the quick loop
- **Frozen lockfile kept frozen**: Defers dep-update friction to explicit manual steps, avoiding silent drift between developer machines and CI
- **Docker Engine inside WSL2, no Docker Desktop**: Eliminates the GUI VM (~1-2 GB RAM overhead), aligns the developer environment with the Linux-native Docker Engine used in CI, and allows inotify to work natively

---

## Dependencies / Assumptions

- WSL2 is available on the developer's Windows machine (Windows 10 build 19041+ or Windows 11)
- Docker Engine is installable inside WSL2 via the standard Linux package manager (apt for Ubuntu/Debian-based distros)
- The Docker Compose plugin is available inside WSL2 (installed alongside Docker Engine or separately)
- Deno 2.x is available for Linux x86_64
- Port forwarding from WSL2 to Windows is configurable via `networkingMode=mirrored` in `.wslconfig` or explicit `netsh` port forwarding rules
- The existing `.env` file continues to supply environment variables to Docker Compose; `.env.dev` overrides only what the native Deno process needs

---

## Outstanding Questions

### Deferred to Planning

- **[Needs research]** Which `.wslconfig` networking mode is required for Windows clients (e.g. VS Code, curl from Windows) to reach the natively running MCP server on port 3000 in WSL2, and what is the minimal configuration to ensure this works without manual port forwarding?
- **[Needs research]** Does the Docker Compose profile test workflow require any path adjustments when run from WSL2 ext4 (e.g. volume mount paths, `.env` file resolution)?
