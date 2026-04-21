-- CreateTable
CREATE TABLE "PendingSpotReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accommodationUnitId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSpotReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSpotReservation_checkoutSessionId_key" ON "PendingSpotReservation"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "PendingSpotReservation_tenantId_accommodationUnitId_checkIn_checkOut_idx" ON "PendingSpotReservation"("tenantId", "accommodationUnitId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "PendingSpotReservation_expiresAt_idx" ON "PendingSpotReservation"("expiresAt");

-- AddForeignKey
ALTER TABLE "PendingSpotReservation" ADD CONSTRAINT "PendingSpotReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
