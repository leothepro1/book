-- DropForeignKey
ALTER TABLE "DiscountUsage" DROP CONSTRAINT "DiscountUsage_discountId_fkey";

-- AddForeignKey (Restrict instead of Cascade — audit data must be preserved)
ALTER TABLE "DiscountUsage" ADD CONSTRAINT "DiscountUsage_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
