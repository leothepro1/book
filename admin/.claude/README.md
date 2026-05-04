# `.claude/` — project-level Claude Code stack

This directory configures Claude Code for the `admin/` project. It is
the Phase-2 layer on top of the CLAUDE.md context split (Phase 1).

## What lives here

| File | Committed? | Purpose |
|---|---|---|
| `settings.json` | ✅ yes | Permissions + hooks shared by every developer |
| `settings.local.json` | ❌ no (gitignored) | Per-machine permissions accumulated by Claude Code |
| `hooks/session-start.sh` | ✅ yes | Injects git context + active recon docs at session start |
| `hooks/protected-branch.sh` | ✅ yes | Blocks prompts when on `main` / `master` / `production` |
| `hooks/eslint-post-edit.sh` | ✅ yes | Runs ESLint on TS/TSX files immediately after Claude edits them |
| `hooks/schema-changed.sh` | ✅ yes | Reminds about migration workflow when `prisma/schema.prisma` changes |
| `agents/researcher.md` | ✅ yes | Read-only exploration of unfamiliar code/docs/libs (returns summary, not raw data) |
| `agents/pms-reliability-auditor.md` | ✅ yes | Audits changes against the PMS reliability engine invariants |
| `agents/migration-reviewer.md` | ✅ yes | Audits Prisma changes against the 8 migration rules |
| `agents/recon-author.md` | ✅ yes | Drafts recon docs in `admin/_audit/` (Web Claude role) |
| `agents/README.md` | ✅ yes | Subagents catalog + invocation guide |

## Permissions model (`settings.json`)

The committed `settings.json` defines the *baseline* allowlist for any
developer who opens this project — read-only and safe-frequent commands
auto-approved.

**Allowed without prompt:**
- All `npm run` scripts that exist in `package.json` (lint, test, build,
  dev, dev:local, db:up, db:migrate, db:seed, pms:*, verify:*,
  analytics:parity-diff, geo:download, ...)
- Read-only `npx` invocations (tsc, vitest, eslint, tsx, prisma generate
  / migrate status / migrate dev / migrate deploy / studio / format /
  validate)
- Read-only `git` (status, diff, log, show, branch, remote, stash,
  fetch, ls-files, rev-parse, rev-list, blame, check-ignore, config --get)
- Process management for the dev-server lifecycle (`fuser`, `lsof`,
  `pgrep`, `pkill -f next`, `pkill -f turbopack`, `pkill -f vitest`)
- Project-scoped cache deletion (`rm -rf .next`, `.turbo`,
  `node_modules/.cache`)
- File inspection + filesystem (`ls`, `cat`, `head`, `tail`, `wc`,
  `find`, `grep`, `rg`, `jq`, `yq`, `tree`, `file`, `mkdir -p`, `mv`,
  `cp`, `touch`, `ln -s`)
- Pipeline tools (`sort`, `uniq`, `awk`, `xargs`, `tr`, `cut`, `paste`,
  `diff`, `comm`)
- System info (`date`, `pwd`, `uptime`, `df -h`, `du -h`, `free -h`,
  `uname`, `node -v`, `npm -v`)
- `WebFetch` to known docs domains (claude.com, anthropic.com, nextjs.org,
  prisma.io, stripe.com, resend.com, clerk.com, upstash.com,
  developer.mews.com, typescriptlang.org, zod.dev, vercel.com, react.dev,
  tailwindcss.com)

