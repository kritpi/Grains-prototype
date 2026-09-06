#!/usr/bin/env bash
#
# Runs the project's checks once, at the end of a turn that changed code.
#
# Two modes, wired to two events in .claude/settings.json:
#
#   record   PostToolUse on Write|Edit. Notes which package the edited file
#            belongs to and returns immediately. Runs nothing.
#   verify   Stop. Runs typecheck, lint, format:check and the test suite in
#            whatever was recorded, then clears the note.
#
# Split that way for two reasons. Running the suite per edit would fire in the
# middle of a refactor, when the tree is meant to be inconsistent, and would
# add ~15s and a round trip to grains-dev to every single write. And the Stop
# event carries no file path, so without the record step the checks could only
# guess where to run — which matters here because Phase 2 works out of git
# worktrees under .claude/worktrees/, and the session's project directory is
# not the directory being edited.
#
# Exits 2 on failure, which feeds the output back to Claude to fix. A run of
# consecutive failures is capped so an unfixable break cannot trap the session.

set -uo pipefail

MODE="${1:-verify}"
MAX_CONSECUTIVE_BLOCKS=3

payload="$(cat)"

session_id="$(printf '%s' "$payload" | jq -r '.session_id // "nosession"')"
state_dir="${TMPDIR:-/tmp}/claude-grains-verify"
mkdir -p "$state_dir"
targets_file="$state_dir/$session_id.targets"
blocks_file="$state_dir/$session_id.blocks"

# The package root a file belongs to: walk up until package.json appears, so an
# edit inside a worktree records that worktree and not the main checkout.
package_root_of() {
  local dir
  dir="$(cd "$(dirname "$1")" 2>/dev/null && pwd)" || return 1
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

case "$MODE" in
  record)
    file_path="$(printf '%s' "$payload" |
      jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
    [ -n "$file_path" ] || exit 0

    # Only files these four checks actually look at. An include list rather
    # than an exclude list, so a new kind of file is ignored until someone
    # decides it should not be.
    case "$file_path" in
      *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.css | *.json) ;;
      *) exit 0 ;;
    esac

    # Claude's own configuration is not project source — but the Phase 2
    # worktrees live *under* .claude/, so the exception has to come first or
    # every worktree edit is skipped.
    case "$file_path" in
      */.claude/worktrees/*) ;;
      */.claude/*) exit 0 ;;
    esac

    root="$(package_root_of "$file_path")" || exit 0
    # node_modules absent means the package was never installed; running the
    # checks there would fail for a reason that has nothing to do with the edit.
    [ -d "$root/node_modules" ] || exit 0

    if ! grep -qxF "$root" "$targets_file" 2>/dev/null; then
      printf '%s\n' "$root" >>"$targets_file"
    fi
    exit 0
    ;;

  verify)
    [ -s "$targets_file" ] || exit 0

    blocks=$(cat "$blocks_file" 2>/dev/null || echo 0)
    if [ "$blocks" -ge "$MAX_CONSECUTIVE_BLOCKS" ]; then
      rm -f "$targets_file" "$blocks_file"
      echo '{"systemMessage":"Verification hook: still failing after '"$MAX_CONSECUTIVE_BLOCKS"' attempts — letting the turn end so you are not stuck. Run the checks by hand."}'
      exit 0
    fi

    failures=""
    while IFS= read -r root; do
      [ -d "$root" ] || continue
      for check in typecheck lint format:check test; do
        if ! output="$(cd "$root" && pnpm run "$check" 2>&1)"; then
          failures+="--- pnpm $check failed in $root ---"$'\n'
          # The tail is where the reason is; the banner above it is noise.
          failures+="$(printf '%s' "$output" | tail -40)"$'\n\n'
        fi
      done
    done <"$targets_file"

    if [ -n "$failures" ]; then
      printf '%s\n' "$((blocks + 1))" >"$blocks_file"
      printf 'Verification failed. Fix these before finishing:\n\n%s' "$failures" >&2
      exit 2
    fi

    rm -f "$targets_file" "$blocks_file"
    exit 0
    ;;

  *)
    echo "verify-changes.sh: unknown mode '$MODE'" >&2
    exit 1
    ;;
esac
