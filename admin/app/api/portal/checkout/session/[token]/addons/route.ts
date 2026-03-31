export const dynamic = "force-dynamic";

/**
 * PATCH /api/portal/checkout/session/[token]/addons
 * ═════════════════════════════════════════════════
 *
 * Saves addon selections to the checkout session and advances status to CHECKOUT.
 * All pricing computed server-side from DB — never trust client amounts.
 * Empty addons array is valid (guest skipped).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveAddonsForAccommodation } from "@/app/_lib/accommodations/addons";
import { log } from "@/app/_lib/logger";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ADDON_LINE_ITEMS = 20;
const MAX_QUANTITY_PER_VARIANT = 10;

const inputSchema = z.object({
  addons: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().nullable(),
    quantity: z.number().int().min(0).max(MAX_QUANTITY_PER_VARIANT),
  })),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ── Resolve tenant ──────────────────────────────────────────
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }
  const tenantId = tenant.id;

  // ── Parse input ──────────────────────────────────────────────
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // Filter out quantity 0 selections
  const selections = body.addons.filter((a) => a.quantity > 0);

  if (selections.length > MAX_ADDON_LINE_ITEMS) {
    return NextResponse.json(
      { error: "TOO_MANY_ADDONS", message: `Maximalt ${MAX_ADDON_LINE_ITEMS} tillägg.` },
      { status: 400 },
    );
  }

  // ── Load session ────────────────────────────────────────────
  const session = await prisma.checkoutSession.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
      accommodationId: true,
      totalNights: true,
      adults: true,
      currency: true,
    },
  });

  if (!session || session.tenantId !== tenantId) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  if (session.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "SESSION_EXPIRED", message: "Sessionen har löpt ut. Starta om." },
      { status: 409 },
    );
  }

  if (session.status !== "ADDON_SELECTION") {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: `Sessionen har status ${session.status} — tillägg kan inte ändras.` },
      { status: 409 },
    );
  }

  // ── Validate addons server-side ─────────────────────────────
  const selectedAddons: SelectedAddon[] = [];

  if (selections.length > 0) {
    const available = await resolveAddonsForAccommodation(session.accommodationId, tenantId);
    const availableById = new Map(available.map((a) => [a.productId, a]));

    for (const sel of selections) {
      const addon = availableById.get(sel.productId);
      if (!addon) {
        log("warn", "checkout_session.addon_not_available", {
          tenantId,
          sessionId: session.id,
          productId: sel.productId,
        });
        return NextResponse.json(
          { error: "ADDON_NOT_AVAILABLE", message: `Produkt ${sel.productId} är inte tillgänglig som tillägg.` },
          { status: 409 },
        );
      }

      let unitAmount: number;
      let variantTitle: string | null = null;
      let pricingMode = "PER_STAY"; // Default for products without explicit mode

      if (addon.hasVariants) {
        if (!sel.variantId) {
          return NextResponse.json(
            { error: "VARIANT_REQUIRED", message: `Produkt ${addon.title} kräver val av variant.` },
            { status: 400 },
          );
        }

        const variant = addon.variants.find((v) => v.variantId === sel.variantId);
        if (!variant) {
          return NextResponse.json(
            { error: "VARIANT_NOT_FOUND", message: `Variant ${sel.variantId} hittades inte.` },
            { status: 409 },
          );
        }

        if (!variant.available) {
          return NextResponse.json(
            { error: "VARIANT_UNAVAILABLE", message: `${addon.title} (${variant.title}) är slut.` },
            { status: 409 },
          );
        }

        unitAmount = variant.price;
        variantTitle = variant.title;
      } else {
        unitAmount = addon.price;
      }

      // Compute total based on pricing mode, nights, and adults from session snapshot
      let totalAmount: number;
      switch (pricingMode) {
        case "PER_NIGHT":
          totalAmount = unitAmount * sel.quantity * session.totalNights;
          break;
        case "PER_PERSON":
          totalAmount = unitAmount * sel.quantity * session.adults;
          break;
        case "PER_PERSON_PER_NIGHT":
          totalAmount = unitAmount * sel.quantity * session.totalNights * session.adults;
          break;
        default: // PER_STAY
          totalAmount = unitAmount * sel.quantity;
          break;
      }

      selectedAddons.push({
        productId: sel.productId,
        variantId: sel.variantId,
        title: addon.title,
        variantTitle,
        quantity: sel.quantity,
        unitAmount,
        totalAmount,
        pricingMode,
        currency: addon.currency,
      });
    }
  }

  // ── Update session atomically ────────────────────────────────
  await prisma.checkoutSession.update({
    where: { id: session.id },
    data: {
      selectedAddons: JSON.parse(JSON.stringify(selectedAddons)),
      status: "CHECKOUT",
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  log("info", "checkout_session.addons_saved", {
    tenantId,
    sessionId: session.id,
    addonCount: selectedAddons.length,
    addonTotal: selectedAddons.reduce((sum, a) => sum + a.totalAmount, 0),
  });

  return NextResponse.json({
    redirect: `/checkout?session=${token}`,
  });
}
