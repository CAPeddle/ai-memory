# WSL2 Development Setup for ai-memory

This guide walks through setting up a WSL2-native development environment for the
ai-memory MCP server. The repository lives on WSL2 ext4, Docker Engine runs
natively inside WSL2 (no Docker Desktop), and Deno executes natively with hot
reload against a Dockerized Postgres.

## Prerequisites

- Windows 10 build 19041+ or Windows 11
- WSL2 feature enabled (`wsl --install` or via "Windows Features")
- Hardware virtualisation enabled in BIOS
- Git for Windows (or Git inside WSL2)

---

## 1. Install WSL2 and Ubuntu

```powershell
# Run in PowerShell as Administrator

# Install WSL2 with the default Ubuntu distribution
wsl --install

# Restart your machine when prompted, then continue

# After restart, verify WSL2 mode:
wsl --version
# Expected output shows version 2.x.x.x

# If the output shows version 1, upgrade the default distro:
wsl --set-default-version 2

# Launch Ubuntu (sets up your Linux user account):
wsl
```

---

## 2. Install Docker Engine inside WSL2 (no Docker Desktop)

Docker Engine runs natively inside WSL2. If you have Docker Desktop installed,
disable its WSL2 integration after completing this step (see section 12).

Run the following **inside your WSL2 Ubuntu terminal**:

```bash
# Add Docker's official GPG key and repository
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# Install Docker Engine and Compose plugin
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group (avoids needing sudo for every command)
sudo usermod -aG docker $USER

# Enable the Docker daemon to start on boot
sudo systemctl enable docker

# Start Docker now
sudo systemctl start docker

# Verify Docker is working
docker --version
docker compose version

# Verify you can run docker without sudo (may need to log out and back in)

# If the docker group membership hasn't taken effect yet, start a new shell:
exec $SHELL -l
```

---

## 3. Install Deno 2.x

```bash
# Inside your WSL2 Ubuntu terminal
curl -fsSL https://deno.land/install.sh | sh

# Add Deno to your PATH (~/.bashrc or ~/.zshrc)
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify the installation
deno --version
# Expected: deno 2.x.x
```

---

## 4. Clone the repository

Clone to a WSL2 ext4 path (e.g. `~/projects/ai-memory`). **Do not clone to
`/mnt/c/...`** — NTFS cross-filesystem access is 5-20x slower and `deno run --watch`
cannot detect file changes reliably across the WSL2-Windows mount boundary.

```bash
git clone <repository-url> ~/projects/ai-memory
cd ~/projects/ai-memory
```

---

## 5. Create the `.env` file (for Docker Compose)

```bash
cp .env.example .env
```

Edit `.env` and fill in the three required variables:

```bash
MEMORY_API_KEY=<your-api-key>
DB_PASSWORD=<your-db-password>
OPENROUTER_API_KEY=<your-openrouter-key>
```

The `.env` file is used by Docker Compose to configure the Postgres and MCP
containers. It is gitignored via `.gitignore`.

---

## 6. Create the `.env.dev` file (for native Deno)

```bash
cp .env.dev.example .env.dev
```

Edit `.env.dev` and fill in the values. The `DB_PASSWORD` **must match** the
password you set in `.env`:

```
DATABASE_URL=postgresql://ai_memory:<DB_PASSWORD>@127.0.0.1:5432/ai_memory
MEMORY_API_KEY=<same as .env>
OPENROUTER_API_KEY=<same as .env>
```

> **Why `127.0.0.1` instead of `localhost`?** On some Windows hosts, VS Code
> resolves `localhost` to the IPv6 loopback (`::1`) while the server only binds
> to IPv4. Pinning `127.0.0.1` avoids this MCP connectivity issue.

The `.env.dev` file is gitignored via the `.env.*` pattern.

---

## 7. Start the development environment

### Option A: Using `dev.sh` (recommended)

```bash
./dev.sh
```

This starts the Postgres Docker service if it is not already running, sources
`.env.dev`, and launches the Deno MCP server with hot reload. Edit any source
file in `server/` and the server reloads automatically.

### Option B: Manual start

```bash
# Start Postgres
docker compose up -d db

# Start the MCP server natively
deno run --watch --allow-net --allow-env --allow-read --env-file=.env.dev server/index.ts
```

---

## 8. Verify the setup

