#!/usr/bin/env bash
#
# tests/sync-api-key.test.sh — lightweight harness for sync-api-key.sh
#
# Drives ./sync-api-key.sh --check and real mode against a fixture tree with a
# stubbed powershell.exe (no Windows required). Exercises the parsing,
# trichotomy classification, drift aggregation, restart-marker gating, and
# sed/grep integrity logic where the bugs live.
#
# Usage:
#   ./tests/sync-api-key.test.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/sync-api-key.sh"

PASS=0
FAIL=0
FAILED_TESTS=()

assert_exit() {
  local label="$1" expected_exit="$2" actual_exit="$3"
  if [ "$actual_exit" = "$expected_exit" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $label (exit $actual_exit)"
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$label")
    echo "  FAIL: $label (expected exit $expected_exit, got $actual_exit)"
  fi
}

assert_contains() {
  local label="$1" hay="$2" needle="$3"
  if printf '%s' "$hay" | grep -qF "$needle"; then
    PASS=$((PASS + 1))
    echo "  PASS: $label (contains '$needle')"
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$label")
    echo "  FAIL: $label (output missing '$needle')"
  fi
}

assert_not_contains() {
  local label="$1" hay="$2" needle="$3"
  if printf '%s' "$hay" | grep -qF "$needle"; then
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$label")
    echo "  FAIL: $label (output should NOT contain '$needle')"
  else
    PASS=$((PASS + 1))
    echo "  PASS: $label (does not contain '$needle')"
  fi
}

# --- Stub powershell.exe -----------------------------------------------------
# Reads/writes a state file to simulate the Windows user env var. Distinguishes
# GetEnvironmentVariable vs SetEnvironmentVariable by inspecting $- commands.
make_stub_powershell() {
  local dir="$1"
  cat > "$dir/powershell.exe" <<'STUB'
#!/usr/bin/env bash
# Stub: simulate Windows powershell.exe for sync-api-key.sh tests.
STATE_FILE="${SYNC_STUB_STATE:-/tmp/sync-api-key-stub-state}"
# The -Command argument is the last positional arg.
cmd=""
for a in "$@"; do
  case "$a" in
    -NoProfile|-Command) ;;
    *) cmd="$a" ;;
  esac
done
if printf '%s' "$cmd" | grep -q 'SetEnvironmentVariable'; then
  # Write: $env:MEMORY_API_KEY_SYNC holds the value (set by the caller)
  printf '%s' "${MEMORY_API_KEY_SYNC:-}" > "$STATE_FILE"
  exit 0
elif printf '%s' "$cmd" | grep -q 'GetEnvironmentVariable'; then
  # Read: output the SHA-256 hash of the stored value, or empty if unset.
  v="$(cat "$STATE_FILE" 2>/dev/null || true)"
  if [ -z "$v" ]; then
    printf ''
  else
    printf '%s' "$v" | sha256sum | cut -d' ' -f1
  fi
  exit 0
else
  echo "stub: unknown command" >&2
  exit 1
fi
STUB
  chmod +x "$dir/powershell.exe"
}

# --- Fixture builder ---------------------------------------------------------
TEST_KEY="a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890"
TEST_KEY_HASH="$(printf '%s' "$TEST_KEY" | sha256sum | cut -d' ' -f1)"
DIVERGENT_KEY="0000000000000000000000000000000000000000000000000000000000000000"

setup_fixture() {
  local fixture="$1"
  local win_state="${2:-}"
  rm -rf "$fixture"
  mkdir -p "$fixture/.opencode" "$fixture/.vscode"
  cp "$SCRIPT" "$fixture/sync-api-key.sh"
  chmod +x "$fixture/sync-api-key.sh"

  # .env and .env.dev with the test key
  printf 'MEMORY_API_KEY=%s\nDB_PASSWORD=testpass\nOPENROUTER_API_KEY=testkey\n' "$TEST_KEY" > "$fixture/.env"
  printf 'DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test\nMEMORY_API_KEY=%s\n' "$TEST_KEY" > "$fixture/.env.dev"

  # .example templates with placeholder
  cat > "$fixture/opencode-mcp.json.example" <<'TPL'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": { "ai-memory": { "type": "remote", "url": "http://localhost:3000/mcp", "enabled": true, "headers": { "Authorization": "Bearer YOUR_MEMORY_API_KEY" } } }
}
TPL
  cat > "$fixture/.opencode/config.example.json" <<'TPL'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": { "ai-memory": { "type": "remote", "url": "http://localhost:3000/mcp", "enabled": true, "headers": { "Authorization": "Bearer YOUR_MEMORY_API_KEY" } } }
}
TPL

  # .vscode/mcp.json with ${env:MEMORY_API_KEY}
  cat > "$fixture/.vscode/mcp.json" <<'TPL'
{
  "servers": { "ai-memory": { "type": "http", "url": "http://127.0.0.1:3000/mcp", "headers": { "Authorization": "Bearer ${env:MEMORY_API_KEY}" } } }
}
TPL

  # Stub powershell.exe
  local stub_dir; stub_dir="$fixture/stubbin"
  mkdir -p "$stub_dir"
  make_stub_powershell "$stub_dir"
  printf '%s' "${win_state}" > "$stub_dir/state"
  export SYNC_STUB_STATE="$stub_dir/state"
}

