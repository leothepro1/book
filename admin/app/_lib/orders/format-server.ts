/**
 * Server-side order number formatting.
 *
 * Fetches tenant prefix/suffix from DB and formats the order number.
 * Used in guest-facing server components and email templates.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { formatOrderNumber } from "./format";

/**
 * Format an order number using the tenant's configured prefix/suffix.
 * Falls back to "#" prefix if tenant has no custom format.
 */
export async function formatOrderNumberForTenant(
  tenantId: string,
  orderNumber: number | string,
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { orderNumberPrefix: true, orderNumberSuffix: true },
  });

  const prefix = tenant?.orderNumberPrefix || "#";
  const suffix = tenant?.orderNumberSuffix || "";

  return formatOrderNumber(orderNumber, prefix, suffix);
}
