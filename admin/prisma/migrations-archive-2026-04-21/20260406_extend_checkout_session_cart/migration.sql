-- CreateEnum: CheckoutSessionType
CREATE TYPE "CheckoutSessionType" AS ENUM ('ACCOMMODATION', 'CART');

-- AlterTable: add sessionType + cart fields, make accommodation fields nullable
ALTER TABLE "CheckoutSession"
  ADD COLUMN "sessionType" "CheckoutSessionType" NOT NULL DEFAULT 'ACCOMMODATION',
  ADD COLUMN "cartItems" JSONB,
  ADD COLUMN "cartTotal" INTEGER;

-- Make accommodation-specific fields nullable
ALTER TABLE "CheckoutSession"
  ALTER COLUMN "accommodationId" DROP NOT NULL,
  ALTER COLUMN "ratePlanId" DROP NOT NULL,
  ALTER COLUMN "checkIn" DROP NOT NULL,
  ALTER COLUMN "checkOut" DROP NOT NULL,
  ALTER COLUMN "adults" DROP NOT NULL,
  ALTER COLUMN "accommodationName" DROP NOT NULL,
  ALTER COLUMN "accommodationSlug" DROP NOT NULL,
  ALTER COLUMN "ratePlanName" DROP NOT NULL,
  ALTER COLUMN "ratePlanCancellationPolicy" DROP NOT NULL,
  ALTER COLUMN "pricePerNight" DROP NOT NULL,
  ALTER COLUMN "totalNights" DROP NOT NULL,
  ALTER COLUMN "accommodationTotal" DROP NOT NULL;
