/**
 * Seed Test Tenant for Payment Testing
 * ═════════════════════════════════════
 *
 * Creates a test tenant with a connected Stripe account.
 * Usage: TEST_STRIPE_ACCOUNT_ID=acct_xxx npx tsx scripts/seed-test-tenant.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stripeAccountId = process.env.TEST_STRIPE_ACCOUNT_ID;
  if (!stripeAccountId) {
    console.error("ERROR: TEST_STRIPE_ACCOUNT_ID env var required");
    process.exit(1);
  }

  // Upsert tenant with Stripe Connect data
  const tenant = await prisma.tenant.upsert({
    where: { clerkOrgId: "org_test_payment_e2e" },
    update: {
      stripeAccountId,
      stripeOnboardingComplete: true,
      stripeLivemode: false,
      stripeConnectedAt: new Date(),
    },
    create: {
      clerkOrgId: "org_test_payment_e2e",
      name: "Test Camping E2E",
      slug: "test-camping-e2e",
      portalSlug: "test-camping-e2e-abc123",
      stripeAccountId,
      stripeOnboardingComplete: true,
      stripeLivemode: false,
      stripeConnectedAt: new Date(),
      subscriptionPlan: "BASIC",
      settings: {
        property: {
          name: "Test Camping E2E",
          address: "Testvägen 1, 123 45 Stockholm",
          latitude: 59.33,
          longitude: 18.07,
        },
      },
    },
  });

  // Ensure a product exists for the test
  const existingProduct = await prisma.product.findFirst({
    where: { tenantId: tenant.id, slug: "test-stuga" },
  });

  let productId: string;
  if (existingProduct) {
    productId = existingProduct.id;
  } else {
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        title: "Teststuga Deluxe",
        slug: "test-stuga",
        description: "En teststuga för betalningsflödet",
        status: "ACTIVE",
        price: 100000, // 1000 SEK
        currency: "SEK",
        sortOrder: 0,
      },
    });
    productId = product.id;
  }

  // Seed TenantPaymentConfig if not exists
  await prisma.tenantPaymentConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      providerKey: "bedfront_payments",
      isActive: true,
    },
  });

  console.log("=== Test Tenant Seeded ===");
  console.log(`Tenant ID:        ${tenant.id}`);
  console.log(`Portal Slug:      ${tenant.portalSlug}`);
  console.log(`Stripe Account:   ${stripeAccountId}`);
  console.log(`Product ID:       ${productId}`);
  console.log(`Subscription:     BASIC (5% fee)`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
