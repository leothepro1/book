-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "draftSettings" JSONB,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "draftUpdatedBy" TEXT;
