/**
 * scripts/seed-staging-tenant.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ⚠️ NOT RUNNABLE WITHOUT OPERATOR ACTION FIRST.
 *
 * Hardcoded clerkOrgId="seed_staging_org" is a SENTINEL placeholder.
 * The operator (Leo) must:
 *
 *   1. Create a SEPARATE Clerk org for staging (do NOT reuse production
 *      Apelviken's clerkOrgId — would create auth ambiguity).
 *   2. Copy the new Clerk org-id (format: org_*).
 *   3. Replace the sentinel below with the real org-id, OR run
 *      `UPDATE Tenant SET "clerkOrgId" = 'org_REAL_ID' WHERE
 *      "portalSlug" = 'apelviken-staging'` after first seed.
 *
 * Without re-keying, auth flows fail and the staging tenant is
 * unusable for session-based testing.
 *
 * See docs/analytics/phase3-5-staging-setup.md Step 1 for the full
 * Clerk-org provisioning procedure.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * Idempotent: safe to re-run. Uses `upsert` keyed on portalSlug.
 *
 * Staging-only invariants enforced by this script:
 *
 *  - Tenant.environment = "staging"
 *      → Phase 5+ aggregations exclude this tenant via
 *        PRODUCTION_TENANT_FILTER from
 *        app/_lib/analytics/pipeline/environment.ts.
 *
 *  - TenantIntegration.provider = "fake"  (NOT mews)
 *      → prevents accidental writes to Apelviken's Mews test
 *        environment, which Apelviken may also use for their own QA.
 *
 *  - TenantIntegration.isDemoEnvironment = true
 *      → PMS/payment adapters know to no-op real-world side effects.
 *        Complementary to Tenant.environment — see
 *        docs/analytics/phase3-5-staging-setup.md "Two complementary
 *        flags" section.
 *
 *  - TenantPaymentConfig.providerKey = "manual"  (NOT stripe)
 *      → prevents real Stripe test-mode webhooks from cross-
 *        contaminating production reconciliation paths.
 *
 *  - Tenant.stripeAccountId = null
 *      → no Stripe Connect; staging tenant cannot receive real money
 *        even if a path is misconfigured.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * Invocation patterns (per refinement #3 — --allow-sentinel guard):
 *
 *   1. Operator has provisioned Clerk org and has the real id:
 *        STAGING_CLERK_ORG_ID=org_REAL_ID \
 *          npx tsx scripts/seed-staging-tenant.ts
 *
 *   2. Infrastructure setup BEFORE Clerk org is provisioned (rare —
 *      e.g. testing the script itself, or laying the Tenant row in
 *      advance for DB seeding):
 *        STAGING_CLERK_ORG_ID=seed_staging_org \
 *          npx tsx scripts/seed-staging-tenant.ts --allow-sentinel
 *
 *      Without --allow-sentinel, the script HARD-FAILS with clear
 *      stderr instructions. This is intentional defense-in-depth
 *      against accidental seed runs that leave the tenant in a
 *      broken state.
 *
 *   3. Re-key after Clerk org is provisioned (operator already ran
 *      pattern 2, then later created the Clerk org):
 *        STAGING_CLERK_ORG_ID=org_REAL_ID \
 *          npx tsx scripts/seed-staging-tenant.ts
 *      OR
 *        psql "$DATABASE_URL" -c \
 *          "UPDATE \"Tenant\" SET \"clerkOrgId\" = 'org_REAL_ID' \
 *           WHERE \"portalSlug\" = 'apelviken-staging'"
 */

/* eslint-disable no-console */

import { PrismaClient } from "@prisma/client";

const SENTINEL_CLERK_ORG_ID = "seed_staging_org";
const STAGING_PORTAL_SLUG = "apelviken-staging";
const STAGING_SLUG = "apelviken-staging";

function main(): Promise<void> {
  const clerkOrgId = process.env.STAGING_CLERK_ORG_ID || SENTINEL_CLERK_ORG_ID;
  const allowSentinel = process.argv.includes("--allow-sentinel");

  if (clerkOrgId === SENTINEL_CLERK_ORG_ID && !allowSentinel) {
    console.error("");
    console.error("❌ STAGING_CLERK_ORG_ID not set, seed will use sentinel.");
    console.error("");
    console.error("   This means the staging tenant will NOT be usable for");
    console.error("   session-based auth flows.");
    console.error("");
    console.error("   To proceed anyway (e.g. infrastructure setup before");
    console.error("   Clerk org is provisioned), pass --allow-sentinel:");
    console.error("");
    console.error("     STAGING_CLERK_ORG_ID=seed_staging_org \\");
    console.error("       npx tsx scripts/seed-staging-tenant.ts --allow-sentinel");
    console.error("");
    console.error("   To re-key after Clerk org is provisioned:");
    console.error("");
    console.error("     STAGING_CLERK_ORG_ID=org_REAL_ID \\");
    console.error("       npx tsx scripts/seed-staging-tenant.ts");
    console.error("");
    process.exit(1);
  }

  return runSeed(clerkOrgId);
}

