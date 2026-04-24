-- AlterTable
ALTER TABLE "DraftReservation" ADD COLUMN     "holdIdempotencyKey" TEXT;

-- CreateIndex
CREATE INDEX "DraftReservation_holdState_holdLastAttemptAt_idx" ON "DraftReservation"("holdState", "holdLastAttemptAt");
