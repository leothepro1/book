# `.claude/` — project-level Claude Code stack

This directory configures Claude Code for the `admin/` project. It is
the Phase-2 layer on top of the CLAUDE.md context split (Phase 1).

## What lives here

| File | Committed? | Purpose |
|---|---|---|
| `settings.json` | ✅ yes | Permissions + hooks shared by every developer |
| `settings.local.json` | ❌ no (gitignored) | Per-machine permissions accumulated by Claude Code. Personal. |
| `hooks/session-start.sh` | ✅ yes | Injects git context (branch, status, recent commits) at session start |
| `hooks/eslint-post-edit.sh` | ✅ yes | Runs ESLint on TS/TSX files immediately after Claude edits them |
| `hooks/schema-changed.sh` | ✅ yes | Reminds about migration workflow when `prisma/schema.prisma` changes |

## Permissions model (`settings.json`)

The committed `settings.json` defines the *default* allowlist for any
developer who opens this project — read-only and safe-frequent commands
auto-approved (npm scripts, prisma generate / migrate status / migrate dev,
read-only git, file inspection). Destructive operations require explicit
approval each time.

Explicitly **denied** (will not run even if you click "always allow"):
- `prisma db push` (banned by CLAUDE.md migration rules)
- `prisma migrate reset` (drops the dev DB)
- `git push --force` to any branch
- `git push` to `main` / `master`
- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`

Your personal `settings.local.json` adds anything else you've approved
during your own work. It's gitignored — never commits, never affects
anyone else.

## Hooks

### `SessionStart` — `session-start.sh`

Runs once when Claude Code opens a session in this project. Stdout is
piped into Claude's context, so it knows:
- Which branch you're on
- Whether the working tree is dirty (and what changed)
- Whether you're ahead/behind the remote
- The last 5 commits

This is the same context a developer would check before starting work.
Now Claude has it without you typing anything.

### `PostToolUse` — `eslint-post-edit.sh`

Fires after Edit / Write / MultiEdit on `*.ts` / `*.tsx` files. Runs
ESLint on just the edited file (fast — single-file pass). If errors are
found, exits with code 2 and pipes the ESLint output back to Claude as
feedback. Claude sees the errors and fixes them before moving on,
instead of accumulating problems for a later sweep.

Resilient: silently skips when ESLint isn't installed (fresh clone,
CI box without `npm install` yet) so it never breaks anyone.

### `PostToolUse` — `schema-changed.sh`

Fires after any edit to `prisma/schema.prisma`. Reminds Claude about
the migration workflow per `admin/CLAUDE.md`:
- Run `prisma migrate dev --name <descriptive>`
- Verify `prisma migrate status` is clean
- Never use `prisma db push`
- Commit the new migration file

Exit code 2 — the message goes back to Claude as a forward instruction.

## Disable a hook

Each hook honours an env var to disable it without editing files:

```bash
export CLAUDE_HOOK_SESSION_START=0   # skip git-context injection
export CLAUDE_HOOK_ESLINT=0          # skip ESLint on edits
export CLAUDE_HOOK_SCHEMA=0          # skip schema-change reminder
```

## How everything composes

```
~/.claude/settings.json              global — Stop hook (uncommitted-changes warning)
                  ↓
admin/.claude/settings.json          project — base allowlist + project hooks  ← THIS DIR
                  ↓
admin/.claude/settings.local.json    per-machine — your accumulated approvals
                  ↓
session permissions                  ephemeral — "always allow this session" toggles
```

Lower entries override higher ones for `allow`, but `deny` from any
layer wins over `allow` in any other layer.

## Phase 1 reminder — CLAUDE.md hierarchy

This is Phase 2. Phase 1 was the CLAUDE.md split — see the root
`admin/CLAUDE.md` "Domain map" section. 26 CLAUDE.md files load
automatically based on which directory Claude is working in.

## Future phases (not built yet)

- **Phase 3** — Subagents in `.claude/agents/` (researcher, pms-reliability-auditor, …)
- **Phase 4** — Slash commands in `.claude/commands/` (`/recon`, `/verify-pms`, `/restart-dev`)
- **Phase 5** — `.mcp.json` for GitHub / Postgres / Sentry MCP servers

When ready, add them in this directory. The settings.json composition
lets them layer cleanly on top of what's already here.
