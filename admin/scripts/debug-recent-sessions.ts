import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Get the 5 most recent checkout sessions
  const sessions = await prisma.checkoutSession.findMany({
    where: { tenantId: "cmn342lxz00006yknxx90px3v" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      token: true,
      status: true,
      sessionType: true,
      dedupKey: true,
      accommodationId: true,
      ratePlanId: true,
      ratePlanName: true,
      accommodationName: true,
      accommodationSlug: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      pricePerNight: true,
      totalNights: true,
      accommodationTotal: true,
      currency: true,
      selectedAddons: true,
      guestEmail: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (sessions.length === 0) {
    console.log("No checkout sessions found.");
    return;
  }

  // Group by accommodationId to find pairs
  const byAccommodation = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.accommodationId ?? "null";
    if (!byAccommodation.has(key)) byAccommodation.set(key, []);
    byAccommodation.get(key)!.push(s);
  }

  for (const s of sessions) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`Session #${sessions.indexOf(s) + 1} (${s.status})`);
    console.log(`  id:                ${s.id}`);
    console.log(`  token:             ${s.token.slice(0, 12)}...`);
    console.log(`  status:            ${s.status}`);
    console.log(`  sessionType:       ${s.sessionType}`);
    console.log(`  dedupKey:          ${s.dedupKey ?? "(null)"}`);
    console.log(`  accommodationId:   ${s.accommodationId}`);
    console.log(`  accommodationName: ${s.accommodationName}`);
    console.log(`  accommodationSlug: ${s.accommodationSlug}`);
    console.log(`  ratePlanId:        ${s.ratePlanId}`);
    console.log(`  ratePlanName:      ${s.ratePlanName}`);
    console.log(`  checkIn:           ${s.checkIn?.toISOString().split("T")[0]}`);
    console.log(`  checkOut:          ${s.checkOut?.toISOString().split("T")[0]}`);
    console.log(`  adults:            ${s.adults}`);
    console.log(`  pricePerNight:     ${s.pricePerNight} öre`);
    console.log(`  totalNights:       ${s.totalNights}`);
    console.log(`  accommodationTotal:${s.accommodationTotal} öre`);
    console.log(`  currency:          ${s.currency}`);
    console.log(`  selectedAddons:    ${JSON.stringify(s.selectedAddons)}`);
    console.log(`  guestEmail:        ${s.guestEmail ?? "(null)"}`);
    console.log(`  expiresAt:         ${s.expiresAt.toISOString()}`);
    console.log(`  createdAt:         ${s.createdAt.toISOString()}`);
    console.log(`  updatedAt:         ${s.updatedAt.toISOString()}`);
    console.log(`  expired:           ${s.expiresAt < new Date()}`);

    // Load accommodation and its categoryItems
    if (s.accommodationId) {
      const acc = await prisma.accommodation.findUnique({
        where: { id: s.accommodationId },
        select: {
          name: true,
          status: true,
          categoryItems: {
            select: { categoryId: true, category: { select: { title: true } } },
          },
        },
      });
      if (acc) {
        console.log(`\n  Accommodation state NOW:`);
        console.log(`    name:             ${acc.name}`);
        console.log(`    status:           ${acc.status}`);
        console.log(`    categoryItems:    ${acc.categoryItems.length} → [${acc.categoryItems.map(ci => ci.category.title).join(", ")}]`);
      }
    }

    // Check if this dedupKey matches any other sessions (dedup collision)
    if (s.dedupKey) {
      const dupes = await prisma.checkoutSession.findMany({
        where: { dedupKey: s.dedupKey },
        select: { id: true, status: true, createdAt: true },
      });
      if (dupes.length > 1) {
        console.log(`\n  ⚠ Dedup collision: ${dupes.length} sessions share dedupKey`);
        for (const d of dupes) {
          console.log(`    ${d.id} (${d.status}) created ${d.createdAt.toISOString()}`);
        }
      }
    }

    // Check for orders linked to this session's booking params
    if (s.accommodationId && s.checkIn && s.checkOut) {
      const orders = await prisma.order.findMany({
        where: {
          tenantId: "cmn342lxz00006yknxx90px3v",
          guestEmail: s.guestEmail ?? undefined,
          metadata: { path: ["accommodationId"], equals: s.accommodationId },
        },
        select: { id: true, status: true, orderNumber: true, createdAt: true },
        take: 3,
        orderBy: { createdAt: "desc" },
      });
      if (orders.length > 0) {
        console.log(`\n  Related orders:`);
        for (const o of orders) {
          console.log(`    #${o.orderNumber} (${o.status}) id: ${o.id} created: ${o.createdAt.toISOString()}`);
        }
      }
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`\nTotal sessions: ${sessions.length}`);
  console.log(`By status: ${[...new Set(sessions.map(s => s.status))].map(st => `${st}: ${sessions.filter(s => s.status === st).length}`).join(", ")}`);
  console.log(`By accommodation: ${[...byAccommodation.entries()].map(([k, v]) => `${v[0].accommodationName}: ${v.length}`).join(", ")}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
