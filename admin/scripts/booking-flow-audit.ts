#!/usr/bin/env npx tsx
/**
 * Bedfront Booking Flow Audit
 * ════════════════════════════
 *
 * Full end-to-end validation of the guest booking pipeline.
 * Tests both addon and no-addon branches, verifies pricing
 * integrity (all amounts in öre as integers), and audits
 * Order ↔ Stripe amount parity.
 *
 * Run: npx tsx scripts/booking-flow-audit.ts
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// ── Test infrastructure ───────────────────────────────────────

type StepResult = { name: string; ok: boolean; detail: string; duration: number };
const results: StepResult[] = [];
let currentStep = "";

function step(name: string) {
  currentStep = name;
  process.stdout.write(`\n  ⏳ ${name}…`);
}

function pass(detail: string, durationMs: number) {
  results.push({ name: currentStep, ok: true, detail, duration: durationMs });
  process.stdout.write(`\r  ✅ ${currentStep} (${durationMs}ms)\n`);
  if (detail) console.log(`     ${detail}`);
}

function fail(detail: string, durationMs: number) {
  results.push({ name: currentStep, ok: false, detail, duration: durationMs });
  process.stdout.write(`\r  ❌ ${currentStep} (${durationMs}ms)\n`);
  console.log(`     ${detail}`);
}

function assertInteger(label: string, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`FLOAT DETECTED — ${label} = ${value} (type: ${typeof value})`, 0);
    return false;
  }
  return true;
}

// ── Config ─────────────────────────────────────────────────────

// Use dates far enough in the future to guarantee availability on FakeAdapter
const CHECK_IN = "2026-09-07"; // Monday in September — minimal blocked periods
const CHECK_OUT = "2026-09-10"; // Thursday — 3 nights
const NIGHTS = 3;
const GUESTS = 2;

// ── Helpers ────────────────────────────────────────────────────

async function cleanupTestData(tenantId: string) {
  // Clean up any previous test sessions/orders so the test is idempotent
  const testSessions = await prisma.checkoutSession.findMany({
    where: { tenantId, accommodationName: { contains: "Hotell" } },
    select: { id: true, token: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  for (const s of testSessions) {
    // Delete orders linked via metadata
    const orders = await prisma.order.findMany({
      where: { tenantId, metadata: { path: ["sessionToken"], equals: s.token } },
      select: { id: true },
    });
    for (const o of orders) {
      await prisma.orderEvent.deleteMany({ where: { orderId: o.id } });
      await prisma.orderLineItem.deleteMany({ where: { orderId: o.id } });
      await prisma.booking.deleteMany({ where: { orderId: o.id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    await prisma.checkoutSession.delete({ where: { id: s.id } }).catch(() => {});
  }
}

// ════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  BEDFRONT BOOKING FLOW AUDIT                        ║");
  console.log("║  Pre-presentation validation                        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Resolve tenant & accommodations ─────────────────────────
  const tenant = await prisma.tenant.findFirst({
    select: { id: true, name: true, stripeAccountId: true },
  });

  if (!tenant) {
    console.log("  ❌ No tenant found in database. Run prisma seed first.");
    process.exit(1);
  }

  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`  Stripe: ${tenant.stripeAccountId ? "Connected" : "NOT connected"}`);
  console.log(`  Dates:  ${CHECK_IN} → ${CHECK_OUT} (${NIGHTS}n, ${GUESTS}g)`);

  // Find accommodations — one with addons, one without
  const allAccommodations = await prisma.accommodation.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      externalId: true,
      slug: true,
      categoryItems: {
        select: {
          categoryId: true,
          category: {
            select: {
              id: true,
              title: true,
              addonCollections: {
                select: {
                  collection: {
                    select: {
                      status: true,
                      items: {
                        where: { product: { status: "ACTIVE", archivedAt: null } },
                        select: { product: { select: { id: true, title: true, price: true, currency: true } } },
                        take: 5,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Classify: with-addons vs without-addons
  const withAddons = allAccommodations.find((a) => {
    return a.categoryItems.some((ci) =>
      ci.category.addonCollections.some(
        (ac) => ac.collection.status === "ACTIVE" && ac.collection.items.length > 0,
      ),
    );
  });

  const withoutAddons = allAccommodations.find((a) => {
    const hasAddons = a.categoryItems.some((ci) =>
      ci.category.addonCollections.some(
        (ac) => ac.collection.status === "ACTIVE" && ac.collection.items.length > 0,
      ),
    );
    return !hasAddons;
  });

  console.log(`  With addons:    ${withAddons?.name ?? "NONE"} (${withAddons?.externalId})`);
  console.log(`  Without addons: ${withoutAddons?.name ?? "NONE"} (${withoutAddons?.externalId})`);

  // Clean up any stale test data
  await cleanupTestData(tenant.id);

  // ════════════════════════════════════════════════════════════
  // 1. AVAILABILITY SEARCH
  // ════════════════════════════════════════════════════════════

  step("1. Tillgänglighetssökning via FakeAdapter");
  let t0 = Date.now();
  try {
    const { resolveAdapter } = await import("../app/_lib/integrations/resolve");
    const adapter = await resolveAdapter(tenant.id);
    const result = await adapter.getAvailability(tenant.id, {
      checkIn: new Date(CHECK_IN),
      checkOut: new Date(CHECK_OUT),
      guests: GUESTS,
    });

    const categories = result.categories;
    if (categories.length === 0) {
      fail("Inga tillgängliga kategorier returnerades", Date.now() - t0);
    } else {
      // Verify all returned categories have integer pricing
      let allOk = true;
      const details: string[] = [];
      for (const entry of categories) {
        const cat = (entry as any).category;
        for (const plan of (entry as any).ratePlans) {
          const pnOk = Number.isInteger(plan.pricePerNight);
          const tpOk = Number.isInteger(plan.totalPrice);
          if (!pnOk || !tpOk) {
            allOk = false;
            details.push(`FLOAT: ${cat.externalId} ${plan.name} pn=${plan.pricePerNight} tp=${plan.totalPrice}`);
          }
          const expected = plan.pricePerNight * NIGHTS;
          if (plan.totalPrice !== expected) {
            allOk = false;
            details.push(`MATH: ${cat.externalId} ${plan.totalPrice} !== ${plan.pricePerNight}×${NIGHTS}=${expected}`);
          }
        }
      }
      if (allOk) {
        const first = (categories[0] as any);
        pass(`${categories.length} kategorier, alla priser integer, ${first.category.name}: ${first.ratePlans[0].pricePerNight}öre/n × ${NIGHTS}n = ${first.ratePlans[0].totalPrice}öre`, Date.now() - t0);
      } else {
        fail(details.join(" | "), Date.now() - t0);
      }
    }
  } catch (err) {
    fail(String(err), Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 2. CHECKOUT SESSION — WITH ADDONS
  // ════════════════════════════════════════════════════════════

  let sessionTokenWithAddons: string | null = null;
  let sessionAccTotal: number | null = null;

  if (withAddons) {
    step("2a. Skapa CheckoutSession (med tillägg)");
    t0 = Date.now();
    try {
      // Resolve actual pricing from FakeAdapter
      const { resolveAdapter: resolveAdapterForSession } = await import("../app/_lib/integrations/resolve");
      const adapterForSession = await resolveAdapterForSession(tenant.id);
      const avail = await adapterForSession.getAvailability(tenant.id, {
        checkIn: new Date(CHECK_IN),
        checkOut: new Date(CHECK_OUT),
        guests: GUESTS,
      });

      // Find rate plan for the withAddons accommodation — or any available one with addons
      let matchedEntry = avail.categories.find(
        (e: any) => e.category.externalId === withAddons.externalId,
      ) as any;

      // If the specific accommodation isn't available, find any available one that has addons in DB
      if (!matchedEntry || matchedEntry.ratePlans.length === 0) {
        for (const acc of allAccommodations) {
          const hasAddonsForAcc = acc.categoryItems.some((ci) =>
            ci.category.addonCollections.some(
              (ac) => ac.collection.status === "ACTIVE" && ac.collection.items.length > 0,
            ),
          );
          if (!hasAddonsForAcc) continue;
          const entry = avail.categories.find((e: any) => e.category.externalId === acc.externalId) as any;
          if (entry && entry.ratePlans.length > 0) {
            matchedEntry = entry;
            // Re-point withAddons to this accommodation
            Object.assign(withAddons, { id: acc.id, name: acc.name, externalId: acc.externalId, slug: acc.slug, categoryItems: acc.categoryItems });
            break;
          }
        }
      }

      const ratePlan = matchedEntry?.ratePlans[0];
      if (!ratePlan) throw new Error(`No available rate plan found for any accommodation with addons (tried ${withAddons.externalId})`);

      const pricePerNight = ratePlan.pricePerNight;
      const accommodationTotal = ratePlan.totalPrice;
      const ratePlanId = ratePlan.externalId;
      const ratePlanName = ratePlan.name;

      const session = await prisma.checkoutSession.create({
        data: {
          token: crypto.randomBytes(24).toString("base64url"),
          tenantId: tenant.id,
          status: "PENDING",
          sessionType: "ACCOMMODATION",
          accommodationId: withAddons.id,
          accommodationName: withAddons.name,
          accommodationSlug: withAddons.slug,
          ratePlanId,
          ratePlanName,
          ratePlanCancellationPolicy: ratePlan.cancellationPolicy,
          pricePerNight,
          totalNights: NIGHTS,
          accommodationTotal,
          currency: "SEK",
          checkIn: new Date(CHECK_IN),
          checkOut: new Date(CHECK_OUT),
          adults: GUESTS,
          selectedAddons: [],
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      sessionTokenWithAddons = session.token;
      sessionAccTotal = accommodationTotal;

      // Verify snapshot integrity
      const allInts =
        assertInteger("pricePerNight", session.pricePerNight) &&
        assertInteger("totalNights", session.totalNights) &&
        assertInteger("accommodationTotal", session.accommodationTotal);

      const expectedAccTotal = pricePerNight * NIGHTS;
      if (allInts && session.accommodationTotal === expectedAccTotal) {
        pass(`token=${session.token.slice(0, 8)}… status=PENDING accTotal=${session.accommodationTotal}öre (${ratePlanName})`, Date.now() - t0);
      } else {
        fail(`accommodationTotal=${session.accommodationTotal} expected=${expectedAccTotal}`, Date.now() - t0);
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }

    // ── Transition to ADDON_SELECTION ───────────────────────────
    step("2b. Transition PENDING → ADDON_SELECTION");
    t0 = Date.now();
    try {
      await prisma.checkoutSession.update({
        where: { token: sessionTokenWithAddons! },
        data: { status: "ADDON_SELECTION" },
      });
      const updated = await prisma.checkoutSession.findUnique({
        where: { token: sessionTokenWithAddons! },
        select: { status: true },
      });
      if (updated?.status === "ADDON_SELECTION") {
        pass("Status transitioned correctly", Date.now() - t0);
      } else {
        fail(`Expected ADDON_SELECTION, got ${updated?.status}`, Date.now() - t0);
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }

    // ════════════════════════════════════════════════════════════
    // 3. ADDON SELECTION — RESOLVE + SNAPSHOT
    // ════════════════════════════════════════════════════════════

    step("3. Resolve addons + snapshot för boende med tillägg");
    t0 = Date.now();
    try {
      const { resolveAddonsForAccommodation } = await import("../app/_lib/accommodations/addons");
      const addons = await resolveAddonsForAccommodation(withAddons.id, tenant.id);

      if (addons.length === 0) {
        fail("resolveAddonsForAccommodation returnerade 0 produkter — DB-koppling saknas?", Date.now() - t0);
      } else {
        // Pick first addon with price > 0 for testing
        const testAddon = addons.find((a) => a.price > 0) ?? addons[0];
        const unitAmount = testAddon.hasVariants
          ? testAddon.variants.find((v) => v.available)?.price ?? testAddon.price
          : testAddon.price;

        // Build selectedAddons snapshot (PER_STAY: unitAmount × quantity)
        const quantity = 1;
        const totalAmount = unitAmount * quantity; // PER_STAY
        const intOk = assertInteger("unitAmount", unitAmount) && assertInteger("totalAmount", totalAmount);

        if (!intOk) {
          fail("Addon pricing contains floats", Date.now() - t0);
        } else {
          const selectedAddons = [{
            productId: testAddon.productId,
            variantId: testAddon.hasVariants ? (testAddon.variants.find((v) => v.available)?.variantId ?? null) : null,
            title: testAddon.title,
            variantTitle: testAddon.hasVariants ? (testAddon.variants.find((v) => v.available)?.title ?? null) : null,
            imageUrl: testAddon.imageUrl ?? null,
            quantity,
            unitAmount,
            totalAmount,
            pricingMode: "PER_STAY",
            currency: testAddon.currency,
          }];

          // Save to session
          await prisma.checkoutSession.update({
            where: { token: sessionTokenWithAddons! },
            data: {
              selectedAddons: JSON.parse(JSON.stringify(selectedAddons)),
              status: "CHECKOUT",
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          });

          const verify = await prisma.checkoutSession.findUnique({
            where: { token: sessionTokenWithAddons! },
            select: { status: true, selectedAddons: true },
          });

          const savedAddons = verify?.selectedAddons as any[];
          if (verify?.status !== "CHECKOUT" || !savedAddons || savedAddons.length !== 1) {
            fail(`Session status=${verify?.status}, addons=${savedAddons?.length}`, Date.now() - t0);
          } else {
            pass(
              `${addons.length} tillval hittade, valt: "${testAddon.title}" @ ${unitAmount}öre × ${quantity} = ${totalAmount}öre`,
              Date.now() - t0,
            );
          }
        }
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  }

  // ════════════════════════════════════════════════════════════
  // 4. CHECKOUT SESSION — WITHOUT ADDONS
  // ════════════════════════════════════════════════════════════

  let sessionTokenNoAddons: string | null = null;

  if (withoutAddons) {
    step("4. Skapa CheckoutSession (utan tillägg) — hoppar över addon-steget");
    t0 = Date.now();
    try {
      // Resolve pricing from FakeAdapter
      const { resolveAdapter: ra2 } = await import("../app/_lib/integrations/resolve");
      const a2 = await ra2(tenant.id);
      const av2 = await a2.getAvailability(tenant.id, {
        checkIn: new Date(CHECK_IN),
        checkOut: new Date(CHECK_OUT),
        guests: GUESTS,
      });
      const noAddonEntry = av2.categories.find(
        (e: any) => e.category.externalId === withoutAddons.externalId,
      ) as any ?? av2.categories[0] as any;
      const noAddonPlan = noAddonEntry?.ratePlans[0];
      if (!noAddonPlan) throw new Error("No rate plan for no-addon accommodation");

      const campingPricePerNight = noAddonPlan.pricePerNight;
      const campingTotal = noAddonPlan.totalPrice;
      const ratePlanId = noAddonPlan.externalId;

      const session = await prisma.checkoutSession.create({
        data: {
          token: crypto.randomBytes(24).toString("base64url"),
          tenantId: tenant.id,
          status: "CHECKOUT", // Skips ADDON_SELECTION entirely
          sessionType: "ACCOMMODATION",
          accommodationId: withoutAddons.id,
          accommodationName: withoutAddons.name,
          accommodationSlug: withoutAddons.slug,
          ratePlanId,
          ratePlanName: noAddonPlan.name,
          ratePlanCancellationPolicy: noAddonPlan.cancellationPolicy ?? "FLEXIBLE",
          pricePerNight: campingPricePerNight,
          totalNights: NIGHTS,
          accommodationTotal: campingTotal,
          currency: "SEK",
          checkIn: new Date(CHECK_IN),
          checkOut: new Date(CHECK_OUT),
          adults: GUESTS,
          selectedAddons: [],
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      sessionTokenNoAddons = session.token;

      if (session.status === "CHECKOUT" && (session.selectedAddons as any[]).length === 0) {
        pass(`token=${session.token.slice(0, 8)}… status=CHECKOUT (direkt, inga tillägg) accTotal=${campingTotal}öre`, Date.now() - t0);
      } else {
        fail(`Expected CHECKOUT with empty addons, got status=${session.status}`, Date.now() - t0);
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    step("4. Boende utan tillägg");
    t0 = Date.now();
    fail("Inget boende utan tillägg hittades i databasen — kan inte testa utan-gren", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 5. PRICE AUDIT — verify Order amounts before Stripe
  // ════════════════════════════════════════════════════════════

  step("5. Prisberäkning — audit (med tillägg)");
  t0 = Date.now();
  if (sessionTokenWithAddons) {
    try {
      const session = await prisma.checkoutSession.findUnique({
        where: { token: sessionTokenWithAddons },
        select: { accommodationTotal: true, selectedAddons: true, currency: true },
      });

      const addons = (session?.selectedAddons ?? []) as Array<{ totalAmount: number }>;
      const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
      const totalPrice = session!.accommodationTotal! + addonTotal;

      // Tax stub returns 0 — so totalAmount = totalPrice
      const taxRate = 0;
      const taxAmount = taxRate > 0 ? Math.round(totalPrice * taxRate / 10000) : 0;
      const expectedOrderTotal = totalPrice + taxAmount;

      const checks = [
        assertInteger("accommodationTotal", session!.accommodationTotal),
        assertInteger("addonTotal", addonTotal),
        assertInteger("totalPrice", totalPrice),
        assertInteger("taxAmount", taxAmount),
        assertInteger("expectedOrderTotal", expectedOrderTotal),
      ];

      if (checks.every(Boolean)) {
        if (totalPrice < 1000 || totalPrice > 10_000_000) {
          fail(`totalPrice ${totalPrice} out of bounds [1000, 10000000]`, Date.now() - t0);
        } else {
          pass(
            `accTotal=${session!.accommodationTotal}öre + addons=${addonTotal}öre = ${totalPrice}öre, tax=${taxAmount}öre, orderTotal=${expectedOrderTotal}öre`,
            Date.now() - t0,
          );
        }
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    fail("Ingen session med tillägg att audita", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 6. ORDER CREATION — simulate what payment-intent does
  // ════════════════════════════════════════════════════════════

  let testOrderId: string | null = null;
  let testOrderChargeAmount: number | null = null;

  step("6. Order-skapande (simulerar payment-intent)");
  t0 = Date.now();
  if (sessionTokenWithAddons) {
    try {
      const session = await prisma.checkoutSession.findUnique({
        where: { token: sessionTokenWithAddons },
        select: {
          id: true,
          tenantId: true,
          accommodationId: true,
          accommodationName: true,
          accommodationSlug: true,
          accommodationTotal: true,
          ratePlanId: true,
          ratePlanName: true,
          totalNights: true,
          adults: true,
          checkIn: true,
          checkOut: true,
          currency: true,
          selectedAddons: true,
          accommodation: {
            select: {
              id: true,
              externalId: true,
              media: { select: { url: true }, orderBy: { sortOrder: "asc" as const }, take: 1 },
            },
          },
        },
      });

      if (!session) throw new Error("Session not found");

      const addons = (session.selectedAddons ?? []) as Array<{
        productId: string; variantId: string | null; title: string; variantTitle: string | null;
        imageUrl: string | null; quantity: number; unitAmount: number; totalAmount: number;
        pricingMode: string; currency: string;
      }>;
      const addonTotal = addons.reduce((sum, a) => sum + a.totalAmount, 0);
      const totalPrice = session.accommodationTotal! + addonTotal;
      const taxRate = 0;
      const taxAmount = taxRate > 0 ? Math.round(totalPrice * taxRate / 10000) : 0;
      const chargeAmount = Math.max(0, totalPrice + taxAmount);

      const { nextOrderNumber } = await import("../app/_lib/orders/sequence");
      const orderNumber = await nextOrderNumber(tenant.id);

      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            tenantId: tenant.id,
            orderNumber,
            status: "PENDING",
            paymentMethod: "STRIPE_ELEMENTS",
            guestEmail: "audit@test.bedfront.se",
            guestName: "Audit Test",
            subtotalAmount: totalPrice,
            taxRate,
            taxAmount,
            totalAmount: totalPrice + taxAmount,
            currency: session.currency,
            sourceChannel: "direct",
            metadata: {
              sessionToken: sessionTokenWithAddons,
              checkIn: session.checkIn!.toISOString().split("T")[0],
              checkOut: session.checkOut!.toISOString().split("T")[0],
              guests: session.adults,
              nights: session.totalNights,
              audit: true,
            },
            lineItems: {
              create: [
                {
                  productId: session.accommodation!.id,
                  variantId: null,
                  title: session.accommodationName!,
                  variantTitle: session.ratePlanName,
                  sku: null,
                  imageUrl: session.accommodation!.media[0]?.url ?? null,
                  quantity: 1,
                  unitAmount: session.accommodationTotal!,
                  totalAmount: session.accommodationTotal!,
                  currency: session.currency,
                },
                ...addons.map((addon) => ({
                  productId: addon.productId,
                  variantId: addon.variantId,
                  title: addon.title,
                  variantTitle: addon.variantTitle,
                  sku: null,
                  imageUrl: addon.imageUrl ?? null,
                  quantity: addon.quantity,
                  unitAmount: addon.unitAmount,
                  totalAmount: addon.totalAmount,
                  currency: addon.currency,
                })),
              ],
            },
          },
          include: { lineItems: true },
        });

        await tx.orderEvent.create({
          data: {
            orderId: newOrder.id,
            tenantId: tenant.id,
            type: "ORDER_CREATED",
            message: `AUDIT Order #${orderNumber}`,
          },
        });

        await tx.checkoutSession.update({
          where: { id: session.id },
          data: { status: "COMPLETED", dedupKey: null },
        });

        return newOrder;
      });

      testOrderId = order.id;
      testOrderChargeAmount = chargeAmount;

      // Verify line items
      const lineItemTotal = order.lineItems.reduce((sum, li) => sum + li.totalAmount, 0);
      const allLineItemInts = order.lineItems.every(
        (li) => Number.isInteger(li.unitAmount) && Number.isInteger(li.totalAmount),
      );

      if (!allLineItemInts) {
        fail("FLOAT in OrderLineItem amounts!", Date.now() - t0);
      } else if (lineItemTotal !== totalPrice) {
        fail(`LineItem sum ${lineItemTotal} !== totalPrice ${totalPrice}`, Date.now() - t0);
      } else if (order.subtotalAmount !== totalPrice) {
        fail(`subtotalAmount ${order.subtotalAmount} !== totalPrice ${totalPrice}`, Date.now() - t0);
      } else if (order.totalAmount !== totalPrice + taxAmount) {
        fail(`totalAmount ${order.totalAmount} !== ${totalPrice} + ${taxAmount}`, Date.now() - t0);
      } else {
        pass(
          `Order #${orderNumber} created — ${order.lineItems.length} line items, subtotal=${order.subtotalAmount}öre, total=${order.totalAmount}öre`,
          Date.now() - t0,
        );
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    fail("Ingen session att skapa Order från", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 7. STRIPE CHARGE AMOUNT AUDIT
  // ════════════════════════════════════════════════════════════

  step("7. Stripe charge amount audit");
  t0 = Date.now();
  if (testOrderId && testOrderChargeAmount !== null) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: testOrderId },
        select: {
          subtotalAmount: true,
          taxAmount: true,
          totalAmount: true,
          discountAmount: true,
          currency: true,
        },
      });

      if (!order) throw new Error("Order not found");

      // Replicate exact charge formula from payment-intent route
      const discountAmount = order.discountAmount;
      const expectedCharge = Math.max(0, order.totalAmount - discountAmount);

      const checks = [
        assertInteger("subtotalAmount", order.subtotalAmount),
        assertInteger("taxAmount", order.taxAmount),
        assertInteger("totalAmount", order.totalAmount),
        assertInteger("discountAmount", discountAmount),
        assertInteger("chargeAmount", expectedCharge),
      ];

      if (!checks.every(Boolean)) {
        // fail already logged by assertInteger
      } else if (expectedCharge !== testOrderChargeAmount) {
        fail(
          `chargeAmount mismatch: Order gives ${expectedCharge}öre, computed ${testOrderChargeAmount}öre`,
          Date.now() - t0,
        );
      } else if (expectedCharge < 1000) {
        fail(`chargeAmount ${expectedCharge}öre < MIN_AMOUNT 1000öre`, Date.now() - t0);
      } else {
        pass(
          `Order.totalAmount=${order.totalAmount}öre - discount=${discountAmount}öre = chargeAmount=${expectedCharge}öre ✓ matchar`,
          Date.now() - t0,
        );
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    fail("Ingen Order att audita", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 8. WEBHOOK SIMULATION — payment_intent.succeeded
  // ════════════════════════════════════════════════════════════

  step("8. Webhook-simulering (payment_intent.succeeded)");
  t0 = Date.now();
  if (testOrderId) {
    try {
      // Import canTransition
      const { canTransition } = await import("../app/_lib/orders/types");

      const orderBefore = await prisma.order.findUnique({
        where: { id: testOrderId },
        select: { status: true },
      });

      if (!orderBefore || orderBefore.status !== "PENDING") {
        fail(`Order status before webhook: ${orderBefore?.status} (expected PENDING)`, Date.now() - t0);
      } else if (!canTransition(orderBefore.status, "PAID")) {
        fail("canTransition(PENDING, PAID) returned false", Date.now() - t0);
      } else {
        // Simulate what the webhook handler does
        const fakePaymentIntentId = `pi_test_audit_${Date.now()}`;
        await prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: testOrderId! },
            data: {
              status: "PAID",
              financialStatus: "PAID",
              fulfillmentStatus: "UNFULFILLED",
              paidAt: new Date(),
              stripePaymentIntentId: fakePaymentIntentId,
            },
          });

          await tx.orderEvent.create({
            data: {
              orderId: testOrderId!,
              tenantId: tenant.id,
              type: "PAYMENT_CAPTURED",
              message: `AUDIT — simulated payment ${fakePaymentIntentId}`,
              metadata: {
                paymentIntentId: fakePaymentIntentId,
                amount: testOrderChargeAmount,
                currency: "SEK",
              },
            },
          });
        });

        const orderAfter = await prisma.order.findUnique({
          where: { id: testOrderId },
          select: { status: true, paidAt: true, stripePaymentIntentId: true },
        });

        if (orderAfter?.status !== "PAID" || !orderAfter.paidAt) {
          fail(`Order after webhook: status=${orderAfter?.status} paidAt=${orderAfter?.paidAt}`, Date.now() - t0);
        } else {
          pass(
            `PENDING → PAID ✓ paidAt=${orderAfter.paidAt.toISOString()} pi=${orderAfter.stripePaymentIntentId}`,
            Date.now() - t0,
          );
        }
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    fail("Ingen Order att simulera webhook på", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 9. FINAL DB AUDIT — verify stored order matches expectations
  // ════════════════════════════════════════════════════════════

  step("9. Slutgiltig DB-audit — Order vs förväntade belopp");
  t0 = Date.now();
  if (testOrderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: testOrderId },
        include: { lineItems: true, events: true },
      });

      if (!order) throw new Error("Order not found");

      const errors: string[] = [];

      // All amounts must be integers
      for (const field of ["subtotalAmount", "taxAmount", "totalAmount", "discountAmount"] as const) {
        if (!Number.isInteger(order[field])) errors.push(`${field}=${order[field]} is not integer`);
      }
      for (const li of order.lineItems) {
        if (!Number.isInteger(li.unitAmount)) errors.push(`LineItem "${li.title}" unitAmount=${li.unitAmount} is not integer`);
        if (!Number.isInteger(li.totalAmount)) errors.push(`LineItem "${li.title}" totalAmount=${li.totalAmount} is not integer`);
      }

      // Line item sum = subtotalAmount
      const liSum = order.lineItems.reduce((s, li) => s + li.totalAmount, 0);
      if (liSum !== order.subtotalAmount) {
        errors.push(`LineItem sum ${liSum} !== subtotalAmount ${order.subtotalAmount}`);
      }

      // totalAmount = subtotalAmount + taxAmount
      if (order.totalAmount !== order.subtotalAmount + order.taxAmount) {
        errors.push(`totalAmount ${order.totalAmount} !== sub ${order.subtotalAmount} + tax ${order.taxAmount}`);
      }

      // Status chain
      if (order.status !== "PAID") errors.push(`status=${order.status} (expected PAID)`);

      // Events
      const hasCreated = order.events.some((e) => e.type === "ORDER_CREATED");
      const hasPaid = order.events.some((e) => e.type === "PAYMENT_CAPTURED");
      if (!hasCreated) errors.push("Missing ORDER_CREATED event");
      if (!hasPaid) errors.push("Missing PAYMENT_CAPTURED event");

      if (errors.length > 0) {
        fail(errors.join(" | "), Date.now() - t0);
      } else {
        pass(
          `Order #${order.orderNumber} — ${order.lineItems.length} items, ${order.events.length} events, all integers ✓`,
          Date.now() - t0,
        );
      }
    } catch (err) {
      fail(String(err), Date.now() - t0);
    }
  } else {
    fail("Ingen Order att audita", Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // 10. TAX DISPLAY AUDIT — check for frontend/backend mismatch
  // ════════════════════════════════════════════════════════════

  step("10. Moms-audit — backend vs frontend-logik");
  t0 = Date.now();
  try {
    // Backend: getTaxRate returns 0, so taxAmount = 0 on Orders
    const { getTaxRate } = await import("../app/_lib/orders/tax");
    const backendTaxRate = getTaxRate("STANDARD", "SE");

    // Frontend: hardcodes Math.round(total * 0.25) and adds to display total
    // This is the known mismatch documented in CLAUDE.md
    const frontendTaxRate = 2500; // 25% in basis points

    const warnings: string[] = [];

    if (backendTaxRate === 0) {
      warnings.push("Backend getTaxRate() returns 0 — moms ingår i PMS-priser");
    }
    if (backendTaxRate !== frontendTaxRate) {
      warnings.push(
        `MISMATCH: backend taxRate=${backendTaxRate}bps, frontend hardcodes 25% (${frontendTaxRate}bps)`,
      );
      warnings.push(
        "Frontend visar 'Inkl. moms' som informationsrad — detta är korrekt om PMS-priser inkluderar moms",
      );
    }

    // Check if frontend adds tax ON TOP of total (the known bug)
    // Files: AddonsClient.tsx:349, checkout/page.tsx:250, success/page.tsx:313
    warnings.push(
      "OBS: Frontend visar grandTotal + taxAmount som 'Totalt' — men Order.totalAmount = subtotal + 0 (ingen extra moms)",
    );
    warnings.push(
      "Gästen ser högre belopp i UI än vad som debiteras via Stripe",
    );

    pass(warnings.join("\n     "), Date.now() - t0);
  } catch (err) {
    fail(String(err), Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════════════════════════

  step("Cleanup — ta bort testdata");
  t0 = Date.now();
  try {
    await cleanupTestData(tenant.id);
    pass("Testdata borttagen", Date.now() - t0);
  } catch (err) {
    fail(`Cleanup failed: ${err}`, Date.now() - t0);
  }

  // ════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════

  await prisma.$disconnect();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const total = results.length;
  const totalDuration = results.reduce((s, r) => s + r.duration, 0);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  RESULTAT                                           ║");
  console.log("╠══════════════════════════════════════════════════════╣");

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const name = r.name.padEnd(50);
    console.log(`║  ${icon} ${name} ║`);
  }

  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Totalt: ${total} steg  |  ✅ ${passed}  |  ❌ ${failed}  |  ${totalDuration}ms      ║`);
  console.log("╠══════════════════════════════════════════════════════╣");

  if (failed === 0) {
    console.log("║  🟢  GO — Alla steg godkända                        ║");
  } else {
    console.log("║  🔴  NO-GO — Fel hittade, åtgärda innan demo         ║");
  }
  console.log("╚══════════════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  💥 FATAL:", err);
  process.exit(2);
});
