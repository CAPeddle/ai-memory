#!/usr/bin/env bash
#
# story-id.sh — mint and verify ST-NNN story identifiers.
#
# The authoritative set of allocated story IDs is the union of the ST-NNN lines
# in .github/planning/story-ids.md across EVERY ref (local branches,
# remote-tracking branches, and the working tree). The only operation that
# writes to that set is the mint append performed by this script.
#
# Identity is never derived from the story board, from docs/plans/, or from
# commit trailers — those record delivery, the registry records allocation.
#
# Allocation is provisional until its line reaches main: an ID minted on a
# branch may not be used anywhere else until that branch is merged. This script
# enforces that at MINT time by scanning every ref, so a second branch is
# refused when it asks for an ID another branch has already claimed — rather
# than both branches working under the same ID until a merge conflict finally
# surfaces it.
#
# Usage:
#   ./story-id.sh --mint "short purpose"           # allocate the next unused ID
#   ./story-id.sh --mint --id ST-NNN "purpose"     # ask for a specific ID
#   ./story-id.sh --check                          # read-only: integrity + coverage
#   ./story-id.sh --list                           # read-only: dump the authoritative set
#
# Exit codes:
#   0  success
#   1  usage error
#   2  --check found a problem
#   3  --mint refused: the requested ID is already allocated
#   4  --mint refused: the requested ID is not the next unused ID
#
set -euo pipefail
cd "$(dirname "$0")"

REGISTRY=".github/planning/story-ids.md"
BOARD=".github/planning/story-board.md"

err()  { echo "ERROR: $*" >&2; }
note() { echo "$*"; }

