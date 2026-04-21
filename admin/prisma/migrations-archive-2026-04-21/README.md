# Archived migrations — squashed 2026-04-21

These 42 migrations were squashed into a single baseline migration on
2026-04-21. Root cause: migration history had drifted from schema.prisma
(48 CREATE TABLE in migrations vs 110 models in schema), caused by
historical `prisma db push` usage that bypassed the migration system.

Additionally, 3 orphan tables on Render (TaxLine, TaxRate, TaxZone from
a never-committed migration `20260411_add_tax_infrastructure`) were
dropped before squash to restore schema.prisma parity. Orphan data is
archived in `admin/backups/render-tax-orphans-data.sql` (not tracked in
git — local only).

New baseline: `admin/prisma/migrations/<timestamp>_squash_to_baseline/`

Do not delete this folder — it serves as a historical record and
debugging aid. Do not apply these migrations — they assume a
non-existent baseline state.
