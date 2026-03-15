"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { resolveAdapter } from "../resolve";
import { resolveLockAdapter } from "./resolve";
import { computeKeyValidity } from "./computeKeyValidity";
import type { NormalizedKey } from "./types";

// ── createGuestKey ──────────────────────────────────────────

export async function createGuestKey(
  bookingId: string,
  tenantId: string,
): Promise<{ ok: true; key: NormalizedKey } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  try {
    // Idempotent — return existing active key if one exists
    const existing = await prisma.digitalKey.findUnique({
      where: { tenantId_bookingId: { tenantId, bookingId } },
    });

    if (existing && existing.status === "active") {
      return {
        ok: true,
        key: {
          keyId: existing.keyId,
          provider: existing.provider,
          validFrom: existing.validFrom,
          validTo: existing.validTo,
          status: "active",
          walletPayload: existing.walletPayload as NormalizedKey["walletPayload"],
          portalPayload: existing.portalPayload as NormalizedKey["portalPayload"],
        },
      };
    }

    // Fetch booking from PMS adapter
    const pmsAdapter = await resolveAdapter(tenantId);
    const booking = await pmsAdapter.getBooking(tenantId, bookingId);
    if (!booking) {
      return { ok: false, error: "Bokningen hittades inte" };
    }

    // Get tenant config for check-in/check-out times
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const property = (settings.property ?? {}) as Record<string, string>;

    const { validFrom, validTo } = computeKeyValidity(booking, {
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      timezone: property.timezone,
    });

    // Get lock integration for relation
    const lockIntegration = await prisma.tenantLockIntegration.findUnique({
      where: { tenantId },
    });
    if (!lockIntegration) {
      return { ok: false, error: "Ingen nyckel-leverantör ansluten" };
    }

    // Create key via lock adapter
    const lockAdapter = await resolveLockAdapter(tenantId);
    const normalizedKey = await lockAdapter.createKey({
      tenantId,
      bookingId,
      guestName: booking.guestName,
      roomIdentifier: booking.unit,
      validFrom,
      validTo,
    });

    // Persist to DB
    await prisma.digitalKey.create({
      data: {
        tenantId,
        bookingId,
        integrationId: lockIntegration.id,
        keyId: normalizedKey.keyId,
        provider: normalizedKey.provider,
        status: "active",
        validFrom: normalizedKey.validFrom,
        validTo: normalizedKey.validTo,
        walletPayload: JSON.parse(JSON.stringify(normalizedKey.walletPayload)),
        portalPayload: JSON.parse(JSON.stringify(normalizedKey.portalPayload)),
      },
    });

    // Log event
    await prisma.keyEvent.create({
      data: {
        tenantId,
        integrationId: lockIntegration.id,
        keyId: normalizedKey.keyId,
        bookingId,
        eventType: "key_created",
        metadata: { provider: normalizedKey.provider, roomIdentifier: booking.unit },
      },
    });

    return { ok: true, key: normalizedKey };
  } catch (error) {
    console.error("[createGuestKey] Error:", error);
    const message = error instanceof Error ? error.message : "Okänt fel";
    return { ok: false, error: `Kunde inte skapa nyckel: ${message}` };
  }
}

// ── revokeGuestKey ──────────────────────────────────────────
// Kill switch — extern återkallning MÅSTE lyckas innan DB uppdateras.
// Om leverantörens API failar kastas felet vidare — nyckeln förblir aktiv.

export async function revokeGuestKey(
  bookingId: string,
  tenantId: string,
  revokedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  try {
    const digitalKey = await prisma.digitalKey.findUnique({
      where: { tenantId_bookingId: { tenantId, bookingId } },
    });

    if (!digitalKey) {
      return { ok: false, error: "Ingen nyckel hittades för denna bokning" };
    }

    // Idempotent — already revoked
    if (digitalKey.status === "revoked") {
      return { ok: true };
    }

    // Step 1: Revoke at lock provider — this MUST succeed before DB update
    const lockAdapter = await resolveLockAdapter(tenantId);
    await lockAdapter.revokeKey(digitalKey.keyId, tenantId);

    // Step 2: Only after external revocation succeeds, update DB
    await prisma.digitalKey.update({
      where: { id: digitalKey.id },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        revokedBy,
      },
    });

    // Log event
    const lockIntegration = await prisma.tenantLockIntegration.findUnique({
      where: { tenantId },
    });

    if (lockIntegration) {
      await prisma.keyEvent.create({
        data: {
          tenantId,
          integrationId: lockIntegration.id,
          keyId: digitalKey.keyId,
          bookingId,
          eventType: "key_revoked",
          metadata: { revokedBy },
        },
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[revokeGuestKey] Error:", error);
    const message = error instanceof Error ? error.message : "Okänt fel";
    return { ok: false, error: `Kunde inte återkalla nyckel: ${message}` };
  }
}