async function runSeed(clerkOrgId: string): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // 1. Tenant — upsert keyed on portalSlug. environment="staging"
    //    is the headline change; otherwise mirror production
    //    Apelviken's settings (theme, support links, features) so
    //    the storefront looks like the real thing in smoke tests.
    const tenant = await prisma.tenant.upsert({
      where: { portalSlug: STAGING_PORTAL_SLUG },
      update: {
        environment: "staging",
        clerkOrgId,
        name: "Apelviken (staging)",
        slug: STAGING_SLUG,
        // Staging never gets a real Stripe account.
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripeLivemode: false,
        stripeConnectedAt: null,
      },
      create: {
        portalSlug: STAGING_PORTAL_SLUG,
        environment: "staging",
        clerkOrgId,
        name: "Apelviken (staging)",
        slug: STAGING_SLUG,
        settings: stagingTenantSettings(),
        // Staging never gets a real Stripe account.
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripeLivemode: false,
        stripeConnectedAt: null,
      },
    });

    console.log(`✓ Tenant upserted: ${tenant.id} (portalSlug=${tenant.portalSlug})`);
    console.log(`  environment=${tenant.environment}`);
    console.log(`  clerkOrgId=${tenant.clerkOrgId}`);

    if (tenant.clerkOrgId === SENTINEL_CLERK_ORG_ID) {
      console.warn("");
      console.warn("  ⚠️  clerkOrgId is the sentinel value. Auth flows will NOT");
      console.warn("     work until you re-key. See script header for options.");
      console.warn("");
    }

    // 2. TenantIntegration — Fake adapter, demo environment. No
    //    encryption needed; FakeAdapter does not decrypt creds.
    const integration = await prisma.tenantIntegration.upsert({
      where: { tenantId: tenant.id },
      update: {
        provider: "fake",
        isDemoEnvironment: true,
        status: "active",
        // Empty bytes — FakeAdapter does not read credentials.
        credentialsEncrypted: Buffer.alloc(0),
        credentialsIv: Buffer.alloc(0),
      },
      create: {
        tenantId: tenant.id,
        provider: "fake",
        isDemoEnvironment: true,
        status: "active",
        credentialsEncrypted: Buffer.alloc(0),
        credentialsIv: Buffer.alloc(0),
      },
    });
    console.log(`✓ TenantIntegration upserted: provider=${integration.provider}, isDemoEnvironment=${integration.isDemoEnvironment}`);

    // 3. TenantPaymentConfig — manual provider, no real Stripe.
    const paymentConfig = await prisma.tenantPaymentConfig.upsert({
      where: { tenantId: tenant.id },
      update: {
        providerKey: "manual",
        isActive: true,
        credentials: null,
      },
      create: {
        tenantId: tenant.id,
        providerKey: "manual",
        isActive: true,
        credentials: null,
      },
    });
    console.log(`✓ TenantPaymentConfig upserted: providerKey=${paymentConfig.providerKey}`);

    // 4. AnalyticsPipelineTenantConfig — enable the pipeline so the
    //    dispatch endpoint emits events. Mirrors what we did
    //    for the production dev tenant during PR-A bring-up.
    const analyticsConfig = await prisma.analyticsPipelineTenantConfig.upsert({
      where: { tenantId: tenant.id },
      update: {
        pipelineEnabled: true,
        enabledAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        pipelineEnabled: true,
        enabledAt: new Date(),
      },
    });
    console.log(
      `✓ AnalyticsPipelineTenantConfig upserted: pipelineEnabled=${analyticsConfig.pipelineEnabled}`,
    );

    console.log("");
    console.log("✓ Staging tenant seed complete.");
    console.log("");
    console.log("Next steps (per docs/analytics/phase3-5-staging-setup.md):");
    console.log("  Step 3: Vercel domain alias for apelviken-staging.rutgr.com");
    console.log("  Step 4: Smoke verification");
  } finally {
    await prisma.$disconnect();
  }
}

function stagingTenantSettings(): Record<string, unknown> {
  // Mirror production Apelviken settings minus things that should be
  // visibly different in smoke screenshots (the name, the addresses)
  // so a casual operator can see "this is the staging instance" at
  // a glance.
  return {
    property: {
      name: "Apelviken Camping (staging)",
      address: "Staging environment — fake data only",
      latitude: 57.4875,
      longitude: 12.0739,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      timezone: "Europe/Stockholm",
    },
    theme: {
      version: 1,
      colors: {
        background: "#fff",
        text: "#2D2C2B",
        // A different button color so staging is visually
        // distinguishable from production at a glance.
        buttonBg: "#FF6B35",
        buttonText: "#fff",
      },
      header: { logoWidth: 120 },
      background: { mode: "fill" },
      buttons: { variant: "solid", radius: "rounder", shadow: "soft" },
      typography: {
        headingFont: "inter",
        bodyFont: "inter",
        mutedOpacity: 0.72,
      },
    },
    supportLinks: {
      supportUrl: "https://apelviken.se/support",
      faqUrl: "https://apelviken.se/faq",
      termsUrl: "https://apelviken.se/vistelsevillkor",
    },
    features: {
      commerceEnabled: false,
      accountEnabled: false,
      notificationsEnabled: true,
      languageSwitcherEnabled: true,
    },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
