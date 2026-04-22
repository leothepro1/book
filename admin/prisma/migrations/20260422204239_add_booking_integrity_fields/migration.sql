-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "integrityFlag" TEXT;
ALTER TABLE "Booking" ADD COLUMN "integrityMismatchFields" JSONB;
ALTER TABLE "Booking" ADD COLUMN "integrityDetectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_tenantId_integrityFlag_idx" ON "Booking"("tenantId", "integrityFlag");
