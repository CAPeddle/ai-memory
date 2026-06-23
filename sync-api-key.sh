#!/usr/bin/env bash
#
# sync-api-key.sh — synchronize repo .env MEMORY_API_KEY to the Windows user
# environment (for VS Code's ${env:MEMORY_API_KEY} expansion) and into the
# gitignored real OpenCode configs (materialized from committed .example
# templates). Idempotent. See
# docs/plans/2026-06-23-002-feat-windows-api-key-sync-plan.md.
#
# Usage:
#   ./sync-api-key.sh        # perform the sync
#   ./sync-api-key.sh --check # read-only: report drift, perform zero writes
#
set -euo pipefail
cd "$(dirname "$0")"

CHECK_MODE=0
if [ "${1:-}" = "--check" ]; then
  CHECK_MODE=1
fi

err()  { echo "ERROR: $*" >&2; }
fail() { err "$*"; echo "See docs/wsl2-setup.md for the full setup guide." >&2; exit 1; }

sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

# --- Repo files --------------------------------------------------------------
ENV_FILE=".env"
ENV_DEV_FILE=".env.dev"
VSCODE_MCP=".vscode/mcp.json"
OPENCODE_FILES=( "opencode-mcp.json" ".opencode/config.json" )
OPENCODE_TEMPLATES=( "opencode-mcp.json.example" ".opencode/config.example.json" )
PLACEHOLDER="YOUR_MEMORY_API_KEY"
RESTART_MARKER="VS_CODE_RESTART_REQUIRED"

# --- Phase 0: read-only preflight (zero side effects) ------------------------
phase0_fail() { fail "$*"; }

[ -f "$ENV_FILE" ] || phase0_fail ".env not found. Copy .env.example to .env and fill in MEMORY_API_KEY."
[ -f "$ENV_DEV_FILE" ] || phase0_fail ".env.dev not found. Copy .env.dev.example to .env.dev and fill in the values."

# Parse MEMORY_API_KEY from .env. Fail loud on multiple lines, empty, or newline.
extract_env_key() {
  local file="$1" count
  count=$(grep -E "^MEMORY_API_KEY=" "$file" | wc -l)
  if [ "$count" -gt 1 ]; then
    phase0_fail "$file has $count MEMORY_API_KEY= lines; expected exactly one."
  fi
  local raw
  raw=$(grep -E "^MEMORY_API_KEY=" "$file" | head -1 | sed 's/^MEMORY_API_KEY=//')
  # Strip a trailing CR (common from Windows-edited .env); auth.ts does exact match.
  raw="${raw%$'\r'}"
  if [ -z "$raw" ]; then
    phase0_fail "$file MEMORY_API_KEY is empty."
  fi
  case "$raw" in
    *$'\n'*|*$'\r'*) phase0_fail "$file MEMORY_API_KEY contains a newline — refusing."; ;;
  esac
  printf '%s' "$raw"
}

TARGET_KEY="$(extract_env_key "$ENV_FILE")"
DEV_KEY="$(extract_env_key "$ENV_DEV_FILE")"

if [ "$(sha "$TARGET_KEY")" != "$(sha "$DEV_KEY")" ]; then
  phase0_fail ".env and .env.dev MEMORY_API_KEY differ. Canonical source is .env
  .env     sha256: $(sha "$TARGET_KEY")
  .env.dev sha256: $(sha "$DEV_KEY")"
fi

# Require powershell.exe (WSL with Windows interop).
if ! command -v powershell.exe >/dev/null 2>&1; then
  phase0_fail "powershell.exe not on PATH. This script requires WSL with Windows interop enabled."
fi

# Require .example templates.
for t in "${OPENCODE_TEMPLATES[@]}"; do
  [ -f "$t" ] || phase0_fail "Template $t not found (expected alongside the real config)."
  if grep -q "$TARGET_KEY" "$t" 2>/dev/null; then
    phase0_fail "Template $t appears to contain a real key, not the $PLACEHOLDER placeholder."
  fi
done

