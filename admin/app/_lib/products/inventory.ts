"use server";

/**
 * Inventory Service
 * ═════════════════
 * Atomic inventory operations with ledger tracking.
 * Every stock change is recorded in InventoryChange (append-only).
 * Product/Variant.inventoryQuantity is a denormalized cache updated
 * atomically in the same transaction.
 *
 * Key invariants:
 *   - adjustInventory() is the ONLY way to change inventory
 *   - Never update inventoryQuantity directly — always go through this service
 *   - Ledger entries are immutable — never updated, never deleted
 *   - quantityAfter on each entry = running total after that change
 *   - Reservation flow: reserve → purchase (consume) or expire (release)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import type { AdjustInventoryInput } from "./types";
import { AdjustInventorySchema } from "./types";
import type { InventoryChangeReason } from "@prisma/client";

type InventoryResult =
  | { ok: true; quantityAfter: number }
  | { ok: false; error: string };

/**
 * Adjust inventory for a product or variant.
 * Creates an append-only ledger entry and atomically updates the
 * denormalized quantity cache on the product/variant.
 *
 * For purchases: call with reason "PURCHASE" and negative delta.
 * For returns: call with reason "RETURN" and positive delta.
 * For manual adjustments: reason "MANUAL_ADJUSTMENT", any delta.
 *
 * Respects continueSellingWhenOutOfStock — if false and the resulting
 * quantity would go below 0, the operation is rejected.
 */
export async function adjustInventory(
  input: AdjustInventoryInput,
): Promise<InventoryResult> {
  const parsed = AdjustInventorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Valideringsfel" };
  }

  const { productId, variantId, quantityDelta, reason, note, referenceId } = parsed.data;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  // Determine actor (null for system operations like purchases)
  const actorUserId = reason === "MANUAL_ADJUSTMENT"
    ? tenantData.clerkUserId
    : null;

  return prisma.$transaction(async (tx) => {
    if (variantId) {
      // ── Variant-level inventory ──
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId, product: { tenantId } },
      });
      if (!variant) return { ok: false, error: "Varianten hittades inte" };
      if (!variant.trackInventory) return { ok: false, error: "Lagerspårning är inte aktiverat för denna variant" };

      const newQuantity = variant.inventoryQuantity + quantityDelta;

      // Check stock constraint
      if (newQuantity < 0 && !variant.continueSellingWhenOutOfStock) {
        return { ok: false, error: `Otillräckligt lager (har ${variant.inventoryQuantity}, försöker ta ${Math.abs(quantityDelta)})` };
      }

      // Atomic: update quantity + create ledger entry
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          inventoryQuantity: newQuantity,
          version: { increment: 1 },
        },
      });

      await tx.inventoryChange.create({
        data: {
          tenantId,
          productId,
          variantId,
          quantityDelta,
          quantityAfter: newQuantity,
          reason: reason as InventoryChangeReason,
          note: note ?? null,
          actorUserId,
          referenceId: referenceId ?? null,
        },
      });

      return { ok: true, quantityAfter: newQuantity };
    } else {
      // ── Product-level inventory ──
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId },
      });
      if (!product) return { ok: false, error: "Produkten hittades inte" };
      if (!product.trackInventory) return { ok: false, error: "Lagerspårning är inte aktiverat för denna produkt" };

      const newQuantity = product.inventoryQuantity + quantityDelta;

      if (newQuantity < 0 && !product.continueSellingWhenOutOfStock) {
        return { ok: false, error: `Otillräckligt lager (har ${product.inventoryQuantity}, försöker ta ${Math.abs(quantityDelta)})` };
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          inventoryQuantity: newQuantity,
          version: { increment: 1 },
        },
      });

      await tx.inventoryChange.create({
        data: {
          tenantId,
          productId,
          variantId: null,
          quantityDelta,
          quantityAfter: newQuantity,
          reason: reason as InventoryChangeReason,
          note: note ?? null,
          actorUserId,
          referenceId: referenceId ?? null,
        },
      });

      return { ok: true, quantityAfter: newQuantity };
    }
  });
}

/**
 * Reserve inventory for a cart session.
 * Creates a soft lock that expires after TTL.
 * Stock is decremented immediately (optimistic reservation).
 *
 * If the reservation expires without being consumed, the cleanup
 * job releases the stock back.
 */
