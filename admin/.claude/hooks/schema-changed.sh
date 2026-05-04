#!/bin/bash
#
# PostToolUse hook — remind about migrations when prisma/schema.prisma changes.
#
# Per admin/CLAUDE.md "Migrations workflow" rules: every schema change
# must go through `prisma migrate dev` locally, the resulting migration
# file must be committed, and `prisma db push` is forbidden.
#
# Exit 2 sends the reminder to Claude as a forward instruction (the
# edit already happened — this is what to do next).
#
# Resilience:
#   - Bails silently if jq is missing.
#
# Disable with CLAUDE_HOOK_SCHEMA=0
#
set -u

[[ "${CLAUDE_HOOK_SCHEMA:-1}" == "0" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only fire for prisma/schema.prisma.
[[ "$file" == */prisma/schema.prisma ]] || exit 0

cat <<'MSG' >&2
Schema changed (prisma/schema.prisma). Per admin/CLAUDE.md migration rules:

  1. Generate migration:
       cd admin && npx prisma migrate dev --name <descriptive_name>

  2. Verify clean state:
       npx prisma migrate status   (must report "up to date")

  3. NEVER use `prisma db push` — banned, causes drift.

  4. Commit the new migration file in prisma/migrations/.

  5. For partial/filtered indexes (not expressible in Prisma DSL):
     append raw SQL to the migration under
     `-- Partial unique indexes (not expressible in Prisma DSL)`.
MSG

exit 2
