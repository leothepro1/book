-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('REQUESTED', 'OPEN', 'DECLINED', 'CANCELED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CancellationInitiator" AS ENUM ('GUEST', 'STAFF', 'PMS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CancellationDeclineReason" AS ENUM ('OUTSIDE_WINDOW', 'NON_REFUNDABLE_RATE', 'NO_SHOW', 'FORCE_MAJEURE_DECLINED', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationRefundStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CancellationEventType" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'PMS_CANCEL_ATTEMPTED', 'PMS_CANCEL_SUCCEEDED', 'PMS_CANCEL_FAILED', 'REFUND_INITIATED', 'REFUND_SUCCEEDED', 'REFUND_FAILED', 'EMAIL_SENT', 'EMAIL_FAILED', 'CLOSED', 'NOTE_ADDED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationPolicySnapshot" JSONB,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "CancellationStatus" NOT NULL DEFAULT 'REQUESTED',
    "initiator" "CancellationInitiator" NOT NULL,
    "initiatorUserId" TEXT,
    "reasonHandle" TEXT,
    "guestNote" VARCHAR(300),
    "declineReason" "CancellationDeclineReason",
    "declineNote" VARCHAR(500),
    "originalAmount" INTEGER NOT NULL,
    "cancellationFeeAmount" INTEGER NOT NULL,
    "refundAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "pmsProvider" TEXT,
    "pmsCanceledAt" TIMESTAMP(3),
    "pmsExternalFeeItemId" TEXT,
    "refundStatus" "CancellationRefundStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "stripeRefundId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationEvent" (
    "id" TEXT NOT NULL,
    "cancellationRequestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "CancellationEventType" NOT NULL,
    "actor" "CancellationInitiator" NOT NULL,
    "actorUserId" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "autoExpireHours" INTEGER NOT NULL DEFAULT 48,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationReasonDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationReasonDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCancellationLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCancellationLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancellationRequest_tenantId_status_idx" ON "CancellationRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CancellationRequest_tenantId_bookingId_idx" ON "CancellationRequest"("tenantId", "bookingId");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_expiresAt_idx" ON "CancellationRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_nextAttemptAt_idx" ON "CancellationRequest"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_tenantId_requestedAt_idx" ON "CancellationRequest"("tenantId", "requestedAt");

-- CreateIndex
CREATE INDEX "CancellationEvent_cancellationRequestId_createdAt_idx" ON "CancellationEvent"("cancellationRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "CancellationEvent_tenantId_type_createdAt_idx" ON "CancellationEvent"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "CancellationPolicy_tenantId_active_idx" ON "CancellationPolicy"("tenantId", "active");

-- CreateIndex
CREATE INDEX "CancellationReasonDefinition_tenantId_deleted_sortOrder_idx" ON "CancellationReasonDefinition"("tenantId", "deleted", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationReasonDefinition_tenantId_handle_key" ON "CancellationReasonDefinition"("tenantId", "handle");

-- CreateIndex
CREATE INDEX "PendingCancellationLock_expiresAt_idx" ON "PendingCancellationLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCancellationLock_tenantId_dedupKey_key" ON "PendingCancellationLock"("tenantId", "dedupKey");

-- CreateIndex
CREATE INDEX "Booking_tenantId_cancelledAt_idx" ON "Booking"("tenantId", "cancelledAt");

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationEvent" ADD CONSTRAINT "CancellationEvent_cancellationRequestId_fkey" FOREIGN KEY ("cancellationRequestId") REFERENCES "CancellationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationPolicy" ADD CONSTRAINT "CancellationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationReasonDefinition" ADD CONSTRAINT "CancellationReasonDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Partial unique indexes (not expressible in Prisma DSL)
-- ═══════════════════════════════════════════════════════════════════

-- Invariant: at most ONE non-terminal CancellationRequest per (tenantId, bookingId).
-- Enforces the spec rule that a booking cannot have two active requests in flight.
-- Application code MUST catch 23505 and translate to a user-facing INVALID_STATE error
-- (see admin/app/_lib/cancellations/errors.ts).
CREATE UNIQUE INDEX "CancellationRequest_one_active_per_booking"
  ON "CancellationRequest"("tenantId", "bookingId")
  WHERE "status" IN ('REQUESTED', 'OPEN');
