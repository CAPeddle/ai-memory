#!/usr/bin/env bash
#
# tests/story-id.test.sh — harness for ./story-id.sh
#
# Builds throwaway git repositories under a temp directory and drives the
# allocator against them. Nothing here touches this checkout: the fixture is a
# fresh `git init` with a three-line registry and a three-entry board, and
# story-id.sh is copied into it (the script resolves its paths from its own
# location, so a copy is a complete installation).
#
# The case that matters most is "second branch is refused at MINT time" — a
# merge conflict alone is only the backstop for someone who bypassed the tool.
#
# Usage:
#   ./tests/story-id.test.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."
SCRIPT="$(pwd)/story-id.sh"

PASS=0
FAIL=0
FAILED_TESTS=()

assert_exit() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1)); echo "  PASS: $label (exit $actual)"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS+=("$label")
    echo "  FAIL: $label (expected exit $expected, got $actual)"
  fi
}

assert_contains() {
  local label="$1" hay="$2" needle="$3"
  if printf '%s' "$hay" | grep -qF "$needle"; then
    PASS=$((PASS + 1)); echo "  PASS: $label (contains '$needle')"
  else
    FAIL=$((FAIL + 1)); FAILED_TESTS+=("$label")
    echo "  FAIL: $label (output missing '$needle')"
    printf '%s\n' "$hay" | sed 's/^/        | /'
  fi
}

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

# --- Fixture -----------------------------------------------------------------
# A minimal repo the allocator can run in: registry seeded ST-001..ST-003, a
# board carrying the same three, and story-id.sh installed at the root.
make_fixture() {
  local dir="$TMPROOT/$1"
  mkdir -p "$dir/.github/planning" "$dir/docs/plans"
  cp "$SCRIPT" "$dir/story-id.sh"

  cat > "$dir/.github/planning/story-ids.md" <<'REG'
# Story ID allocator (fixture)

## Allocations

ST-001  2026-01-01  branch:main  fixture
ST-002  2026-01-01  branch:main  fixture
ST-003  2026-01-01  branch:main  fixture
REG

  cat > "$dir/.github/planning/story-board.md" <<'BOARD'
# Story board (fixture)

### ST-001: one
### ST-002: two
### ST-003: three
BOARD

  git -C "$dir" init -q -b main
  git -C "$dir" add -A
  git -C "$dir" -c user.email=t@example.com -c user.name=t commit -q -m "fixture"
  echo "$dir"
}

run() { # run <dir> <args...> -> prints combined output, sets RC
  local dir="$1"; shift
  set +e
  OUT="$(cd "$dir" && ./story-id.sh "$@" 2>&1)"
  RC=$?
  set -e
}

echo "=== --check: a clean registry passes ==="
D="$(make_fixture clean)"
run "$D" --check
assert_exit "clean registry" 0 "$RC"
assert_contains "reports the range" "$OUT" "ST-001..ST-003"

echo "=== --check: a duplicate allocation is a hard failure ==="
D="$(make_fixture dup)"
printf 'ST-003  2026-01-02  branch:rogue  hand-added duplicate\n' >> "$D/.github/planning/story-ids.md"
run "$D" --check
assert_exit "duplicate id" 2 "$RC"
assert_contains "names the duplicate" "$OUT" "duplicate allocation"

echo "=== --check: a malformed line is a failure ==="
D="$(make_fixture malformed)"
printf 'ST-004 missing-columns\n' >> "$D/.github/planning/story-ids.md"
run "$D" --check
assert_exit "malformed line" 2 "$RC"
assert_contains "names the malformed line" "$OUT" "malformed allocation line"

echo "=== --check: a board entry with no allocation is a failure ==="
D="$(make_fixture uncovered)"
printf '\n### ST-004: unallocated\n' >> "$D/.github/planning/story-board.md"
run "$D" --check
assert_exit "board id not allocated" 2 "$RC"
assert_contains "names the uncovered id" "$OUT" "ST-004"

echo "=== --check: a board entry that exists ONLY on an unmerged branch still counts ==="
D="$(make_fixture branchonly)"
git -C "$D" checkout -q -b other
printf '\n### ST-004: only on this branch\n' >> "$D/.github/planning/story-board.md"
git -C "$D" add -A
git -C "$D" -c user.email=t@example.com -c user.name=t commit -q -m "board entry on a branch"
git -C "$D" checkout -q main
run "$D" --check
assert_exit "branch-only board id is caught from main" 2 "$RC"
assert_contains "names the branch-only id" "$OUT" "ST-004"