run_script() {
  local fixture="$1"; shift
  PATH="$fixture/stubbin:$PATH" "$fixture/sync-api-key.sh" "$@" 2>&1 || true
}

run_script_capture_exit() {
  local fixture="$1"; shift
  local out exit_code
  out="$(PATH="$fixture/stubbin:$PATH" "$fixture/sync-api-key.sh" "$@" 2>&1)" && exit_code=0 || exit_code=$?
  printf '%s' "$out"
  printf 'EXIT:%d' "$exit_code"
}

# --- Test scenarios ----------------------------------------------------------

echo "=== Test 1: First sync from placeholders (Windows out-of-sync) ==="
fixture="/tmp/sync-test-fixture-1"
setup_fixture "$fixture" ""  # Windows env unset
result="$(run_script_capture_exit "$fixture")"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "first sync exit 0" 0 "$exit_code"
assert_contains "first sync: opencode-mcp.json written" "$out" "opencode-mcp.json: missing -> written"
assert_contains "first sync: restart marker" "$out" "VS_CODE_RESTART_REQUIRED"
# Verify real files were created
[ -f "$fixture/opencode-mcp.json" ] && assert_contains "real opencode-mcp.json has target key" "$(cat "$fixture/opencode-mcp.json")" "$TEST_KEY" || { FAIL=$((FAIL+1)); echo "  FAIL: real opencode-mcp.json not created"; }

echo ""
echo "=== Test 2: Idempotent re-run (everything in sync) ==="
# Now Windows has the key (stub state was written by test 1's run)
result="$(run_script_capture_exit "$fixture")"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "idempotent re-run exit 0" 0 "$exit_code"
assert_contains "idempotent: already-target skip" "$out" "already-target — skipping"
assert_not_contains "idempotent: no restart marker" "$out" "VS_CODE_RESTART_REQUIRED"

echo ""
echo "=== Test 3: Idempotent --check (all in sync) ==="
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "--check clean exit 0" 0 "$exit_code"
assert_contains "--check: all in sync" "$out" "all in sync"
assert_not_contains "--check clean: no restart marker" "$out" "VS_CODE_RESTART_REQUIRED"

echo ""
echo "=== Test 4: Divergent real key abort ==="
fixture="/tmp/sync-test-fixture-4"
setup_fixture "$fixture" "$TEST_KEY"  # Windows in sync
# Pre-create real opencode-mcp.json with a divergent key
printf '{"mcp": {"ai-memory": {"headers": {"Authorization": "Bearer %s"}}}}\n' "$DIVERGENT_KEY" > "$fixture/opencode-mcp.json"
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "divergent key exit 1" 1 "$exit_code"
assert_contains "divergent: error message" "$out" "non-placeholder"

echo ""
echo "=== Test 5: .env / .env.dev drift ==="
fixture="/tmp/sync-test-fixture-5"
setup_fixture "$fixture" "$TEST_KEY"
printf 'DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test\nMEMORY_API_KEY=%s\n' "$DIVERGENT_KEY" > "$fixture/.env.dev"
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit ".env.dev drift exit 1" 1 "$exit_code"
assert_contains "drift: differ message" "$out" "differ"

echo ""
echo "=== Test 6: --check with drift (placeholder + Windows out-of-sync) ==="
fixture="/tmp/sync-test-fixture-6"
setup_fixture "$fixture" ""  # Windows unset
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "--check drift exit 1" 1 "$exit_code"
assert_contains "--check drift: drift detected" "$out" "drift detected"
assert_not_contains "--check drift: no marker" "$out" "VS_CODE_RESTART_REQUIRED"
# Verify no real files were written (zero writes)
[ ! -f "$fixture/opencode-mcp.json" ] && { PASS=$((PASS+1)); echo "  PASS: --check wrote no real opencode-mcp.json"; } || { FAIL=$((FAIL+1)); echo "  FAIL: --check wrote a real file"; }

