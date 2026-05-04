-- Tax-0 B.5 — dual-currency `presentment*` columns + atomic backfill.
--
-- Per Q1 + Q8 LOCKED (Terminal A's atomic-backfill ask): column-add and
-- backfill ship in the SAME PR and the SAME migration transaction. This
-- avoids a window where `presentment*` columns exist but are NULL on
-- historical rows, which would force every analytics tail-read to
-- special-case shop-only data. After this migration applies, every
-- pre-existing row has `presentment* = shop *` and downstream readers
-- can treat the columns as always-populated.
--
-- The columns themselves remain nullable in the schema so future
-- writers (Tax-3 commerce wiring, Tax-4 Markets) can leave them empty
-- when the application chooses to default to shop currency at write
-- time. Read paths should still apply the `presentment* ?? shop *`
-- fallback (see `_lib/money/from-flat.ts`).
--
-- Per Q7 LOCKED: presentment* column types match the existing column
-- type on each table — Order/OrderLineItem use INTEGER (legacy), Draft*
-- use BIGINT.

-- AlterTable: add nullable presentment columns (Postgres O(1) on null).
ALTER TABLE "Order" ADD COLUMN     "presentmentCurrency" TEXT,
ADD COLUMN     "presentmentSubtotalAmount" INTEGER,
ADD COLUMN     "presentmentTaxAmount" INTEGER,
ADD COLUMN     "presentmentTotalAmount" INTEGER;

-- AlterTable
ALTER TABLE "OrderLineItem" ADD COLUMN     "presentmentCurrency" TEXT,
ADD COLUMN     "presentmentTotalAmount" INTEGER,
ADD COLUMN     "presentmentUnitAmount" INTEGER;

-- AlterTable
ALTER TABLE "DraftOrder" ADD COLUMN     "presentmentCurrency" TEXT,
ADD COLUMN     "presentmentOrderDiscountCents" BIGINT,
ADD COLUMN     "presentmentSubtotalCents" BIGINT,
ADD COLUMN     "presentmentTotalCents" BIGINT,
ADD COLUMN     "presentmentTotalTaxCents" BIGINT;

-- AlterTable
ALTER TABLE "DraftLineItem" ADD COLUMN     "presentmentCurrency" TEXT,
ADD COLUMN     "presentmentLineDiscountCents" BIGINT,
ADD COLUMN     "presentmentSubtotalCents" BIGINT,
ADD COLUMN     "presentmentTaxAmountCents" BIGINT,
ADD COLUMN     "presentmentTotalCents" BIGINT,
ADD COLUMN     "presentmentUnitPriceCents" BIGINT;

-- ─────────────────────────────────────────────────────────────────────
-- Atomic backfill (Q1 + Q8 LOCKED). Same migration transaction as the
-- column-adds above, so analytics never observes a NULL window.
-- Predicate `IS NULL` is defensive — re-running the migration is a
-- no-op (idempotent within Prisma's migration-record gate).
-- ─────────────────────────────────────────────────────────────────────

UPDATE "Order" SET
  "presentmentSubtotalAmount" = "subtotalAmount",
  "presentmentTaxAmount"      = "taxAmount",
  "presentmentTotalAmount"    = "totalAmount",
  "presentmentCurrency"       = "currency"
WHERE "presentmentSubtotalAmount" IS NULL;

UPDATE "OrderLineItem" SET
  "presentmentUnitAmount"  = "unitAmount",
  "presentmentTotalAmount" = "totalAmount",
  "presentmentCurrency"    = "currency"
WHERE "presentmentUnitAmount" IS NULL;

UPDATE "DraftOrder" SET
  "presentmentSubtotalCents"      = "subtotalCents",
  "presentmentOrderDiscountCents" = "orderDiscountCents",
  "presentmentTotalTaxCents"      = "totalTaxCents",
  "presentmentTotalCents"         = "totalCents",
  "presentmentCurrency"           = "currency"
WHERE "presentmentSubtotalCents" IS NULL;

UPDATE "DraftLineItem" SET
  "presentmentUnitPriceCents"    = "unitPriceCents",
  "presentmentSubtotalCents"     = "subtotalCents",
  "presentmentLineDiscountCents" = "lineDiscountCents",
  "presentmentTaxAmountCents"    = "taxAmountCents",
  "presentmentTotalCents"        = "totalCents",
  -- Inherit currency from the parent draft order.
  "presentmentCurrency"          = (
    SELECT "currency"
    FROM "DraftOrder"
    WHERE "DraftOrder"."id" = "DraftLineItem"."draftOrderId"
  )
WHERE "presentmentUnitPriceCents" IS NULL;
