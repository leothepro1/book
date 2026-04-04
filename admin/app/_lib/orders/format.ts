/**
 * Order Number Formatting
 * ═══════════════════════
 *
 * Shopify-style order number display with configurable prefix and suffix.
 *
 * Examples:
 *   formatOrderNumber(1001, "#", "")      → "#1001"
 *   formatOrderNumber(1001, "#25", "")     → "#251001"
 *   formatOrderNumber(1001, "ORD-", "-SE") → "ORD-1001-SE"
 *   formatOrderNumber(1001, "", "")        → "1001"
 *
 * The raw integer (orderNumber) is always stored in the DB.
 * Prefix/suffix are display-only — they never affect uniqueness or sequencing.
 */

/**
 * Format an order number for display with tenant-configured prefix and suffix.
 *
 * @param orderNumber  Raw integer from Order.orderNumber
 * @param prefix       Tenant-configured prefix (e.g. "#25", "ORD-")
 * @param suffix       Tenant-configured suffix (e.g. "-SE", "")
 */
export function formatOrderNumber(
  orderNumber: number | string,
  prefix = "#",
  suffix = "",
): string {
  return `${prefix}${orderNumber}${suffix}`;
}
