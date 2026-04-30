# Local development database setup

This worktree (`book-B`, branch `feature/draft-orders-flow`) uses a
dedicated, isolated PostgreSQL container running locally in the
Codespace. It is intentionally separate from production Neon and from
any sibling worktree's database.

This setup matches the requirement in `admin/CLAUDE.md` "Migrations
workflow" rule 5:

> "When cloning a fresh dev environment, `prisma migrate deploy`
> against a blank DB MUST build the entire schema."

## What you get

- PostgreSQL 17 (matches Neon production version 17.8) running in
  Docker on `localhost:5433` (not 5432 — that port is reserved for
  any system Postgres).
- A blank database `bedfront_dev` owned by user `bedfront`.
- `admin/.env` pointing at it via `DATABASE_URL` and `DIRECT_URL`.
- `.env*` is gitignored — credentials never leave the Codespace.

## One-time setup

```bash
# 1. Boot the container (image pull on first run is ~150 MB)
docker run -d \
  --name bedfront-dev-pg \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_USER=bedfront \
  -e POSTGRES_DB=bedfront_dev \
  -p 5433:5432 \
  postgres:17

# 2. Wait for it to be ready
until docker exec bedfront-dev-pg pg_isready -U bedfront -d bedfront_dev >/dev/null 2>&1; do
  sleep 1
done

# 3. Apply existing migrations
cd /workspaces/book-B/admin
npx prisma migrate deploy

# 4. Verify
npx prisma migrate status
# Expected: "Database schema is up to date!"
```

The `admin/.env` template lives at the repo and contains:

- `DATABASE_URL` and `DIRECT_URL` pointing at `localhost:5433`.
- `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `DEV_ORG_ID`,
  `DEV_OWNER_USER_ID` — placeholder values sufficient to pass the
  Zod validation in `app/_lib/env.ts`.
- All service vars (`STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`,
  `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, etc.) deliberately
  empty. They are lazy-validated and only throw when first used —
  schema migrations and `npm run build` do not invoke them.

**Never copy production credentials into this `.env`.** This DB is
expendable — production Stripe / Clerk / Resend keys are not.

## Day-to-day

```bash
# Connect with psql
PGPASSWORD=devpassword psql -h localhost -p 5433 -U bedfront -d bedfront_dev

# Stop the container (data persists in Docker volume)
docker stop bedfront-dev-pg

# Start it again
docker start bedfront-dev-pg

# Tear down completely (data lost)
docker rm -f bedfront-dev-pg
```

## Troubleshooting

**`prisma migrate deploy` fails with relation-not-found or drift.**
The migration history is broken. Per CLAUDE.md migrations rule 5,
this is a release-blocking bug — escalate, do not paper over.

**Port 5433 already in use.** Check `ss -lnt | grep 5433`. If
something else is listening, pick another port (e.g. 5434) and
update both the `docker run` command and `admin/.env` URLs.

**`npm run build` fails with env-validation error.** The Zod
schema in `app/_lib/env.ts` requires a few vars at boot. Confirm
`admin/.env` contains `DATABASE_URL`, `INTEGRATION_ENCRYPTION_KEY`
(≥32 chars), `CRON_SECRET` (≥16 chars), `DEV_ORG_ID`,
`DEV_OWNER_USER_ID`.

**Postgres version mismatch.** Neon production runs PG 17.8 (verified
via `SELECT version()`). The Docker image `postgres:17` resolves to
17.x current. Stay on the 17 major to avoid migration syntax
incompatibilities.

## Why local Docker, not shared Neon

Three reasons, each disqualifying on its own:

1. **CLAUDE.md migrations rule 5** requires a blank DB you can build
   from scratch. Shared Neon never satisfies this — it always has
   data from prior runs.
2. **`prisma migrate dev` modifies the connected DB**. Pointing it
   at production would directly mutate the live schema. Even though
   `DraftOrder` has zero rows today (verified VP4), this is not a
   safe pattern to normalise.
3. **Parallel worktrees would race**. If `book-B` and `book-A` (or
   `book-claude`) both pointed at the same Neon, one would generate
   a migration while the other applied it, and the migration history
   in `prisma/migrations/` would diverge from the DB's
   `_prisma_migrations` table.

The Docker container is per-worktree, ephemeral, and has zero
real-world side effects. Production data never leaves Neon.