echo ""
echo "=== Test 7: Empty MEMORY_API_KEY ==="
fixture="/tmp/sync-test-fixture-7"
setup_fixture "$fixture" "$TEST_KEY"
printf 'MEMORY_API_KEY=\nDB_PASSWORD=testpass\n' > "$fixture/.env"
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "empty key exit 1" 1 "$exit_code"
assert_contains "empty key: error" "$out" "empty"

echo ""
echo "=== Test 8: .vscode/mcp.json token absent ==="
fixture="/tmp/sync-test-fixture-8"
setup_fixture "$fixture" "$TEST_KEY"
# Pre-create real files (already-target) so we get past the opencode checks
printf '{"mcp": {"ai-memory": {"headers": {"Authorization": "Bearer %s"}}}}\n' "$TEST_KEY" > "$fixture/opencode-mcp.json"
mkdir -p "$fixture/.opencode"
printf '{"mcp": {"ai-memory": {"headers": {"Authorization": "Bearer %s"}}}}\n' "$TEST_KEY" > "$fixture/.opencode/config.json"
# Corrupt .vscode/mcp.json — replace ${env:} with a hardcoded key
cat > "$fixture/.vscode/mcp.json" <<'TPL'
{
  "servers": { "ai-memory": { "type": "http", "url": "http://127.0.0.1:3000/mcp", "headers": { "Authorization": "Bearer hardcoded-key-not-env-ref" } } }
}
TPL
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "vscode token absent exit 1" 1 "$exit_code"
assert_contains "vscode: env ref missing message" "$out" "does not contain"

echo ""
echo "=== Test 9: Key-never-printed invariant ==="
fixture="/tmp/sync-test-fixture-9"
setup_fixture "$fixture" ""  # Windows unset
out="$(run_script "$fixture" 2>&1)"
# The raw 64-char hex key must NOT appear in stdout
if printf '%s' "$out" | grep -qF "$TEST_KEY"; then
  FAIL=$((FAIL + 1)); FAILED_TESTS+=("key-never-printed")
  echo "  FAIL: raw key leaked to stdout"
else
  PASS=$((PASS + 1))
  echo "  PASS: key-never-printed (key not in stdout)"
fi

echo ""
echo "=== Test 10: Non-hex key rejected by the hex guard ==="
fixture="/tmp/sync-test-fixture-10"
setup_fixture "$fixture" "$TEST_KEY"
printf 'MEMORY_API_KEY=key-with-slash/and-amp\nDB_PASSWORD=testpass\n' > "$fixture/.env"
printf 'MEMORY_API_KEY=key-with-slash/and-amp\n' > "$fixture/.env.dev"
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "non-hex key exit 1" 1 "$exit_code"
assert_contains "non-hex: hex guard message" "$out" "must be hex"

echo ""
echo "=== Test 11: Multiple MEMORY_API_KEY lines ==="
fixture="/tmp/sync-test-fixture-11"
setup_fixture "$fixture" "$TEST_KEY"
printf 'MEMORY_API_KEY=%s\nMEMORY_API_KEY=%s\n' "$TEST_KEY" "$DIVERGENT_KEY" > "$fixture/.env"
printf 'MEMORY_API_KEY=%s\n' "$TEST_KEY" > "$fixture/.env.dev"
result="$(run_script_capture_exit "$fixture" --check)"
exit_code="${result##*EXIT:}"; out="${result%EXIT:*}"
assert_exit "multi-line key exit 1" 1 "$exit_code"
assert_contains "multi-line: message" "$out" "lines"

echo ""
echo "=== Test 12: powershell.exe unavailable ==="
fixture="/tmp/sync-test-fixture-12"
setup_fixture "$fixture" "$TEST_KEY"
# Run WITHOUT the stub on PATH — powershell.exe not found
result="$(cd "$fixture" && PATH="/usr/bin:/bin" ./sync-api-key.sh --check 2>&1)" && exit_code=0 || exit_code=$?
assert_exit "no powershell exit 1" 1 "$exit_code"
assert_contains "no powershell: message" "$result" "powershell.exe not on PATH"

# --- Summary ----------------------------------------------------------------
echo ""
echo "==================================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do echo "  - $t"; done
  exit 1
fi
echo "All tests passed."
exit 0