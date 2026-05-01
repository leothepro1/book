/*
  Warnings:

  - You are about to drop the column `pricesFrozenAt` on the `DraftOrder` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DraftCheckoutSessionStatus" AS ENUM ('ACTIVE', 'UNLINKED', 'EXPIRED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "DraftOrder" DROP COLUMN "pricesFrozenAt";

-- AlterTable
ALTER TABLE "DraftReservation" ADD COLUMN     "holdReleaseReason" TEXT;

-- CreateTable
CREATE TABLE "DraftCheckoutSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftOrderId" TEXT NOT NULL,
    "draftOrderVersion" INTEGER NOT NULL,
    "status" "DraftCheckoutSessionStatus" NOT NULL,
    "frozenSubtotal" BIGINT NOT NULL,
    "frozenTaxAmount" BIGINT NOT NULL,
    "frozenDiscountAmount" BIGINT NOT NULL,
    "frozenTotal" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeClientSecret" TEXT,
    "stripeIdempotencyKey" TEXT NOT NULL,
    "lastHoldRefreshAt" TIMESTAMP(3),
    "holdRefreshFailureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastBuyerActivityAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "unlinkedAt" TIMESTAMP(3),
    "unlinkReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DraftCheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftCheckoutSession_stripePaymentIntentId_key" ON "DraftCheckoutSession"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftCheckoutSession_stripeIdempotencyKey_key" ON "DraftCheckoutSession"("stripeIdempotencyKey");

-- CreateIndex
CREATE INDEX "DraftCheckoutSession_draftOrderId_status_idx" ON "DraftCheckoutSession"("draftOrderId", "status");

-- CreateIndex
CREATE INDEX "DraftCheckoutSession_tenantId_status_idx" ON "DraftCheckoutSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DraftCheckoutSession_expiresAt_status_idx" ON "DraftCheckoutSession"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "DraftCheckoutSession_stripePaymentIntentId_idx" ON "DraftCheckoutSession"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "DraftCheckoutSession_status_lastHoldRefreshAt_idx" ON "DraftCheckoutSession"("status", "lastHoldRefreshAt");

-- AddForeignKey
ALTER TABLE "DraftCheckoutSession" ADD CONSTRAINT "DraftCheckoutSession_draftOrderId_fkey" FOREIGN KEY ("draftOrderId") REFERENCES "DraftOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes (not expressible in Prisma DSL)
-- At most one ACTIVE DraftCheckoutSession may exist per draft. Concurrent
-- buyer-opens of the same invoice link race on this index; the loser
-- catches P2002 and returns the existing ACTIVE session (v1.2 §7.5,
-- invariant 11).
CREATE UNIQUE INDEX "DraftCheckoutSession_one_active_per_draft"
  ON "DraftCheckoutSession" ("draftOrderId")
  WHERE status = 'ACTIVE';