echo "=== --mint: takes the next unused id and appends one line ==="
D="$(make_fixture mint)"
run "$D" --mint "a purpose"
assert_exit "mint succeeds" 0 "$RC"
assert_contains "mints ST-004" "$OUT" "ST-004"
assert_contains "warns it is provisional" "$OUT" "PROVISIONAL until"
assert_contains "appended to the registry" "$(tail -1 "$D/.github/planning/story-ids.md")" "ST-004"

echo "=== --mint --id: a second branch is REFUSED AT MINT TIME, before any merge ==="
D="$(make_fixture provisional)"
git -C "$D" checkout -q -b X
(cd "$D" && ./story-id.sh --mint "branch X work" >/dev/null)
git -C "$D" add -A
git -C "$D" -c user.email=t@example.com -c user.name=t commit -q -m "allocate ST-004"
git -C "$D" checkout -q -b Y main          # Y branches from main: X is NOT merged
run "$D" --mint --id ST-004 "branch Y work"
assert_exit "duplicate id refused at mint" 3 "$RC"
assert_contains "names the claiming ref" "$OUT" "refs/heads/X"
assert_contains "says it is provisional" "$OUT" "PROVISIONAL"
assert_contains "offers the next free id" "$OUT" "ST-005"

echo "=== --mint: a plain mint on Y skips the id provisional on X ==="
run "$D" --mint "branch Y work"
assert_exit "plain mint succeeds on Y" 0 "$RC"
assert_contains "skips to ST-005" "$OUT" "ST-005"

echo "=== --mint --id: an id already settled on main is refused, and says so ==="
D="$(make_fixture settled)"
git -C "$D" checkout -q -b Z
run "$D" --mint --id ST-002 "re-use a shipped id"
assert_exit "settled id refused" 3 "$RC"
assert_contains "distinguishes settled from provisional" "$OUT" "settled"

echo "=== --mint --id: an unused id that is not the next one is refused ==="
D="$(make_fixture nonnext)"
run "$D" --mint --id ST-009 "skip ahead"
assert_exit "non-next id refused" 4 "$RC"
assert_contains "explains why" "$OUT" "not the next unused ID"

echo "=== bypassing the tool: two hand-appends collide as a MERGE CONFLICT ==="
D="$(make_fixture conflict)"
git -C "$D" checkout -q -b X
printf 'ST-004  2026-01-02  branch:X  hand-appended, bypassing story-id.sh\n' >> "$D/.github/planning/story-ids.md"
git -C "$D" add -A
git -C "$D" -c user.email=t@example.com -c user.name=t commit -q -m "X allocates ST-004"
git -C "$D" checkout -q -b Y main
printf 'ST-004  2026-01-02  branch:Y  hand-appended, bypassing story-id.sh\n' >> "$D/.github/planning/story-ids.md"
git -C "$D" add -A
git -C "$D" -c user.email=t@example.com -c user.name=t commit -q -m "Y allocates ST-004"
set +e
MERGE_OUT="$(git -C "$D" -c user.email=t@example.com -c user.name=t merge X 2>&1)"
MERGE_RC=$?
set -e
assert_exit "merge fails" 1 "$MERGE_RC"
assert_contains "conflict is in the registry" "$MERGE_OUT" "CONFLICT"
assert_contains "conflict markers present" "$(cat "$D/.github/planning/story-ids.md")" "<<<<<<<"
git -C "$D" merge --abort

echo
echo "=== a hostile refname is DATA, never program text ==="
D="$(make_fixture hostile)"
PROBE=/tmp/story-id-injection-probe.$$
rm -f "$PROBE"
# Git permits ; | # in a refname. If any of them reaches a sed/eval program,
# GNU sed's `e` flag executes the pattern space as a shell command.
# Git forbids spaces in a refname but permits ; | # > — so the payload is space-free.
HOSTILE='hostile;id>'"$PROBE"'|e;#'
git -C "$D" branch "$HOSTILE" main 2>/dev/null || git -C "$D" checkout -q -b "$HOSTILE" main
git -C "$D" checkout -q main
set +e
OUT="$(cd "$D" && ./story-id.sh --check 2>&1)"
RC=$?
set -e
assert_exit "hostile refname does not break --check" 0 "$RC"
EXECUTED=no
if [ -e "$PROBE" ]; then EXECUTED=yes; rm -f "$PROBE"; fi
assert_contains "a hostile refname executes nothing" "executed:$EXECUTED" "executed:no"
assert_contains "the hostile ref's allocations are still counted" "$OUT" "ST-001..ST-003"

echo
echo "================================"
echo "PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -ne 0 ]; then
  printf '  failed: %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
