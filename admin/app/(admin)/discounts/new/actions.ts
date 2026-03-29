"use server";

import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { listGuestAccounts } from "@/app/_lib/guests/queries";

export async function searchGuestsForPicker(query: string): Promise<{ id: string; label: string }[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const result = await listGuestAccounts(tenantData.tenant.id, { search: query, take: 20 });
  return result.guests.map((g) => ({
    id: g.id,
    label: [g.firstName, g.lastName].filter(Boolean).join(" ") || g.email,
  }));
}