usage() {
  sed -n '/^# Usage:/,/^#$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# --- Parsing -----------------------------------------------------------------
# An allocation line is exactly: ST-NNN  YYYY-MM-DD  branch:<name>  <purpose>
ALLOC_BODY='ST-[0-9]{3}[[:space:]]{2}[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]{2}[^[:space:]]+[[:space:]]{2}.+$'
ALLOC_RE="^${ALLOC_BODY}"

# ids_in <file-or-stdin-stream>: emit the ST-NNN of every allocation line.
ids_in() { grep -E "$ALLOC_RE" | grep -oE '^ST-[0-9]{3}'; }
# lines_in: the WHOLE allocation line, not just its id. A cross-ref duplicate is only
# visible here: two branches that legitimately carry one allocation carry the same
# bytes, while two that each minted the id independently differ in their branch column.
lines_in() { grep -E "$ALLOC_RE"; }

# refs_with_registry: every ref whose tree contains the registry.
refs_with_registry() {
  git for-each-ref --format='%(refname)' refs/heads refs/remotes 2>/dev/null || true
}

# taken_map: emit "<ID> <SOURCE>" for every allocation visible anywhere.
# SOURCE is "worktree" or a refname. A ref that lacks the registry is skipped,
# not treated as an error — a shallow single-ref CI checkout is normal.
taken_map() {
  if [ -f "$REGISTRY" ]; then
    ids_in < "$REGISTRY" | sed 's/$/ worktree/'
  fi
  local ref
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    # The refname is bound as an awk VARIABLE, never spliced into program text.
    # Git permits ; | # > in a refname, and interpolating one into a sed program
    # let GNU sed's `e` flag execute it as a shell command — proven, then fixed.
    git show "$ref:$REGISTRY" 2>/dev/null | ids_in | awk -v r="$ref" '{ print $0 " " r }' || true
  done < <(refs_with_registry)
}

# taken_lines: "<ID>\t<WHOLE LINE>" for every allocation visible on any ref. The id
# alone cannot distinguish propagation from collision; the line can.
taken_lines() {
  if [ -f "$REGISTRY" ]; then
    lines_in < "$REGISTRY" | awk '{ print $1 "\t" $0 }'
  fi
  local ref
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    git show "$ref:$REGISTRY" 2>/dev/null | lines_in | awk '{ print $1 "\t" $0 }' || true
  done < <(refs_with_registry)
}

# settled_ids: IDs whose allocator line has reached main (or origin/main).
settled_ids() {
  local ref
  for ref in refs/heads/main refs/remotes/origin/main; do
    git show "$ref:$REGISTRY" 2>/dev/null | ids_in || true
  done
}

num_of() { echo "${1#ST-}" | sed 's/^0*//;s/^$/0/'; }
id_of()  { printf 'ST-%03d' "$1"; }

# --- --list ------------------------------------------------------------------
cmd_list() {
  taken_map | sort -u
}

# --- --check -----------------------------------------------------------------
# Registry integrity plus coverage. Deliberately does NOT scan commit trailers:
# that would be the derivation KTD-A2 bars.
cmd_check() {
  local problems=0

  if [ ! -f "$REGISTRY" ]; then
    err "$REGISTRY does not exist."
    return 2
  fi

  # 1. Every non-blank, non-prose line that looks like an allocation must parse.
  local bad
  bad="$(grep -nE '^ST-[0-9]' "$REGISTRY" | grep -vE "^[0-9]+:$ALLOC_BODY" || true)"
  if [ -n "$bad" ]; then
    err "malformed allocation line(s) in $REGISTRY:"
    echo "$bad" >&2
    problems=$((problems + 1))
  fi

  # 2. No duplicate IDs, and the file starts at ST-001. Duplicates are a HARD
  #    error: they are the failure the allocator exists to prevent.
  local dups
  dups="$(ids_in < "$REGISTRY" | sort | uniq -d || true)"
  if [ -n "$dups" ]; then
    err "duplicate allocation(s) in $REGISTRY:"
    echo "$dups" >&2
    problems=$((problems + 1))
  fi

  # 2b. The SAME id allocated differently on two refs. This is the failure the
  #     intra-file check above cannot see and the one CI is uniquely placed to
  #     catch, because CI is where every branch is visible at once. --mint can only
  #     refuse what its own clone can see, so a developer who has not fetched mints
  #     a live id without being told. Byte-identical lines across refs are ordinary
  #     propagation; differing lines mean two branches each believe they own the id,
  #     and `git log --grep` would resolve it to two unrelated stories.
  # The key is the identity columns only — id, date, branch — never the trailing
  # free text. Two branches that each minted the id differ in the branch column; an
  # editor who merely annotates an existing line does not, and must not be accused of
  # a collision for it. (ST-095's own line was annotated exactly that way.)
  local cross
  cross="$(taken_lines | awk -F'\t' '{ n = split($2, f, /[ \t]+/); print $1 "\t" f[1] " " f[2] " " f[3] }' \
    | sort -u | cut -f1 | uniq -d || true)"
  if [ -n "$cross" ]; then
    err "the same ID is allocated differently on more than one ref:"
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      printf '  %s\n' "$id" >&2
      taken_lines | sort -u | awk -F'\t' -v want="$id" '$1 == want { print "    " $2 }' >&2
    done <<< "$cross"
    problems=$((problems + 1))
  fi

  local first highest
  first="$(ids_in < "$REGISTRY" | head -1)"
  highest="$(ids_in < "$REGISTRY" | sort -u | tail -1)"
  if [ -z "$first" ]; then
    err "$REGISTRY contains no allocation lines."
    return 2
  fi
  if [ "$first" != "ST-001" ]; then
    err "$REGISTRY starts at $first, not ST-001. Lines are append-only and are never removed."
    problems=$((problems + 1))
  fi

  note "registry: $(ids_in < "$REGISTRY" | sort -u | wc -l) allocations, $first..$highest"

  # 3. Ordering and gaps are ADVISORY, not failures. Two branches minting
  #    concurrently legitimately produce a gap (branch Y holds ST-099 while
  #    ST-098 is still provisional on branch X), and merging them in either
  #    order can leave the lines out of sequence. Neither risks a duplicate,
  #    because --mint takes max(all refs) + 1 and refuses a non-next --id.
  #    A gap that NO ref explains is still worth saying out loud.
  local n prev=0 gap_ref map_snapshot
  map_snapshot="$(taken_map | sort -u)"
  while IFS= read -r id; do
    n="$(num_of "$id")"
    if [ "$n" -lt "$prev" ]; then
      note "note: $id appears after $(id_of "$prev") — out of sequence (a concurrent-mint merge). Not a duplicate; not a failure."
    fi
    while [ "$prev" -ne 0 ] && [ $((prev + 1)) -lt "$n" ]; do
      prev=$((prev + 1))
      gap_ref="$(echo "$map_snapshot" | grep -m1 "^$(id_of "$prev") " | cut -d' ' -f2 || true)"
      if [ -n "$gap_ref" ]; then
        note "note: $(id_of "$prev") is absent here but allocated on $gap_ref — provisional elsewhere, as designed."
      else
        note "note: $(id_of "$prev") is allocated on no ref. It was skipped, not reserved; --mint will never re-issue it."
      fi
    done
    [ "$n" -gt "$prev" ] && prev="$n"
  done < <(ids_in < "$REGISTRY")

  # 4. Coverage — every ST-NNN carrying a board entry, on ANY ref, must be
  #    allocated. This is a coverage assertion, not a source of identity.
  # The union, not the worktree alone — board_ids below gathers across every ref, and
  # comparing an all-refs left side against a one-ref right side reports a branch's own
  # freshly-filed board entry as unallocated when its allocator line is sitting on that
  # same branch. CI runs --check from main, where that is the ordinary state of any
  # unmerged story.
  local registry_ids ref board_ids missing
  registry_ids="$(taken_map | grep -oE '^ST-[0-9]{3}' | sort -u)"

  board_ids="$(
    { [ -f "$BOARD" ] && grep -oE '^### ST-[0-9]{3}' "$BOARD" | grep -oE 'ST-[0-9]{3}' || true
      while IFS= read -r ref; do
        [ -n "$ref" ] || continue
        git show "$ref:$BOARD" 2>/dev/null | grep -oE '^### ST-[0-9]{3}' | grep -oE 'ST-[0-9]{3}' || true
      done < <(refs_with_registry)
    } | sort -u
  )"

  missing="$(comm -23 <(echo "$board_ids") <(echo "$registry_ids") | grep -E '^ST-' || true)"
  if [ -n "$missing" ]; then
    err "board entries with no allocation in $REGISTRY:"
    echo "$missing" >&2
    problems=$((problems + 1))
  else
    note "coverage: every board entry across $(refs_with_registry | wc -l) ref(s) is allocated"
  fi

  # 5. Coverage — every `story:` in docs/plans/ frontmatter must be allocated.
  local plan_ids
  plan_ids="$(grep -hoE '^story:[[:space:]]*ST-[0-9]{3}' docs/plans/*.md 2>/dev/null \
              | grep -oE 'ST-[0-9]{3}' | sort -u || true)"
  if [ -n "$plan_ids" ]; then
    missing="$(comm -23 <(echo "$plan_ids") <(echo "$registry_ids") | grep -E '^ST-' || true)"
    if [ -n "$missing" ]; then
      err "docs/plans/ story: frontmatter with no allocation in $REGISTRY:"
      echo "$missing" >&2
      problems=$((problems + 1))
    else
      note "coverage: every docs/plans/ story: frontmatter ID is allocated"
    fi
  fi

  if [ "$problems" -ne 0 ]; then
    err "$problems problem(s) found."
    return 2
  fi
  note "OK"
  return 0
}