# Acceptance: real OpenCode files must not be tracked by git.
for f in "${OPENCODE_FILES[@]}"; do
  if [ -f "$f" ] && git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    phase0_fail "Real config $f is tracked by git. It should be gitignored; only the .example template is tracked."
  fi
done

# Extract the Bearer token value from an OpenCode config.
extract_opencode_token() {
  local file="$1" auth_line token
  [ -f "$file" ] || { printf ''; return; }
  auth_line=$(grep -E '"Authorization"\s*:' "$file" | head -1 || true)
  # value looks like: "Authorization": "Bearer SOMETHING"  -> pull the SOMETHING
  token=$(printf '%s' "$auth_line" | sed -nE 's/.*"Authorization"\s*:\s*"Bearer[[:space:]]+([^"]*)".*/\1/p')
  printf '%s' "$token"
}

# Classify each real OpenCode file: missing | placeholder | already-target | divergent.
declare -A OC_STATE
for f in "${OPENCODE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    OC_STATE[$f]="missing"
    continue
  fi
  tok="$(extract_opencode_token "$f")"
  if [ -z "$tok" ]; then
    OC_STATE[$f]="divergent"
    err "Cannot extract a Bearer token from $f (malformed Authorization header). Refusing to act."
    phase0_fail "$f has no parseable Authorization Bearer token."
  fi
  if [ "$tok" = "$PLACEHOLDER" ]; then
    OC_STATE[$f]="placeholder"
  elif [ "$(sha "$tok")" = "$(sha "$TARGET_KEY")" ]; then
    OC_STATE[$f]="already-target"
  else
    OC_STATE[$f]="divergent"
    err "$f holds a different non-placeholder key (sha256: $(sha "$tok")). Refusing to clobber."
  fi
done

# Abort if any file diverged.
for f in "${OPENCODE_FILES[@]}"; do
  if [ "${OC_STATE[$f]}" = "divergent" ]; then
    phase0_fail "$f holds a non-placeholder key that differs from .env. Reconcile manually before re-running."
  fi
done

# Verify .vscode/mcp.json carries ${env:MEMORY_API_KEY} inside the Authorization header.
if [ -f "$VSCODE_MCP" ]; then
  vscode_auth_line=$(grep -E '"Authorization"\s*:' "$VSCODE_MCP" | head -1 || true)
  if [ -z "$vscode_auth_line" ]; then
    phase0_fail "$VSCODE_MCP has no Authorization header."
  fi
  if ! printf '%s' "$vscode_auth_line" | grep -q '${env:MEMORY_API_KEY}'; then
    phase0_fail "$VSCODE_MCP Authorization header does not contain \${env:MEMORY_API_KEY}. Manual edit required; script never rewrites this file."
  fi
else
  err "warn: $VSCODE_MCP not found — Windows env will still be synced; create the file from the committed example to use VS Code MCP."
fi

# Compute Windows env drift.
win_current_hash=$(powershell.exe -NoProfile -Command \
  '$v=[Environment]::GetEnvironmentVariable("MEMORY_API_KEY","User"); if (-not $v) { "" } else { $sha=[System.Security.Cryptography.SHA256]::Create(); [System.BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($v))).Replace("-","").ToLower() }' \
  | tr -d '\r')
target_hash=$(sha "$TARGET_KEY")

if [ -n "$win_current_hash" ] && [ "$win_current_hash" = "$target_hash" ]; then
  WINDOWS_STATE="in-sync"
else
  WINDOWS_STATE="out-of-sync"
fi

# --- --check: report and stop ------------------------------------------------
if [ "$CHECK_MODE" = "1" ]; then
  echo "sync-api-key --check (read-only):"
  for f in "${OPENCODE_FILES[@]}"; do
    echo "  $f: ${OC_STATE[$f]}"
  done
  echo "  windows MEMORY_API_KEY: $WINDOWS_STATE"
  drift=0
  if [ "$WINDOWS_STATE" = "out-of-sync" ]; then drift=1; fi
  for f in "${OPENCODE_FILES[@]}"; do
    case "${OC_STATE[$f]}" in placeholder|missing) drift=1;; esac
  done
  if [ "$drift" = "1" ]; then
    echo "drift detected — re-run without --check to apply"
    exit 1
  fi
  echo "all in sync"
  exit 0
