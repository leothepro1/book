-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "holdExternalId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "holdExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_holdExpiresAt_idx" ON "Booking"("holdExpiresAt");
