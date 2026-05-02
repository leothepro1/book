const { PrismaClient } = require("@prisma/client");
const { createCipheriv, randomBytes } = require("node:crypto");
const prisma = new PrismaClient();

/**
 * AES-256-GCM credential encryption — MUST stay binary-compatible with
 * `app/_lib/integrations/crypto.ts`. Same key derivation (first 32 chars
 * of INTEGRATION_ENCRYPTION_KEY, UTF-8), same IV length (12 bytes), same
 * auth-tag length (16 bytes appended at the end of the ciphertext).
 *
 * Mirrored here because seed.js is plain CommonJS and cannot import the
 * TS module. If the production crypto.ts ever changes shape, update this
 * helper in lockstep or seeded credentials will fail to decrypt.
 */
function encryptCredentials(plaintext, encryptionKey) {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("[seed] INTEGRATION_ENCRYPTION_KEY must be at least 32 chars");
  }
  const key = Buffer.from(encryptionKey.slice(0, 32), "utf-8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const json = JSON.stringify(plaintext);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf-8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { encrypted, iv };
}

// Public Mews demo platform identity — same constants as
// `app/_lib/integrations/adapters/mews/demo-credentials.ts`. Anyone
// connecting to the Mews demo environment uses these. The per-property
// accessToken is the only private piece, supplied via env.
const MEWS_DEMO_CLIENT_TOKEN =
  "E0D439EE522F44368DC78E1BFB03710C-D24FB11DBE31D4621C4817E028D9E1D";
const MEWS_DEMO_CLIENT_NAME = "GuestPortalPlatform/1.0.0";
const MEWS_DEMO_WEBHOOK_SECRET = "demo-webhook-secret";
const MEWS_DEMO_INITIAL_SYNC_DAYS = 90;

