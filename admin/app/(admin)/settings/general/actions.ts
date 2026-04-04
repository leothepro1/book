"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";

// ── Get order format settings ───────────────────────────────

export async function getOrderFormatSettings(): Promise<{
  orderNumberPrefix: string;
  orderNumberSuffix: string;
  nextOrderNumber: number;
} | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantData.tenant.id },
    select: {
      orderNumberPrefix: true,
      orderNumberSuffix: true,
    },
  });
  if (!tenant) return null;

  // Get the current sequence number for preview
  const seq = await prisma.orderNumberSequence.findUnique({
    where: { tenantId: tenantData.tenant.id },
    select: { lastNumber: true },
  });

  return {
    orderNumberPrefix: tenant.orderNumberPrefix,
    orderNumberSuffix: tenant.orderNumberSuffix,
    nextOrderNumber: seq ? seq.lastNumber + 1 : 1001,
  };
}

// ── Update order format ─────────────────────────────────────

export async function updateOrderFormat(
  prefix: string,
  suffix: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Sanitize: trim whitespace, limit length
  const cleanPrefix = prefix.trim().slice(0, 20);
  const cleanSuffix = suffix.trim().slice(0, 20);

  try {
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: {
        orderNumberPrefix: cleanPrefix,
        orderNumberSuffix: cleanSuffix,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateOrderFormat] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera — försök igen" };
  }
}