fi

# --- Phase 1: repo-local OpenCode files (narrow blast radius) ----------------
# Materialize real files from .example templates; already-target => skip.
# Templates hold a known ${env:MEMORY_API_KEY}-style placeholder too, OR the
# literal "Bearer YOUR_MEMORY_API_KEY" placeholder. Either way, sbut we inject
# the target key into the real file by replacing the placeholder token.
inject_key_into_template() {
  # Reads template from stdin, writes real file to stdout with the Bearer
  # placeholder replaced by the target key. No secret to stdout aside from
  # the file content itself (intended).
  local placeholder_token="$1"
  sed "s/Bearer YOUR_MEMORY_API_KEY/Bearer ${TARGET_KEY}/g"
}

for i in "${!OPENCODE_FILES[@]}"; do
  f="${OPENCODE_FILES[$i]}"
  t="${OPENCODE_TEMPLATES[$i]}"
  state="${OC_STATE[$f]}"
  case "$state" in
    already-target)
      echo "  $f: already-target — skipping (no write)"
      continue
      ;;
    placeholder|missing)
      tmp=$(mktemp)
      inject_key_into_template "$PLACEHOLDER" < "$t" > "$tmp"
      # Verify the temp file actually contains the target key and not the placeholder.
      if ! grep -q "Bearer ${TARGET_KEY}" "$tmp"; then
        rm -f "$tmp"
        fail "Failed to inject target key into $t (template missing the Bearer YOUR_MEMORY_API_KEY placeholder?)."
      fi
      mv -f "$tmp" "$f"
      after=$(grep -E '"Authorization"\s*:' "$f" | sed -nE 's/.*"Bearer[[:space:]]+([^"]*)".*/\1/p')
      if [ "$(sha "$after")" != "$target_hash" ]; then
        fail "Post-write SHA-256 mismatch for $f: expected $target_hash got $(sha "$after")."
      fi
      echo "  $f: $state -> written (LF-normalized, SHA-256 verified)"
      ;;
  esac
done

# --- Phase 2: Windows user env (broad blast radius) -------------------------
windows_changed=0
if [ "$WINDOWS_STATE" = "in-sync" ]; then
  echo "  windows MEMORY_API_KEY: in-sync — no write"
else
  MEMORY_API_KEY_SYNC="$TARGET_KEY" powershell.exe -NoProfile -Command \
    '[Environment]::SetEnvironmentVariable("MEMORY_API_KEY", $env:MEMORY_API_KEY_SYNC, "User")' \
    || fail "powershell.exe SetEnvironmentVariable failed."
  # Read-back verify via a second powershell call.
  win_after_hash=$(powershell.exe -NoProfile -Command \
    '$v=[Environment]::GetEnvironmentVariable("MEMORY_API_KEY","User"); $sha=[System.Security.Cryptography.SHA256]::Create(); [System.BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($v))).Replace("-","").ToLower()' \
    | tr -d '\r')
  if [ "$win_after_hash" != "$target_hash" ]; then
    fail "Windows env write verification failed (read-back SHA-256 mismatch)."
  fi
  windows_changed=1
  echo "  windows MEMORY_API_KEY: updated (SHA-256 read-back verified)"
fi

# --- Phase 3: report ---------------------------------------------------------
echo "sync-api-key: done"
for f in "${OPENCODE_FILES[@]}"; do
  echo "  $f: ${OC_STATE[$f]}"
done
echo "  windows MEMORY_API_KEY: changed=$windows_changed"
if [ "$windows_changed" = "1" ]; then
  echo "$RESTART_MARKER"
  cat <<'BANNER'

*** VS Code must be FULLY RESTARTED (not reloaded) for ${env:MEMORY_API_KEY}
    to pick up the new value. A running VS Code keeps using the old key
    and will return 401 until restarted. ***

BANNER
fi