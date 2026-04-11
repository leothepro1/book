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
import { resolveMarkerPrice } from "@/app/_lib/apps/spot-booking/pricing";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { log } from "@/app/_lib/logger";
import type { SelectedAddon } from "@/app/_lib/checkout/session-types";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ADDON_LINE_ITEMS = 20;
const MAX_QUANTITY_PER_VARIANT = 10;

const regularAddonSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable(),
  quantity: z.number().int().min(0).max(MAX_QUANTITY_PER_VARIANT),
});

const spotAddonSchema = z.object({
  type: z.literal("spot_map"),
  spotMarkerId: z.string().min(1),
  accommodationId: z.string().min(1),
  label: z.string().min(1),
  quantity: z.literal(1),
});

const addonEntrySchema = z.union([spotAddonSchema, regularAddonSchema]);

const inputSchema = z.object({
  addons: z.array(addonEntrySchema),
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

  // Separate regular addons and spot map entries
  const regularSelections: z.infer<typeof regularAddonSchema>[] = [];
  const spotSelections: z.infer<typeof spotAddonSchema>[] = [];

  for (const entry of body.addons) {
    if ("type" in entry && entry.type === "spot_map") {
      spotSelections.push(entry as z.infer<typeof spotAddonSchema>);
    } else {
      const reg = entry as z.infer<typeof regularAddonSchema>;
      if (reg.quantity > 0) regularSelections.push(reg);
    }
  }

  const selections = regularSelections;

  if (selections.length + spotSelections.length > MAX_ADDON_LINE_ITEMS) {
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
      checkIn: true,
      checkOut: true,
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

  if (session.status !== "ADDON_SELECTION" && session.status !== "CHECKOUT") {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: `Sessionen har status ${session.status} — tillägg kan inte ändras.` },
      { status: 409 },
    );
  }

  // ── Validate addons server-side ─────────────────────────────
  const selectedAddons: SelectedAddon[] = [];

  if (selections.length > 0) {
    const available = await resolveAddonsForAccommodation(session.accommodationId!, tenantId);
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
          totalAmount = unitAmount * sel.quantity * session.totalNights!;
          break;
        case "PER_PERSON":
          totalAmount = unitAmount * sel.quantity * session.adults!;
          break;
        case "PER_PERSON_PER_NIGHT":
          totalAmount = unitAmount * sel.quantity * session.totalNights! * session.adults!;
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
        imageUrl: addon.imageUrl ?? null,
        quantity: sel.quantity,
        unitAmount,
        totalAmount,
        pricingMode,
        currency: addon.currency,
      });
    }
  }

  // ── Validate spot_map selections ─────────────────────────────

  // Pre-load all spot markers in one pass, then batch availability check
  const spotMarkers = await Promise.all(
    spotSelections.map((spotSel) =>
      prisma.spotMarker.findFirst({
        where: { id: spotSel.spotMarkerId, tenantId },
        select: {
          id: true,
          label: true,
          accommodationId: true,
          priceOverride: true,
          unit: { select: { externalId: true } },
          spotMap: {
            select: {
              id: true,
              isActive: true,
              imageUrl: true,
              addonPrice: true,
              currency: true,
            },
          },
        },
      }),
    ),
  );

  // Batch-resolve per-unit availability via PMS adapter
  const spotExternalIds = spotMarkers
    .filter((m): m is NonNullable<typeof m> => m != null && m.spotMap.isActive)
    .map((m) => m.unit?.externalId)
    .filter((id): id is string => id != null);

  let spotUnitAvailability = new Map<string, boolean>();
  if (spotExternalIds.length > 0 && session.checkIn && session.checkOut) {
    const checkInDate = new Date(session.checkIn.toISOString().split("T")[0] + "T00:00:00");
    const checkOutDate = new Date(session.checkOut.toISOString().split("T")[0] + "T00:00:00");
    const adapter = await resolveAdapter(tenantId);
    spotUnitAvailability = await adapter.getUnitAvailability(
      tenantId,
      spotExternalIds,
      checkInDate,
      checkOutDate,
    );
  }

  for (let i = 0; i < spotSelections.length; i++) {
    const spotSel = spotSelections[i];
    const marker = spotMarkers[i];

    if (!marker || !marker.spotMap.isActive) {
      return NextResponse.json(
        { error: "SPOT_NOT_FOUND", code: "SPOT_UNAVAILABLE", label: spotSel.label },
        { status: 409 },
      );
    }

    // Verify the spot map is linked to the session's accommodation
    const mapLink = await prisma.spotMapAccommodation.findFirst({
      where: {
        spotMapId: marker.spotMap.id,
        accommodationId: session.accommodationId!,
      },
      select: { id: true },
    });

    if (!mapLink) {
      return NextResponse.json(
        { error: "SPOT_MAP_MISMATCH", code: "SPOT_UNAVAILABLE", label: marker.label },
        { status: 409 },
      );
    }

    // Re-validate availability using per-unit PMS adapter check.
    // unit.externalId is a Mews Resource.Id (physical unit), not a ResourceCategory.Id.
    // If no unit is assigned or unit has no externalId, skip availability check (fail open).
    if (marker.unit?.externalId) {
      const available = spotUnitAvailability.get(marker.unit.externalId) ?? true;

      if (!available) {
        return NextResponse.json(
          { error: "SPOT_UNAVAILABLE", code: "SPOT_UNAVAILABLE", label: marker.label },
          { status: 409 },
        );
      }
    }

    // Build SelectedAddon snapshot for spot — resolve per-marker price
    const spotPrice = resolveMarkerPrice(marker.priceOverride, marker.spotMap.addonPrice);
    selectedAddons.push({
      productId: `spot-map:${marker.spotMap.id}`,
      variantId: marker.id,
      title: `Plats ${marker.label}`,
      variantTitle: null,
      imageUrl: marker.spotMap.imageUrl ?? null,
      quantity: 1,
      unitAmount: spotPrice,
      totalAmount: spotPrice, // PER_STAY — fixed fee
      pricingMode: "PER_STAY",
      currency: marker.spotMap.currency,
    });
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
