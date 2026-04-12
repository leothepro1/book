import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Most recent session for "Camping 8 m Södra" with "Flex camping" ratePlan
  const session = await prisma.checkoutSession.findFirst({
    where: {
      accommodationId: "cmnq8c95700078cdfkha20idn",
      ratePlanId: { startsWith: "f41acc2f" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!session) {
    console.log("No session found.");
    return;
  }

  console.log("═".repeat(70));
  console.log("SESSION");
  console.log("═".repeat(70));
  for (const [key, value] of Object.entries(session)) {
    if (key === "selectedAddons") {
      console.log(`  ${key}: ${JSON.stringify(value, null, 2)}`);
    } else if (value instanceof Date) {
      console.log(`  ${key}: ${value.toISOString()}`);
    } else {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  const gap = (session.updatedAt.getTime() - session.createdAt.getTime()) / 1000;
  console.log(`\n  create→update gap: ${gap.toFixed(1)}s`);

  // Check for wasRoutedToAddons field existence
  const hasField = "wasRoutedToAddons" in session;
  console.log(`  wasRoutedToAddons field exists: ${hasField}`);
  if (hasField) {
    console.log(`  wasRoutedToAddons value: ${(session as Record<string, unknown>).wasRoutedToAddons}`);
  }

  // Dedup check
  console.log("\n" + "═".repeat(70));
  console.log("DEDUP CHECK");
  console.log("═".repeat(70));

  if (session.dedupKey) {
    const sameDedupKey = await prisma.checkoutSession.findMany({
      where: { dedupKey: session.dedupKey },
      select: { id: true, token: true, status: true, createdAt: true, updatedAt: true },
    });
    console.log(`  Sessions with dedupKey "${session.dedupKey}": ${sameDedupKey.length}`);
    for (const d of sameDedupKey) {
      const isSelf = d.id === session.id ? " ← THIS" : "";
      console.log(`    ${d.id} (${d.status}) created: ${d.createdAt.toISOString()}${isSelf}`);
    }
  } else {
    console.log(`  dedupKey is null — session was abandoned`);
  }

  // Check ALL sessions for this accommodation + ratePlan combo
  console.log("\n" + "═".repeat(70));
  console.log("ALL SESSIONS for same accommodation + ratePlan");
  console.log("═".repeat(70));
  const allSessions = await prisma.checkoutSession.findMany({
    where: {
      accommodationId: "cmnq8c95700078cdfkha20idn",
      ratePlanId: { startsWith: "f41acc2f" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      dedupKey: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      selectedAddons: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(`  Total: ${allSessions.length}`);
  for (const s of allSessions) {
    const addons = Array.isArray(s.selectedAddons) ? (s.selectedAddons as unknown[]).length : 0;
    const g = (s.updatedAt.getTime() - s.createdAt.getTime()) / 1000;
    console.log(`  ${s.createdAt.toISOString()}  ${s.status.padEnd(16)}  dates: ${s.checkIn?.toISOString().split("T")[0]}→${s.checkOut?.toISOString().split("T")[0]}  addons: ${addons}  gap: ${g.toFixed(1)}s  dedupKey: ${s.dedupKey ?? "(null)"}`);
  }

  // Derive initialStatus
  console.log("\n" + "═".repeat(70));
  console.log("INITIAL STATUS DERIVATION");
  console.log("═".repeat(70));
  // Check what hasAddons would be for this accommodation right now
  const acc = await prisma.accommodation.findUnique({
    where: { id: "cmnq8c95700078cdfkha20idn" },
    select: {
      categoryItems: { select: { categoryId: true } },
    },
  });
  const categoryIds = acc?.categoryItems.map(ci => ci.categoryId) ?? [];
  let addonCount = 0;
  if (categoryIds.length > 0) {
    const addonLinks = await prisma.accommodationCategoryAddon.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        collection: {
          select: {
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
    addonCount = addonLinks.filter(
      l => l.collection.status === "ACTIVE" && l.collection.items.length > 0,
    ).length;
  }
  console.log(`  categoryIds: ${categoryIds.length} → addonCount: ${addonCount}`);
  console.log(`  hasAddons: ${addonCount > 0}`);
  console.log(`  initialStatus would be: ${addonCount > 0 ? "PENDING (→ addons page)" : "CHECKOUT (→ direct to payment)"}`);
  console.log(`  actual current status: ${session.status}`);
  console.log(`  selectedAddons count: ${Array.isArray(session.selectedAddons) ? (session.selectedAddons as unknown[]).length : 0}`);

  if (session.status === "CHECKOUT" && Array.isArray(session.selectedAddons) && (session.selectedAddons as unknown[]).length === 0) {
    console.log(`\n  ⚠ Session is CHECKOUT with 0 addons.`);
    console.log(`    If initialStatus was PENDING, the guest skipped addons (clicked Fortsätt immediately).`);
    console.log(`    If initialStatus was CHECKOUT, the session bypassed the addons page entirely.`);
    console.log(`    The ${gap.toFixed(1)}s create→update gap suggests: ${gap < 5 ? "likely bypassed (too fast for addons page)" : gap < 20 ? "possible fast skip" : "normal flow through addons page"}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
