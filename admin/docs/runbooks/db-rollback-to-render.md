# Rollback from Neon to Render

If the Neon migration fails or causes production issues, follow this
runbook to return to Render.

## Local dev rollback (< 60 seconds)

1. Edit `admin/.env`:
   - Uncomment the `RENDER_DATABASE_URL` and `RENDER_DIRECT_URL`
     lines (stored as comments during fas C) and rename them to
     `DATABASE_URL` / `DIRECT_URL`
   - Comment out the Neon `DATABASE_URL` and `DIRECT_URL`
2. Restart dev server: stop `npm run dev`, restart
3. Verify:
   ```
   npx tsx -e "import { prisma } from './app/_lib/db/prisma'; \
     console.log(await prisma.tenant.count());"
   ```
   Should return `2` (Render has 2 tenants as of 2026-04-21).

## Vercel rollback

Not applicable yet — Vercel env vars still point at Render.

When Vercel has been switched to Neon:
1. In Vercel dashboard → project → Settings → Environment Variables
2. Update `DATABASE_URL` and `DIRECT_URL` back to the Render URLs
   (keep previous Neon values preserved as `NEON_DATABASE_URL` /
   `NEON_DIRECT_URL` comments when switching over)
3. Redeploy latest production deployment (`Deployments → Redeploy`)

## Database state after rollback

Render data is intact and current as of the migration audit
(2026-04-21). Neon data (1 tenant, 1 booking from seed) is
acceptable to discard.

Render `_prisma_migrations` has been cleaned to 1 row
(`20260421151049_squash_to_baseline`). Render schema matches the
new baseline exactly. No additional migration is needed after
rollback — `prisma migrate status` against Render will report
"up to date".

## Full schema + data backup reference

Taken 2026-04-21 before the squash (`admin/backups/`, local-only,
gitignored):
- `render-schema-pre-squash-2026-04-21.sql` (203 KB, schema-only)
- `render-data-pre-squash-2026-04-21.sql.gz` (515 KB, data-only)
- `render-tax-orphans-data.sql` (2.8 KB, TaxLine/TaxRate/TaxZone
  data dropped as orphans)

If Render schema or data needs to be reconstructed entirely, these
backups are the authoritative source. Apply schema first, then
data, via `psql` against a blank target.
