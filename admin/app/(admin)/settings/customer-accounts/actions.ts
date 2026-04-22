"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { log } from "@/app/_lib/logger";

/**
 * Customer-accounts settings — server actions.
 *
 * Phase 1 ships one setting: `showLoginLinks` (controls whether the
 * storefront header + checkout render login/account links). Stored on
 * Tenant as a direct column so the change takes effect immediately —
 * no draft/publish cycle.
 *
 * Every write invalidates the `tenant-config:{tenantId}` cache tag so
 * the next guest request sees the new value. See getTenantConfig.ts
 * for how the column is merged into `config.features.showLoginLinks`.
 */

// ─── Read ─────────────────────────────────────────────────────

export type CustomerAccountsSettings = {
  showLoginLinks: boolean;
};

export async function getCustomerAccountsSettings(): Promise<CustomerAccountsSettings | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  return {
    showLoginLinks: tenantData.tenant.showLoginLinks,
  };
}

// ─── Write ────────────────────────────────────────────────────

const UpdateSchema = z
  .object({
    showLoginLinks: z.boolean().optional(),
  })
  .strict();

export type UpdateCustomerAccountsSettingsInput = z.infer<typeof UpdateSchema>;

export async function updateCustomerAccountsSettings(
  input: UpdateCustomerAccountsSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Not authenticated" };

  // Admin-only — matches the rest of the settings surface. requireAdmin
  // returns a result object (never throws), so branch explicitly.
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const tenantId = tenantData.tenant.id;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: parsed.data,
  });

  // Invalidate the cached guest-config so the next storefront render
  // sees the new flag. `tenant-config` cache-tag pattern matches
  // publishDraft.ts + updateMenusLive.ts (expire: 0 = immediate).
  revalidateTag(`tenant-config:${tenantId}`, { expire: 0 });

  log("info", "customer_accounts.settings_updated", {
    tenantId,
    actorUserId: tenantData.clerkUserId,
    showLoginLinks: parsed.data.showLoginLinks ?? null,
  });

  return { ok: true };
}
