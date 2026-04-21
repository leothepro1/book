-- CreateEnum
CREATE TYPE "BounceType" AS ENUM ('HARD', 'SOFT');

-- AlterTable
ALTER TABLE "EmailSuppression" ADD COLUMN     "bounceCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "EmailBounceEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bounceType" "BounceType" NOT NULL,
    "resendMessageId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBounceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailBounceEvent_tenantId_email_idx" ON "EmailBounceEvent"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmailBounceEvent_createdAt_idx" ON "EmailBounceEvent"("createdAt");
