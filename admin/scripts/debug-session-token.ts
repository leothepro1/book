import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TOKEN = "Jci0hszK6y9jhBWVb467CBT-8c6IJfWDLxGnz99nLt4";

async function main() {
  // 1. Full session row
  const session = await prisma.checkoutSession.findUnique({
    where: { token: TOKEN },
  });

  if (!session) {
    console.log("Session not found for token:", TOKEN);
    return;
  }

  console.log("═".repeat(70));
  console.log("SESSION");
  console.log("═".repeat(70));
  // Print every field
  for (const [key, value] of Object.entries(session)) {
    if (key === "selectedAddons") {
      const addons = value as unknown[];
      console.log(`  ${key}: ${JSON.stringify(addons, null, 2)}`);
    } else if (value instanceof Date) {
      console.log(`  ${key}: ${value.toISOString()}`);
    } else {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  // 2. Accommodation details
  if (session.accommodationId) {
    const acc = await prisma.accommodation.findUnique({
      where: { id: session.accommodationId },
      select: {
        id: true,
        name: true,
        nameOverride: true,
        slug: true,
        externalId: true,
        status: true,
        accommodationType: true,
        categoryItems: {
          select: {
            categoryId: true,
            category: { select: { id: true, title: true, pmsRef: true, status: true } },
          },
        },
      },
    });

    console.log("\n" + "═".repeat(70));
    console.log("ACCOMMODATION");
    console.log("═".repeat(70));
    if (acc) {
      console.log(`  name:              ${acc.nameOverride ?? acc.name}`);
      console.log(`  slug:              ${acc.slug}`);
      console.log(`  externalId:        ${acc.externalId}`);
      console.log(`  status:            ${acc.status}`);
      console.log(`  accommodationType: ${acc.accommodationType}`);
      console.log(`  categoryItems:     ${acc.categoryItems.length}`);
      for (const ci of acc.categoryItems) {
        console.log(`    → "${ci.category.title}" (id: ${ci.categoryId}, pmsRef: ${ci.category.pmsRef}, status: ${ci.category.status})`);
      }

      // Check addon links for these categories
      const categoryIds = acc.categoryItems.map(ci => ci.categoryId);
      if (categoryIds.length > 0) {
        const addonLinks = await prisma.accommodationCategoryAddon.findMany({
          where: { categoryId: { in: categoryIds } },
          select: {
            categoryId: true,
            collection: {
              select: {
                title: true,
                status: true,
                items: {
                  where: { product: { status: "ACTIVE", archivedAt: null } },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        });
        const activeLinks = addonLinks.filter(
          l => l.collection.status === "ACTIVE" && l.collection.items.length > 0,
        );
        console.log(`  addonLinks:        ${addonLinks.length} total, ${activeLinks.length} active with products`);
        console.log(`  → hasAddons would be: ${activeLinks.length > 0}`);
        console.log(`  → initialStatus would be: ${activeLinks.length > 0 ? "PENDING" : "CHECKOUT"}`);
      } else {
        console.log(`  addonLinks:        0 (no categoryItems!)`);
        console.log(`  → hasAddons would be: false`);
        console.log(`  → initialStatus would be: CHECKOUT`);
      }
    }
  }

  // 3. Dedup check — any other sessions with same dedupKey?
  console.log("\n" + "═".repeat(70));
  console.log("DEDUP CHECK");
  console.log("═".repeat(70));

  if (session.dedupKey) {
    const sameDedupKey = await prisma.checkoutSession.findMany({
      where: { dedupKey: session.dedupKey },
      select: { id: true, token: true, status: true, createdAt: true },
    });
    console.log(`  Sessions with dedupKey "${session.dedupKey}": ${sameDedupKey.length}`);
    for (const d of sameDedupKey) {
      const isSelf = d.id === session.id ? " ← THIS" : "";
      console.log(`    ${d.id} (${d.status}) created: ${d.createdAt.toISOString()}${isSelf}`);
    }

    // Also check for abandoned sessions that had this dedupKey cleared
    // They would have been updated at approximately the same time this session was created
    const possiblyAbandoned = await prisma.checkoutSession.findMany({
      where: {
        accommodationId: session.accommodationId,
        ratePlanId: session.ratePlanId,
        status: "ABANDONED",
        dedupKey: null,
        updatedAt: {
          gte: new Date(session.createdAt.getTime() - 2000),
          lte: new Date(session.createdAt.getTime() + 2000),
        },
      },
      select: { id: true, token: true, status: true, createdAt: true, updatedAt: true },
    });
    if (possiblyAbandoned.length > 0) {
      console.log(`\n  Sessions abandoned at creation time of this session:`);
      for (const a of possiblyAbandoned) {
        console.log(`    ${a.id} (${a.status}) created: ${a.createdAt.toISOString()} abandoned: ${a.updatedAt.toISOString()}`);
      }
    } else {
      console.log(`  No sessions were abandoned when this one was created → fresh creation, no dedup.`);
    }
  } else {
    console.log(`  dedupKey is null — this session was abandoned.`);
  }

  // 4. Timeline
  console.log("\n" + "═".repeat(70));
  console.log("TIMELINE");
  console.log("═".repeat(70));
  console.log(`  created:  ${session.createdAt.toISOString()}`);
  console.log(`  updated:  ${session.updatedAt.toISOString()}`);
  console.log(`  expires:  ${session.expiresAt.toISOString()}`);
  const createToUpdate = (session.updatedAt.getTime() - session.createdAt.getTime()) / 1000;
  console.log(`  create→update gap: ${createToUpdate.toFixed(1)}s`);
  console.log(`  expired now: ${session.expiresAt < new Date()}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