# --- --mint ------------------------------------------------------------------
cmd_mint() {
  local requested="" purpose=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --id) requested="${2:-}"; shift 2 || usage ;;
      *)    purpose="$1"; shift ;;
    esac
  done
  [ -n "$purpose" ] || { err "a short purpose is required."; usage; }
  [ -f "$REGISTRY" ] || { err "$REGISTRY does not exist."; exit 1; }

  if [ -n "$requested" ] && ! echo "$requested" | grep -qE '^ST-[0-9]{3}$'; then
    err "--id must look like ST-NNN, got '$requested'."
    exit 1
  fi

  local map settled highest
  map="$(taken_map | sort -u)"
  settled="$(settled_ids | sort -u)"
  highest="$(echo "$map" | grep -oE '^ST-[0-9]{3}' | sort -u | tail -1)"
  [ -n "$highest" ] || { err "no allocations found — the registry looks empty."; exit 1; }

  local next=$(( $(num_of "$highest") + 1 ))
  local id="${requested:-$(id_of "$next")}"

  # Refuse a claimed ID, at MINT time, naming where the claim lives and whether
  # it has reached main. This is the provisional-until-merged rule enforced.
  local claims
  claims="$(echo "$map" | awk -v id="$id" '$1 == id { print $2 }')"
  if [ -n "$claims" ]; then
    err "$id is already allocated. Refusing to mint a duplicate."
    local c
    while IFS= read -r c; do
      if echo "$settled" | grep -qx "$id"; then
        echo "         claimed by: $c  (settled — its allocator line is on main)" >&2
      else
        echo "         claimed by: $c  (PROVISIONAL — not yet merged to main)" >&2
      fi
    done <<< "$claims"
    echo "         Next unused ID is $(id_of "$next"). Re-run without --id to take it." >&2
    exit 3
  fi

  if [ "$(num_of "$id")" -ne "$next" ]; then
    err "$id is not the next unused ID ($(id_of "$next")). The registry is append-only and contiguous; a gap would let an ID be handed out twice."
    exit 4
  fi

  local branch today line
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
  today="$(date +%Y-%m-%d)"
  line="$id  $today  branch:$branch  $purpose"
  printf '%s\n' "$line" >> "$REGISTRY"

  # Read back: exactly one line for this ID, and it is the last line.
  local count
  count="$(ids_in < "$REGISTRY" | grep -cx "$id" || true)"
  if [ "$count" -ne 1 ]; then
    err "read-back failed: $id appears $count time(s) in $REGISTRY."
    exit 2
  fi
  if [ "$(tail -1 "$REGISTRY")" != "$line" ]; then
    err "read-back failed: the appended line is not the last line of $REGISTRY."
    exit 2
  fi

  note "$line"
  note ""
  note "Minted $id. Now:"
  note "  1. Commit $REGISTRY ALONE:"
  note "       git add $REGISTRY && git commit -m 'chore(planning): allocate $id'"
  note "  2. $id is PROVISIONAL until that commit reaches main. Do not use it in a"
  note "     commit trailer, a plan filename, a board entry, or a document before then."
  exit 0
}

# --- Dispatch ----------------------------------------------------------------
[ $# -gt 0 ] || usage
case "$1" in
  --check) shift; cmd_check ;;
  --list)  shift; cmd_list ;;
  --mint)  shift; cmd_mint "$@" ;;
  -h|--help) usage ;;
  *) err "unknown argument '$1'"; usage ;;
esac