export async function reserveInventory(input: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  sessionId: string;
  ttlMinutes?: number;
}): Promise<InventoryResult> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  const ttl = input.ttlMinutes ?? 15;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Decrement stock
    const result = await adjustInventoryInTx(tx, {
      tenantId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantityDelta: -input.quantity,
      reason: "RESERVATION",
      note: `Reservation för session ${input.sessionId}`,
      referenceId: input.sessionId,
    });

    if (!result.ok) return result;

    // Create reservation record
    await tx.inventoryReservation.create({
      data: {
        tenantId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        quantity: input.quantity,
        expiresAt,
        sessionId: input.sessionId,
      },
    });

    return result;
  });
}

/**
 * Reserve inventory for a checkout session (no admin auth required).
 * Used by the public checkout API route where there is no Clerk session.
 * Takes an explicit tenantId instead of resolving from auth.
 */
export async function reserveInventoryForTenant(input: {
  tenantId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  sessionId: string;
  ttlMinutes?: number;
}): Promise<InventoryResult> {
  const ttl = input.ttlMinutes ?? 15;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const result = await adjustInventoryInTx(tx, {
      tenantId: input.tenantId,
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantityDelta: -input.quantity,
      reason: "RESERVATION",
      note: `Reservation för checkout ${input.sessionId}`,
      referenceId: input.sessionId,
    });

    if (!result.ok) return result;

    await tx.inventoryReservation.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        quantity: input.quantity,
        expiresAt,
        sessionId: input.sessionId,
      },
    });

    return result;
  });
}

/**
 * Release expired reservations.
 * Called by a periodic cleanup job.
 * Returns stock to inventory for each expired, unconsumed reservation.
 */
export async function releaseExpiredReservations(): Promise<{ released: number }> {
  const now = new Date();

  const expired = await prisma.inventoryReservation.findMany({
    where: { expiresAt: { lt: now }, consumed: false },
  });

  let released = 0;

  for (const res of expired) {
    await prisma.$transaction(async (tx) => {
      // Mark as consumed (prevents double-release)
      const updated = await tx.inventoryReservation.updateMany({
        where: { id: res.id, consumed: false },
        data: { consumed: true },
      });

      if (updated.count === 0) return; // Already consumed

      // Return stock
      await adjustInventoryInTx(tx, {
        tenantId: res.tenantId,
        productId: res.productId,
        variantId: res.variantId,
        quantityDelta: res.quantity,
        reason: "RESERVATION_RELEASED",
        note: `Reservation upphörd (session ${res.sessionId})`,
        referenceId: res.sessionId,
      });

      released++;
    });
  }

  return { released };
}

// ── Transaction helper (exported for webhook/order handlers) ──

export type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Adjust inventory within an existing transaction.
 * Creates an append-only ledger entry and updates denormalized quantity.
 * Exported for use in webhook handlers and order management where
 * the caller owns the transaction.
 */
export async function adjustInventoryInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    tenantId: string;
    productId: string;
    variantId: string | null;
    quantityDelta: number;
    reason: string;
    note: string | null;
    referenceId: string | null;
  },
): Promise<InventoryResult> {
  if (input.variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, productId: input.productId },
    });
    if (!variant) return { ok: false, error: "Varianten hittades inte" };

    const newQty = variant.inventoryQuantity + input.quantityDelta;
    if (newQty < 0 && !variant.continueSellingWhenOutOfStock) {
      return { ok: false, error: "Otillräckligt lager" };
    }

    await tx.productVariant.update({
      where: { id: input.variantId },
      data: { inventoryQuantity: newQty, version: { increment: 1 } },
    });

    await tx.inventoryChange.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        variantId: input.variantId,
        quantityDelta: input.quantityDelta,
        quantityAfter: newQty,
        reason: input.reason as InventoryChangeReason,
        note: input.note,
        referenceId: input.referenceId,
      },
    });

    return { ok: true, quantityAfter: newQty };
  } else {
    const product = await tx.product.findFirst({
      where: { id: input.productId, tenantId: input.tenantId },
    });
    if (!product) return { ok: false, error: "Produkten hittades inte" };

    const newQty = product.inventoryQuantity + input.quantityDelta;
    if (newQty < 0 && !product.continueSellingWhenOutOfStock) {
      return { ok: false, error: "Otillräckligt lager" };
    }

    await tx.product.update({
      where: { id: input.productId },
      data: { inventoryQuantity: newQty, version: { increment: 1 } },
    });

    await tx.inventoryChange.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        variantId: null,
        quantityDelta: input.quantityDelta,
        quantityAfter: newQty,
        reason: input.reason as InventoryChangeReason,
        note: input.note,
        referenceId: input.referenceId,
      },
    });

    return { ok: true, quantityAfter: newQty };
  }
}
