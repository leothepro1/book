/**
 * Test Payment Flow
 * ═════════════════
 *
 * Creates a test order and initiates a PaymentIntent via the
 * BedfrontPaymentsAdapter. Prints the PI id and confirm command.
 *
 * Usage: npx tsx scripts/test-payment-flow.ts
 */

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

async function main() {
  // 1. Find the test tenant
  const tenant = await prisma.tenant.findFirst({
    where: { clerkOrgId: "org_test_payment_e2e" },
  });

  if (!tenant) {
    console.error("ERROR: Test tenant not found. Run seed-test-tenant.ts first.");
    process.exit(1);
  }

  if (!tenant.stripeAccountId) {
    console.error("ERROR: Test tenant has no stripeAccountId");
    process.exit(1);
  }

  // 2. Find the test product
  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, slug: "test-stuga" },
  });

  if (!product) {
    console.error("ERROR: Test product not found. Run seed-test-tenant.ts first.");
    process.exit(1);
  }

  // 3. Create an order (order-first pattern)
  const orderNumber = await getNextOrderNumber(tenant.id);
  const totalAmount = 100000; // 1000 SEK in öre
  const currency = "SEK";

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber,
      status: "PENDING",
      orderType: "ACCOMMODATION",
      paymentMethod: "STRIPE_ELEMENTS",
      guestEmail: "test@bedfront.dev",
      guestName: "Test Gäst",
      guestPhone: "+46701234567",
      subtotalAmount: totalAmount,
      taxAmount: 0,
      taxRate: 0,
      totalAmount,
      currency,
      platformFeeBps: 500, // BASIC plan = 5%
      metadata: {
        testRun: true,
        createdBy: "test-payment-flow.ts",
      },
      lineItems: {
        create: {
          productId: product.id,
          variantId: null,
          title: product.title,
          variantTitle: null,
          sku: null,
          imageUrl: null,
          quantity: 1,
          unitAmount: totalAmount,
          totalAmount,
          currency,
        },
      },
      events: {
        create: {
          type: "CREATED",
          message: `Order #${orderNumber} skapad — testbetalning`,
        },
      },
    },
  });

  console.log(`\n=== Order Created ===`);
  console.log(`Order ID:     ${order.id}`);
  console.log(`Order Number: #${orderNumber}`);
  console.log(`Amount:       ${totalAmount / 100} ${currency}`);
  console.log(`Status:       PENDING`);

  // 4. Create PaymentIntent directly (bypassing verifyChargesEnabled
  //    since test accounts don't have charges_enabled in test mode
  //    without full onboarding)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion,
  });

  const feeBps = 500;
  const applicationFeeAmount = Math.floor((totalAmount * feeBps) / 10_000);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalAmount,
      currency: currency.toLowerCase(),
      payment_method_types: ["card"],
      application_fee_amount: applicationFeeAmount,
      metadata: {
        providerKey: "bedfront_payments",
        sessionId: order.id,
        orderId: order.id,
        feeBps: String(feeBps),
        orderType: "ACCOMMODATION",
      },
    },
    {
      stripeAccount: tenant.stripeAccountId,
    },
  );

  // 5. Create/update PaymentSession
  await prisma.paymentSession.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      tenantId: tenant.id,
      providerKey: "bedfront_payments",
      amount: totalAmount,
      currency,
      externalSessionId: paymentIntent.id,
      rawInitResponse: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      },
    },
    update: {
      externalSessionId: paymentIntent.id,
    },
  });

  // 6. Update order with PI reference
  await prisma.order.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: paymentIntent.id },
  });

  console.log(`\n=== PaymentIntent Created ===`);
  console.log(`PI ID:            ${paymentIntent.id}`);
  console.log(`App Fee:          ${applicationFeeAmount / 100} ${currency} (${feeBps / 100}%)`);
  console.log(`Client Secret:    ${paymentIntent.client_secret}`);
  console.log(`Stripe Account:   ${tenant.stripeAccountId}`);

  console.log(`\n=== Confirm Command ===`);
  console.log(`stripe payment_intents confirm ${paymentIntent.id} \\`);
  console.log(`  --payment-method pm_card_visa \\`);
  console.log(`  --stripe-account ${tenant.stripeAccountId}`);

  console.log(`\n=== For Declined Test ===`);
  console.log(`stripe payment_intents confirm ${paymentIntent.id} \\`);
  console.log(`  --payment-method pm_card_visa_chargeDeclined \\`);
  console.log(`  --stripe-account ${tenant.stripeAccountId}`);
}

async function getNextOrderNumber(tenantId: string): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "OrderNumberSequence" ("tenantId", "lastNumber", "updatedAt")
    VALUES (${tenantId}, 1001, NOW())
    ON CONFLICT ("tenantId")
    DO UPDATE SET "lastNumber" = "OrderNumberSequence"."lastNumber" + 1,
                  "updatedAt" = NOW()
    RETURNING "lastNumber"
  `;
  return result[0].lastNumber;
}

main()
  .catch((err) => {
    console.error("Flow failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
