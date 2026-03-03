/*
  Warnings:

  - You are about to drop the `TenantMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[clerkOrgId]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clerkOrgId` to the `Tenant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TenantMember" DROP CONSTRAINT "TenantMember_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TenantMember" DROP CONSTRAINT "TenantMember_userId_fkey";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "clerkOrgId" TEXT NOT NULL,
ADD COLUMN     "ownerClerkUserId" TEXT;

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
