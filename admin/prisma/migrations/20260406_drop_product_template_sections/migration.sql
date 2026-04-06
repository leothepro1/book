-- AlterTable: Remove sections column from ProductTemplate
-- Sections now live in TenantConfig.pages["shop-product.{suffix}"]
ALTER TABLE "ProductTemplate" DROP COLUMN "sections";
