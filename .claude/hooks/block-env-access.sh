#!/usr/bin/env bash
# Block every route to a .env file: file tools and shell commands alike.
#
# permissions.deny in settings.json already stops Read/Edit/Grep/Glob, but it
# does not see `cat .env.local` inside a Bash command. This hook reads the
# PreToolUse payload and refuses anything that names an env file.
#
# .env.example is allowed through — it is committed, lists variable names only,
# and is how anyone learns what the project expects.
#
# Known gap: only names starting with `.env` are matched, so a file called
# `staging.env` would not be caught. Name env files `.env*` and it holds.

set -uo pipefail

payload=$(cat)

# Every field that can carry a path or a command. `// empty` keeps absent keys
# from printing "null", which would otherwise be searched as text.
haystack=$(printf '%s' "$payload" | jq -r '
  [ .tool_input.file_path?
  , .tool_input.path?
  , .tool_input.pattern?
  , .tool_input.command?
  , .tool_input.notebook_path?
  ] | map(select(. != null)) | join("\n")
' 2>/dev/null) || haystack=""

[ -z "$haystack" ] && exit 0

# `.env` must start a filename: preceded by start-of-line, a slash, a quote, a
# space — anything that is not an identifier character. That exclusion is what
# keeps `process.env.DATABASE_URL` and `import.meta.env` from tripping the hook.
hits=$(printf '%s' "$haystack" |
  grep -oE '(^|[^A-Za-z0-9_])\.env[A-Za-z0-9._-]*' |
  sed -E 's/^[^.]*//') || true

[ -z "$hits" ] && exit 0

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  [ "$hit" = ".env.example" ] && continue

  jq -n --arg f "$hit" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("Blocked: \($f) is an environment file holding live credentials. Project policy forbids reading, editing or shelling out to it. Read .env.example for the variable names, and ask the user for any value you actually need.")
    }
  }'
  exit 0
done <<<"$hits"

exit 0
