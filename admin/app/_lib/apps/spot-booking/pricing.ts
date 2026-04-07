/**
 * Spot Booking — Price Resolution
 *
 * Single source of truth for resolving the effective price of a marker.
 * Used by: admin editor, guest portal API, checkout validation.
 *
 * Rule: priceOverride !== null → use override; otherwise inherit map default.
 * Both values are in öre (smallest currency unit).
 */

export function resolveMarkerPrice(
  priceOverride: number | null | undefined,
  mapAddonPrice: number,
): number {
  if (priceOverride != null && priceOverride >= 0) {
    return priceOverride;
  }
  return mapAddonPrice;
}
