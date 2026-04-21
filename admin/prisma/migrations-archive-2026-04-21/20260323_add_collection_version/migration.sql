-- AlterTable: Add version column to ProductCollection for optimistic locking
ALTER TABLE "ProductCollection" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