async function main() {
  // 1. Skapa/uppdatera dev-tenant linked to DEV_ORG_ID.
  //
  // Why keyed on clerkOrgId (not slug):
  //   devAuth.ts hardcodes orgId = process.env.DEV_ORG_ID and getCurrentTenant
  //   resolves the tenant by clerkOrgId. If the seed and the env disagree, the
  //   admin app returns null → "no tenant id found". Seeding by clerkOrgId
  //   guarantees the dev tenant always matches the env, no matter when the
  //   DB or env was last touched.
  //
  // Re-running the seed never overwrites settings on an existing tenant —
  // settings are owned by the editor/publish flow, not by the seed.
  const devOrgId = process.env.DEV_ORG_ID;
  if (!devOrgId) {
    throw new Error("[seed] DEV_ORG_ID is required — set it in .env before seeding");
  }

  const tenant = await prisma.tenant.upsert({
    where: { clerkOrgId: devOrgId },
    update: {
      // Intentionally empty — never overwrite settings/slug/name on re-seed.
      // The editor owns tenant config in steady state.
    },
    create: {
      name: "Apelviken Camping",
      slug: "apelviken-dev",
      clerkOrgId: devOrgId,
      settings: {
        property: {
          name: "Apelviken Camping",
          address: "Apelviksvägen 47, 439 76 Kungsbacka",
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
            buttonBg: "#8B3DFF",
            buttonText: "#fff",
          },
          header: {
            logoUrl: undefined,
            logoWidth: 120,
          },
          background: {
            mode: "fill",
          },
          buttons: {
            variant: "solid",
            radius: "rounder",
            shadow: "soft",
          },
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
      },
    },
  });

  console.log(`✅ Dev tenant ready (clerkOrgId=${devOrgId}, slug=${tenant.slug})`);

  // 2. Bind dev tenant to operator's private Mews demo property.
  //
  // When DEV_MEWS_DEMO_ACCESS_TOKEN is set, write an encrypted
  // TenantIntegration row so resolveAdapter() resolves to the real
  // Mews demo adapter (not the synthetic FakeAdapter) — matching what
  // production tenants get. Token rotation is "edit env, re-seed".
  //
  // Skipped silently when the env var is missing so bare dev setups
  // (no Mews account) still seed cleanly.
  const mewsAccessToken = process.env.DEV_MEWS_DEMO_ACCESS_TOKEN?.trim();
  if (mewsAccessToken) {
    const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error(
        "[seed] INTEGRATION_ENCRYPTION_KEY required to seed Mews integration",
      );
    }

    const credentials = {
      clientToken: MEWS_DEMO_CLIENT_TOKEN,
      accessToken: mewsAccessToken,
      clientName: MEWS_DEMO_CLIENT_NAME,
      webhookSecret: MEWS_DEMO_WEBHOOK_SECRET,
      enterpriseId: "",
      useDemoEnvironment: "true",
      initialSyncDays: String(MEWS_DEMO_INITIAL_SYNC_DAYS),
    };

    // Sanity check the token against Mews demo before writing.
    // Fails loud if the operator pasted a stale or wrong token.
    const probe = await fetch("https://api.mews-demo.com/api/connector/v1/configuration/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ClientToken: credentials.clientToken,
        AccessToken: credentials.accessToken,
        Client: credentials.clientName,
      }),
    });
    if (!probe.ok) {
      const body = await probe.text().catch(() => "");
      throw new Error(
        `[seed] Mews demo token rejected (HTTP ${probe.status}). ` +
        `Check DEV_MEWS_DEMO_ACCESS_TOKEN. Response: ${body.slice(0, 200)}`,
      );
    }
    const probeJson = await probe.json();
    const enterpriseId = probeJson?.Enterprise?.Id ?? "";
    const enterpriseName = probeJson?.Enterprise?.Name ?? "(unknown)";

    const { encrypted, iv } = encryptCredentials(credentials, encryptionKey);

    await prisma.tenantIntegration.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        provider: "mews",
        credentialsEncrypted: new Uint8Array(encrypted),
        credentialsIv: new Uint8Array(iv),
        status: "active",
        consecutiveFailures: 0,
        externalTenantId: enterpriseId || null,
        isDemoEnvironment: true,
      },
      update: {
        provider: "mews",
        credentialsEncrypted: new Uint8Array(encrypted),
        credentialsIv: new Uint8Array(iv),
        status: "active",
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        externalTenantId: enterpriseId || null,
        isDemoEnvironment: true,
      },
    });
    console.log(`✅ Mews demo integration ready (enterprise="${enterpriseName}", id=${enterpriseId})`);

    // 3. Pull accommodation categories + units from the PMS into the
    // Accommodation / AccommodationCategory tables. Without this step
    // the admin /accommodations page renders empty even though the
    // PMS connection is healthy. Spawned as a tsx subprocess because
    // seed.js is CommonJS and the sync engine is TypeScript.
    const path = require("node:path");
    const { spawnSync } = require("node:child_process");
    const syncScript = path.resolve(__dirname, "..", "scripts", "sync-dev-accommodations.ts");
    const syncResult = spawnSync("npx", ["tsx", syncScript], {
      stdio: "inherit",
      env: process.env,
    });
    if (syncResult.status !== 0) {
      throw new Error(`[seed] sync-dev-accommodations exited with code ${syncResult.status}`);
    }
  } else {
    console.log("ℹ️  DEV_MEWS_DEMO_ACCESS_TOKEN not set — skipping Mews integration seed");
  }

  // 4. Skapa test-booking (som tidigare)
  const existing = await prisma.booking.findFirst({
    where: {
      tenantId: tenant.id,
      guestEmail: "test@exempel.se",
      arrival: new Date("2026-06-01T15:00:00.000Z"),
    },
  });

  if (!existing) {
    await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        firstName: "Test",
        lastName: "Gäst",
        guestEmail: "test@exempel.se",
        phone: "+46700000000",
        street: "Storgatan 1",
        postalCode: "43244",
        city: "Varberg",
        country: "Sweden",
        arrival: new Date("2026-06-01T15:00:00.000Z"),
        departure: new Date("2026-06-05T10:00:00.000Z"),
        unit: "A12",
        status: "PRE_CHECKIN",
      },
    });
    console.log("✅ Test booking created");
  } else {
    console.log("ℹ️  Test booking already exists");
  }

  // 5. System-default PaymentTerms (tenantId = NULL).
  // Idempotent: keyed on (name) among rows where tenantId IS NULL.
  // Prisma upsert requires a compound unique constraint; we cannot use @@unique with a
  // nullable tenantId (Postgres treats NULLs as distinct), so the DB-level uniqueness is
  // enforced by a partial unique index (see migration). Seed mirrors that with findFirst +
  // update/create.
  const systemPaymentTerms = [
    { name: "Förfaller vid mottagning",   type: "DUE_ON_RECEIPT",     netDays: null },
    { name: "Förfaller vid incheckning",  type: "DUE_ON_FULFILLMENT", netDays: null },
    { name: "Netto 7 dagar",              type: "NET",                netDays: 7   },
    { name: "Netto 15 dagar",             type: "NET",                netDays: 15  },
    { name: "Netto 30 dagar",             type: "NET",                netDays: 30  },
    { name: "Netto 45 dagar",             type: "NET",                netDays: 45  },
    { name: "Netto 60 dagar",             type: "NET",                netDays: 60  },
    { name: "Netto 90 dagar",             type: "NET",                netDays: 90  },
  ];

  for (const terms of systemPaymentTerms) {
    const existingTerms = await prisma.paymentTerms.findFirst({
      where: { tenantId: null, name: terms.name },
    });
    if (existingTerms) {
      await prisma.paymentTerms.update({
        where: { id: existingTerms.id },
        data: { type: terms.type, netDays: terms.netDays },
      });
    } else {
      await prisma.paymentTerms.create({
        data: {
          tenantId: null,
          name: terms.name,
          type: terms.type,
          netDays: terms.netDays,
        },
      });
    }
  }
  console.log(`✅ ${systemPaymentTerms.length} system-default PaymentTerms upserted`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
