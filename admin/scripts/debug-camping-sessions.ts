import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // ALL sessions for "Camping 8 m Södra" (accommodationId: cmnq8c95700078cdfkha20idn)
  const sessions = await prisma.checkoutSession.findMany({
    where: {
      tenantId: "cmn342lxz00006yknxx90px3v",
      accommodationId: "cmnq8c95700078cdfkha20idn",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      token: true,
      status: true,
      dedupKey: true,
      ratePlanId: true,
      ratePlanName: true,
      checkIn: true,
      checkOut: true,
      adults: true,
      selectedAddons: true,
      guestEmail: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(`Total sessions for "Camping 8 m Södra": ${sessions.length}\n`);

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const expired = s.expiresAt < new Date();
    const addons = s.selectedAddons as unknown[];
    const addonCount = Array.isArray(addons) ? addons.length : 0;

    // Determine if this was a fresh creation or dedup return
    // A dedup return wouldn't create a new row — so every row here was a fresh creation.
    // But an ABANDONED row means it was replaced by a newer one.
    const wasReplaced = s.status === "ABANDONED";
    const replacedBy = wasReplaced
      ? sessions.find(
          (other) =>
            other.createdAt.getTime() >= s.updatedAt.getTime() - 1000 &&
            other.createdAt.getTime() <= s.updatedAt.getTime() + 1000 &&
            other.id !== s.id,
        )
      : null;

    console.log(`#${i + 1}  ${s.createdAt.toISOString()}  ${s.status}${expired ? " (expired)" : ""}${wasReplaced ? " (replaced)" : ""}`);
    console.log(`    id:          ${s.id}`);
    console.log(`    ratePlanId:  ${s.ratePlanId}`);
    console.log(`    ratePlanName:${s.ratePlanName}`);
    console.log(`    dates:       ${s.checkIn?.toISOString().split("T")[0]} → ${s.checkOut?.toISOString().split("T")[0]}  adults: ${s.adults}`);
    console.log(`    dedupKey:    ${s.dedupKey ?? "(null — cleared on abandon)"}`);
    console.log(`    addons:      ${addonCount} selected`);
    console.log(`    guestEmail:  ${s.guestEmail ?? "(null)"}`);
    console.log(`    createdAt:   ${s.createdAt.toISOString()}`);
    console.log(`    updatedAt:   ${s.updatedAt.toISOString()}`);
    console.log(`    expiresAt:   ${s.expiresAt.toISOString()}`);
    if (replacedBy) {
      console.log(`    → replaced by: #${sessions.indexOf(replacedBy) + 1} (${replacedBy.id})`);
    }
    console.log();
  }

  // Check for any dedupKey collisions across all sessions
  const dedupKeys = sessions.filter(s => s.dedupKey).map(s => s.dedupKey!);
  const dedupCounts = new Map<string, number>();
  for (const k of dedupKeys) {
    dedupCounts.set(k, (dedupCounts.get(k) ?? 0) + 1);
  }
  const collisions = [...dedupCounts.entries()].filter(([, count]) => count > 1);
  if (collisions.length > 0) {
    console.log("⚠ DedupKey collisions (active):");
    for (const [key, count] of collisions) {
      console.log(`  ${key}: ${count} sessions`);
    }
  } else {
    console.log("No dedupKey collisions among active sessions.");
  }

  // Show sessions that were in CHECKOUT status at creation time
  // (status=CHECKOUT means it was created with initialStatus="CHECKOUT" = no addons)
  const directCheckout = sessions.filter(
    s => s.status === "CHECKOUT" && s.selectedAddons !== null &&
      (Array.isArray(s.selectedAddons) ? (s.selectedAddons as unknown[]).length === 0 : true),
  );
  if (directCheckout.length > 0) {
    console.log(`\nSessions that went directly to CHECKOUT (no addons page):`);
    for (const s of directCheckout) {
      console.log(`  #${sessions.indexOf(s) + 1}  ${s.createdAt.toISOString()}  ratePlan: ${s.ratePlanName}  dedupKey: ${s.dedupKey ?? "(null)"}`);
    }
  }

  // Sessions that reached CHECKOUT via addons (have selectedAddons)
  const viaAddons = sessions.filter(
    s => s.status === "CHECKOUT" && Array.isArray(s.selectedAddons) && (s.selectedAddons as unknown[]).length > 0,
  );
  if (viaAddons.length > 0) {
    console.log(`\nSessions that reached CHECKOUT via addons page (have selections):`);
    for (const s of viaAddons) {
      const addons = s.selectedAddons as Array<{ title: string }>;
      console.log(`  #${sessions.indexOf(s) + 1}  ${s.createdAt.toISOString()}  ratePlan: ${s.ratePlanName}  addons: [${addons.map(a => a.title).join(", ")}]`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