```bash
# Health check
curl http://127.0.0.1:3000/health
# Expected: {"status":"ok"}

# Quick native test
deno test --frozen --allow-net --allow-env --allow-read server/tests/search-mmr.test.ts

# Full isolation test suite (Docker test profile)
docker compose --profile test up -d
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/

# Stop the test profile (wipes ephemeral databases)
docker compose --profile test down
```

---

## 9. Windows port reachability

To access the natively running MCP server (port 3000) from Windows applications
such as VS Code, `curl.exe`, or the MCP client:

### Windows 11 22H2+ (recommended): mirrored networking

Create or edit `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Then restart WSL2:

```powershell
wsl --shutdown
```

After restarting your WSL2 terminal, verify the mode:

```bash
wslinfo --networking-mode
# Expected: mirrored
```

With mirrored networking, `127.0.0.1:3000` is transparently reachable from
Windows without any port forwarding configuration.

> If you encounter issues with Docker container port publishing under mirrored
> mode, add `ignoredPorts` under `[experimental]` in `.wslconfig`:
>
> ```ini
> [experimental]
> ignoredPorts=3000,3001,5432
> ```

### Windows 10 or fallback: NAT mode

The default WSL2 NAT mode already forwards `localhost:3000` to WSL2 when
`localhostForwarding=true` (which is the default). No `.wslconfig` changes
are needed.

```powershell
# On Windows PowerShell or cmd:
curl http://127.0.0.1:3000/health
```

> Always use `127.0.0.1` instead of `localhost` in Windows clients to avoid
> the IPv6 resolution issue described in section 6.

---

## 10. Lockfile hygiene

The `server/deno.json` file sets `"frozen": true`, which means `deno run` and
`deno test` will refuse to proceed if `server/deno.lock` is out of date. This
prevents accidental drift between your machine and CI.

**Under normal operation**, the frozen lockfile requires no action. Dependency
management is an explicit, intentional step:

### Updating dependencies

After adding or changing imports in the codebase, update the lockfile by running
this command inside the `mcp-test` container (the same approach used in CI):

```bash
docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts
```

Commit the updated `server/deno.lock` as part of the same change that introduced
the dependency update.

---

## 11. VS Code configuration

If you use VS Code, install the **Remote - WSL** extension and open the
repository from within WSL2:

```powershell
# From Windows PowerShell:
wsl -- cd ~/projects/ai-memory && code .
```

The MCP server port (3000) is accessible from the Windows VS Code instance
via `127.0.0.1:3000` (mirrored networking) or `localhost:3000` (NAT mode).

### VS Code MCP configuration

If your VS Code workspace has an MCP client configuration (`.vscode/mcp.json`
or settings.json), ensure the server URL uses `127.0.0.1` instead of `localhost`:

```json
{
  "servers": {
    "ai-memory": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

> Using `127.0.0.1` avoids the IPv6 resolution issue where VS Code resolves
> `localhost` to `::1` while the server only binds to IPv4.

---

## 12. If Docker Desktop is still installed

If Docker Desktop remains on your machine, disable its WSL2 integration so the
native Docker Engine inside WSL2 takes over:

1. Open Docker Desktop → Settings → Resources → WSL Integration
2. Uncheck the Ubuntu distribution (or whichever distro you configured)
3. Apply & Restart

This prevents Docker Desktop from taking ownership of the Docker socket inside
WSL2 and conflicting with the native Docker Engine daemon.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `docker: command not found` | Docker Engine not installed or not in PATH | Run `sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin` |
| `permission denied` on Docker commands | User not in `docker` group | Run `sudo usermod -aG docker $USER && exec $SHELL -l` |
| `deno: command not found` | Deno not in PATH | Run `export PATH="$HOME/.deno/bin:$PATH"` and add to `~/.bashrc` |
| `dev.sh: line X: docker: command not found` | Docker daemon not running | Run `sudo systemctl start docker` |
| `Connection refused` on `127.0.0.1:3000` | MCP server not started | Run `./dev.sh` and check for errors |
| `Connection refused` on `127.0.0.1:5432` | Postgres container not running | Run `docker compose up -d db` |
| `Lockfile is not up to date` in native Deno | Lockfile has drifted | Run `docker compose --profile test exec mcp-test deno cache --lock=deno.lock --lock-write tests/**/*.ts src/**/*.ts index.ts` |
| VS Code cannot reach MCP server from Windows | Port forwarding not configured | Follow section 9 to set up mirrored networking or verify NAT forwarding |
