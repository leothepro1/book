-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_CHECKOUT', 'STRIPE_ELEMENTS');

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable: add paymentMethod + metadata to Order
ALTER TABLE "Order" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'STRIPE_CHECKOUT';
ALTER TABLE "Order" ADD COLUMN "metadata" JSONB;

-- Make guestEmail/guestName have defaults (for Elements flow where collected later)
ALTER TABLE "Order" ALTER COLUMN "guestEmail" SET DEFAULT '';
ALTER TABLE "Order" ALTER COLUMN "guestName" SET DEFAULT '';
