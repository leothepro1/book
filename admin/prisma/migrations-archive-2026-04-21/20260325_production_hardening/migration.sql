-- AlterEnum: add new OrderEventType values
ALTER TYPE "OrderEventType" ADD VALUE 'GUEST_INFO_UPDATED';
ALTER TYPE "OrderEventType" ADD VALUE 'RECONCILED';

-- AlterTable: add taxRate to Order
ALTER TABLE "Order" ADD COLUMN "taxRate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: PendingBookingLock (idempotency for PMS booking creation)
CREATE TABLE "PendingBookingLock" (
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingBookingLock_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PendingBookingLock_expiresAt_idx" ON "PendingBookingLock"("expiresAt");
