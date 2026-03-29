-- AlterTable — add voidedAt to DiscountUsage for idempotent cancellation/refund
ALTER TABLE "DiscountUsage" ADD COLUMN "voidedAt" TIMESTAMP(3);