**Explicitly denied** (will not run even with manual approval):
- `prisma db push`, `prisma migrate reset` — banned by CLAUDE.md migration rules
- `git push --force`, `--force-with-lease`, `-f`
- `git push origin main`, `master`, `HEAD:main`, `HEAD:master`
- `git reset --hard origin/main` / `master`
- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf ..`
- Pipe-to-shell installers (`curl ... | bash`, `wget ... | sh` etc.)
- Reading `.env` files (any environment in repo or admin/)

Anything outside the allow / deny lists triggers the standard Claude
Code permission prompt — your choice each time.

## Hooks

### `SessionStart` — `session-start.sh`

Runs once when Claude opens a session. Stdout becomes context Claude can
see. Outputs:
- Branch name + ahead/behind upstream delta
- Working tree status (capped at 25 lines, with overflow count)
- Last 5 commits on the current branch
- Up to 5 most recently modified `admin/_audit/*.md` recon docs
  (matches the Web/Terminal Claude workflow contract in CLAUDE.md)

This is the same context a developer would check before starting work —
now Claude has it without you typing anything.

### `UserPromptSubmit` — `protected-branch.sh`

Fires before each prompt is sent to Claude. Blocks the prompt with
exit code 2 if you're on `main`, `master`, `production`, `prod`, or
`release`. Per CLAUDE.md, no direct edits land on those branches —
this hook is the safety net so a session accidentally started on a
deploy branch can't immediately rewrite production.

To bypass for a session (e.g. genuine hotfix):
```bash
export CLAUDE_HOOK_PROTECTED_BRANCH=0
```

### `PostToolUse` — `eslint-post-edit.sh`

Fires after `Edit` / `Write` / `MultiEdit` on `*.ts` / `*.tsx` files
under `admin/`. Runs ESLint on just the edited file (single-file pass).
- Exit 0 → silent
- ESLint exit 1 (real lint errors) → hook exits 2, output piped back to
  Claude as feedback, Claude fixes inline before next action
- ESLint exit 2 (config / fatal error) → surfaced to user as a warning,
  but **does not block** Claude — broken eslint config can't gate every
  edit

Performance: uses `--cache --cache-location .next/cache/eslint-claude-hook`
so subsequent runs hit the cache and complete in <500ms even in this
9k-file codebase.

Resilient: silently skips when `node_modules/eslint` is missing (fresh
clone, CI box without `npm install` yet) or when `jq` is unavailable.

### `PostToolUse` — `schema-changed.sh`

Fires after any edit to `prisma/schema.prisma`. Reminds Claude about
the migration workflow per `admin/CLAUDE.md`:
- Run `prisma migrate dev --name <descriptive>`
- Verify `prisma migrate status` is clean
- Never use `prisma db push`
- Commit the new migration file
- Append raw SQL for partial indexes Prisma DSL can't express

Exit code 2 — the message goes back to Claude as a forward instruction.

## Disable a hook

Each hook honours an env var to disable it without editing files:

```bash
export CLAUDE_HOOK_SESSION_START=0       # skip git-context injection
export CLAUDE_HOOK_PROTECTED_BRANCH=0    # allow prompts on main/master
export CLAUDE_HOOK_ESLINT=0              # skip ESLint on edits
export CLAUDE_HOOK_SCHEMA=0              # skip schema-change reminder
```

## Settings precedence — how layers compose

Claude Code reads multiple settings files. Two rules govern composition:

**For permissions:**
- `allow` lists are **additive** — the union across all layers applies
- `deny` rules from **any** layer apply (deny always wins)

**For everything else** (env, hooks, model, output style, etc.):
- More-specific overrides more-general
- Order: `local > user > project > defaults`

The actual layers in this project:

```
Managed enterprise settings        (none — open source / startup)
   ↑
.claude/settings.local.json        per-machine, gitignored — your accumulated approvals
   ↑
~/.claude/settings.json            user-global — your Stop hook + global permissions
   ↑
admin/.claude/settings.json        project — THIS FILE — team-shared baseline + hooks
   ↑
Claude Code defaults
```

Net effect for a developer cloning this repo:
- The four hooks defined here fire automatically
- The allow/deny baseline applies on top of any user-global settings
- Their personal `settings.local.json` adds anything they've approved over time

## Operational notes

### `settings.local.json` is currently tracked (history bug)

Earlier commits inadvertently checked in `admin/.claude/settings.local.json`.
The repo's `admin/.gitignore` now excludes it from future writes, but the
existing file is still tracked. To clean it up:

```bash
git rm --cached admin/.claude/settings.local.json
git commit -m "chore: untrack personal Claude Code settings"
```

This won't delete anyone's local copy — it just stops tracking changes.
Each developer keeps their own private permissions ledger.

### Pruning `settings.local.json`

Over months of work the file accumulates one-off permissions (specific
file paths, ad-hoc commands). To clean it up, invoke the
`fewer-permission-prompts` skill — it scans recent transcripts and
proposes a curated allowlist based on actual usage.

## Phase 1 reminder — CLAUDE.md hierarchy

This is Phase 2. Phase 1 was the CLAUDE.md split — see the root
`admin/CLAUDE.md` "Domain map" section. 26 CLAUDE.md files load
automatically based on which directory Claude is working in.

## Future phases (not built yet)

- **Phase 3** — Subagents in `.claude/agents/` (researcher,
  pms-reliability-auditor, migration-reviewer, ...)
- **Phase 4** — Slash commands / skills in `.claude/commands/` and
  `.claude/skills/` (`/recon`, `/verify-pms`, `/restart-dev`)
- **Phase 5** — `.mcp.json` for GitHub / Postgres / Sentry MCP servers

The hierarchy here lets each phase layer cleanly on top.
