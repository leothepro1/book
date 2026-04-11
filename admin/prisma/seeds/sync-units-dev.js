/**
 * One-time dev script: sync AccommodationUnit rows from Mews resources/getAll.
 *
 * Connects to the real Mews API using the dev tenant's stored credentials,
 * fetches all physical resources (rooms/pitches), and upserts AccommodationUnit rows.
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs) && node prisma/seeds/sync-units-dev.js
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

// ── AES-256-GCM decryption (mirrors app/_lib/integrations/crypto.ts) ──

function decryptCredentials(encrypted, iv) {
  const key = Buffer.from(
    (process.env.INTEGRATION_ENCRYPTION_KEY || "").slice(0, 32),
    "utf-8",
  );
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf-8"));
}

// ── Mews API call ──────────────────────────────────────────────

async function mewsPost(baseUrl, endpoint, credentials, body) {
  const url = `${baseUrl}/api/connector/v1/${endpoint}`;
  const fullBody = {
    ClientToken: credentials.clientToken,
    AccessToken: credentials.accessToken,
    Client: credentials.clientName,
    ...body,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullBody),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mews ${endpoint} failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function main() {
  // 1. Find dev tenant with Mews integration
  const integration = await prisma.tenantIntegration.findFirst({
    where: { provider: "mews", status: "active" },
    select: {
      tenantId: true,
      credentialsEncrypted: true,
      credentialsIv: true,
      tenant: { select: { name: true } },
    },
  });

  if (!integration) {
    console.error("No active Mews integration found.");
    process.exit(1);
  }

  console.log(`Tenant: ${integration.tenant.name} (${integration.tenantId})`);
  const tenantId = integration.tenantId;

  // 2. Decrypt credentials
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
    console.error("INTEGRATION_ENCRYPTION_KEY not set in environment.");
    process.exit(1);
  }

  const credentials = decryptCredentials(
    Buffer.from(integration.credentialsEncrypted),
    Buffer.from(integration.credentialsIv),
  );

  const baseUrl = credentials.useDemoEnvironment === "true" || credentials.useDemoEnvironment === true
    ? "https://api.mews-demo.com"
    : "https://api.mews.com";

  console.log(`Mews environment: ${baseUrl}`);

  // 3. Get the Stay service ID
  const servicesRes = await mewsPost(baseUrl, "services/getAll", credentials, {});
  const stayService = servicesRes.Services.find(
    (s) => s.IsActive && s.Type === "Reservable",
  );

  if (!stayService) {
    console.error("No active Reservable service found in Mews.");
    process.exit(1);
  }

  console.log(`Service: ${stayService.Id}`);

  // 4. Fetch all resources + category assignments (physical rooms/pitches)
  const resourcesRes = await mewsPost(baseUrl, "resources/getAll", credentials, {
    ServiceIds: [stayService.Id],
    Extent: { Resources: true, ResourceCategoryAssignments: true },
  });

  const resources = resourcesRes.Resources || [];
  const assignments = resourcesRes.ResourceCategoryAssignments || [];
  console.log(`Mews returned ${resources.length} resources, ${assignments.length} category assignments\n`);

  // Build ResourceId → CategoryId map from assignments
  const resourceToCategory = new Map();
  for (const a of assignments) {
    if (a.IsActive !== false) {
      resourceToCategory.set(a.ResourceId, a.CategoryId);
    }
  }

  // 5. Load accommodations to build CategoryId → accommodationId map
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, externalId: { not: null } },
    select: { id: true, externalId: true, name: true },
  });

  const categoryToAcc = new Map();
  for (const acc of accommodations) {
    categoryToAcc.set(acc.externalId, { id: acc.id, name: acc.name });
  }

  console.log(`${accommodations.length} accommodations with externalId in DB\n`);

  // 6. Delete seeded units with fake UUIDs (from seed-accommodation-units.js)
  //    before upserting real Mews data — prevents name collisions
  const deleted = await prisma.accommodationUnit.deleteMany({
    where: { tenantId },
  });
  if (deleted.count > 0) {
    console.log(`Cleared ${deleted.count} existing unit rows\n`);
  }

  // 7. Upsert AccommodationUnit per resource
  let synced = 0;
  let skipped = 0;

  for (const resource of resources) {
    const categoryId = resourceToCategory.get(resource.Id);

    if (!categoryId) {
      skipped++;
      continue;
    }

    if (resource.IsActive === false) {
      skipped++;
      continue;
    }

    const acc = categoryToAcc.get(categoryId);
    if (!acc) {
      skipped++;
      continue;
    }

    const unitName = resource.Name || resource.Id;

    try {
      await prisma.accommodationUnit.upsert({
        where: {
          tenantId_accommodationId_name: {
            tenantId,
            accommodationId: acc.id,
            name: unitName,
          },
        },
        create: {
          tenantId,
          accommodationId: acc.id,
          name: unitName,
          externalId: resource.Id,
          status: "AVAILABLE",
        },
        update: {
          externalId: resource.Id,
        },
      });
      synced++;
      console.log(`  ✓ ${unitName} → ${acc.name} (${resource.Id.slice(0, 8)}…)`);
    } catch (err) {
      console.error(`  ✗ ${unitName}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
