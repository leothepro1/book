-- DropTable
DROP TABLE IF EXISTS "EmailSegmentMembership";

-- AlterEnum
ALTER TYPE "GuestEventType" ADD VALUE 'GUEST_JOINED_SEGMENT';
ALTER TYPE "GuestEventType" ADD VALUE 'GUEST_LEFT_SEGMENT';

-- CreateTable
CREATE TABLE "GuestSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSegmentMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "guestAccountId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GuestSegmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestSegment_tenantId_idx" ON "GuestSegment"("tenantId");
CREATE INDEX "GuestSegment_tenantId_isDefault_idx" ON "GuestSegment"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSegmentMembership_segmentId_guestAccountId_key" ON "GuestSegmentMembership"("segmentId", "guestAccountId");
CREATE INDEX "GuestSegmentMembership_tenantId_segmentId_idx" ON "GuestSegmentMembership"("tenantId", "segmentId");
CREATE INDEX "GuestSegmentMembership_tenantId_guestAccountId_idx" ON "GuestSegmentMembership"("tenantId", "guestAccountId");
CREATE INDEX "GuestSegmentMembership_segmentId_leftAt_idx" ON "GuestSegmentMembership"("segmentId", "leftAt");

-- AddForeignKey
ALTER TABLE "GuestSegment" ADD CONSTRAINT "GuestSegment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestSegmentMembership" ADD CONSTRAINT "GuestSegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "GuestSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestSegmentMembership" ADD CONSTRAINT "GuestSegmentMembership_guestAccountId_fkey" FOREIGN KEY ("guestAccountId") REFERENCES "GuestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
