-- DropForeignKey
ALTER TABLE "TenantMember" DROP CONSTRAINT "TenantMember_tenantId_fkey";
-- DropForeignKey
ALTER TABLE "TenantMember" DROP CONSTRAINT "TenantMember_userId_fkey";
-- AlterTable: add columns as nullable first
ALTER TABLE "Tenant" ADD COLUMN "clerkOrgId" TEXT,
ADD COLUMN "ownerClerkUserId" TEXT;
-- Backfill existing rows with a placeholder
UPDATE "Tenant" SET "clerkOrgId" = 'org_placeholder_' || id WHERE "clerkOrgId" IS NULL;
-- Now make it NOT NULL
ALTER TABLE "Tenant" ALTER COLUMN "clerkOrgId" SET NOT NULL;
-- DropTable
DROP TABLE "TenantMember";
-- DropTable
DROP TABLE "User";
-- DropEnum
DROP TYPE "TenantRole";
-- CreateIndex
CREATE UNIQUE INDEX "Tenant_clerkOrgId_key" ON "Tenant"("clerkOrgId");
-- CreateIndex
CREATE INDEX "Tenant_clerkOrgId_idx" ON "Tenant"("clerkOrgId");
