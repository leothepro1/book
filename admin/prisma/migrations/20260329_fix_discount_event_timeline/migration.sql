-- Make DiscountEvent.message non-nullable (all existing rows have a value)
UPDATE "DiscountEvent" SET "message" = '' WHERE "message" IS NULL;
ALTER TABLE "DiscountEvent" ALTER COLUMN "message" SET NOT NULL;

-- Add actorName to DiscountEvent
ALTER TABLE "DiscountEvent" ADD COLUMN "actorName" TEXT;

-- Add new event types
ALTER TYPE "DiscountEventType" ADD VALUE 'USAGE_VOIDED';
ALTER TYPE "DiscountEventType" ADD VALUE 'NOTE_ADDED';
