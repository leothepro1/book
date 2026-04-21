-- Add draft pipeline fields to SpotMap
-- draftConfig: JSON snapshot of desired state (markers + settings)
-- draftUpdatedAt: when draft was last modified
-- version: optimistic lock counter, incremented on each publish

ALTER TABLE "SpotMap" ADD COLUMN "draftConfig" JSONB;
ALTER TABLE "SpotMap" ADD COLUMN "draftUpdatedAt" TIMESTAMP(3);
ALTER TABLE "SpotMap" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
