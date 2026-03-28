-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "screenshotDesktopUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "screenshotMobileUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "screenshotHash" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "screenshotUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "screenshotPending" BOOLEAN NOT NULL DEFAULT false;
