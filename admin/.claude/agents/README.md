# `.claude/agents/` — project subagents

Subagents are isolated Claude instances with their own context window,
restricted toolset, and specialized system prompt. They run in
parallel with the main Claude session and return summaries — keeping
the main context window focused.

This directory holds four agents tuned to the daily workflow of this
project. They are loaded automatically when `admin/.claude/` is the
active project directory.

| Agent | Role | Tools | When to invoke |
|---|---|---|---|
| `researcher` | Read-only investigation | Read, Glob, Grep, WebFetch, WebSearch, Bash (RO) | "How does X work?", "Survey our use of Y", external API research |
| `pms-reliability-auditor` | Invariant audit | Read, Glob, Grep, Bash (RO) | Before merging changes to `_lib/integrations/reliability/`, `accommodations/create-pms-booking.ts`, PMS webhooks/crons |
| `migration-reviewer` | Migration rule audit | Read, Glob, Grep, Bash (RO) | Whenever `prisma/schema.prisma` or `prisma/migrations/` changes |
| `recon-author` | Web Claude — drafts recon docs | Read, Glob, Grep, Write (`_audit/*.md`), Bash (RO) | At the start of a new phase, before any implementation |

## How they compose with the rest of the stack

```
Phase 1 — admin/CLAUDE.md + 25 domain CLAUDE.md      Context Claude loads automatically
Phase 2 — admin/.claude/settings.json + hooks        Permissions + automation
Phase 3 — admin/.claude/agents/ (this dir)           Isolated specialists ← YOU ARE HERE
Phase 4 — slash commands / skills                    (not built yet)
Phase 5 — .mcp.json                                  (not built yet)
```

Each agent reads the relevant CLAUDE.md files itself when invoked, so
the main session doesn't pay the context cost of detailed knowledge
the agent already carries in its system prompt.

## Why these four (and not more)

The principle from the Phase 1 audit: every line earns its place.
Same applies here.

- **`researcher`** — the highest-leverage agent. Investigation queries
  flood the main context with raw search hits and full file reads.
  Delegating to a research agent means the main agent gets a 200-word
  summary instead of 20k tokens of raw output.

- **`pms-reliability-auditor`** — the reliability engine has 30+
  documented invariants spanning inbound / outbound / holds /
  idempotency / verification. Auditing them by hand is tedious and
  error-prone. A specialized agent that always reads the invariants
  doc first catches violations that the main agent might miss.

- **`migration-reviewer`** — migration drift is catastrophic and hard
  to undo. The 8 rules are explicit and rule-based — exactly what an
  agent does well. It also catches the partial-index pattern that's
  easy to miss.

- **`recon-author`** — directly implements the Web Claude role from
  `admin/CLAUDE.md` "Roles in this workspace". The operator no longer
  has to manually drive a Web Claude session — they delegate to this
  agent, review the produced markdown, and paste into Terminal Claude.

Other agents considered and intentionally not built:
- `commerce-invariants-auditor` — duplicates `pms-reliability-auditor`
  pattern; can be added later if the pattern proves itself.
- `section-implementer` — implementation agents are a Phase 4 concern
  (slash commands / skills), not a subagent.
- `mews-explorer` — just `researcher` with a domain hint; not worth a
  separate agent.

## Invocation

The main agent decides when to delegate based on each agent's
`description` frontmatter. You can also invoke explicitly:

> Use the `pms-reliability-auditor` to review the diff between `main`
> and HEAD.

> Use the `researcher` to investigate how Mews handles partial
> cancellations in their REST API.

> Use the `recon-author` to draft a recon for Tax-3.

## Agent contract — what every subagent here follows

1. **Single responsibility.** Each agent has one clear job.
2. **Least privilege.** Tools are restricted to the minimum the role
   needs. `Edit`, `Write` (outside `_audit/`), `MultiEdit`,
   `NotebookEdit`, and destructive Bash patterns are off-limits to
   audit/research roles.
3. **Read CLAUDE.md first.** Every agent's system prompt directs it
   to read the relevant CLAUDE.md files before reasoning, so domain
   knowledge stays in sync with the rest of the stack.
4. **Cite file:line.** Findings without citations are not findings.
5. **Distill, don't dump.** Output is for the main agent — concise
   summaries, not raw search results.

## Future phases

When Phase 4 (slash commands / skills) lands, agents become more
useful — a `/recon-tax-3` slash command could invoke `recon-author`
with prefilled scope. When Phase 5 (MCP) lands, the `researcher`
agent gets richer external data sources without changing its prompt.
