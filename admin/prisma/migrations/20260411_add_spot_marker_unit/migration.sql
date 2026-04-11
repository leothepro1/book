-- AlterTable: Add accommodationUnitId to SpotMarker
ALTER TABLE "SpotMarker" ADD COLUMN "accommodationUnitId" TEXT;

-- AddForeignKey
ALTER TABLE "SpotMarker" ADD CONSTRAINT "SpotMarker_accommodationUnitId_fkey"
  FOREIGN KEY ("accommodationUnitId") REFERENCES "AccommodationUnit"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex: remove old unique constraint on (spotMapId, accommodationId)
DROP INDEX "SpotMarker_spotMapId_accommodationId_key";

-- CreateIndex: partial unique on (spotMapId, accommodationUnitId) — only when unitId is non-null
-- Multiple markers with accommodationUnitId = NULL are allowed (unit not yet assigned)
CREATE UNIQUE INDEX "SpotMarker_spotMapId_accommodationUnitId_key"
  ON "SpotMarker"("spotMapId", "accommodationUnitId")
  WHERE "accommodationUnitId" IS NOT NULL;

-- CreateIndex: lookup by accommodationUnitId
CREATE INDEX "SpotMarker_accommodationUnitId_idx" ON "SpotMarker"("accommodationUnitId");
