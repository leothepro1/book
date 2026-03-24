/**
 * Booking Selection — Session Storage
 * ════════════════════════════════════
 *
 * Persists the user's room/rate/addon selection across page navigations
 * during the booking flow. Uses sessionStorage (not localStorage) —
 * selections are session-scoped, not persistent.
 *
 * TTL: 30 minutes. Expired selections are treated as missing.
 */

const STORAGE_KEY = "bf_booking_selection";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface BookingSelection {
  tenantId: string;
  categoryId: string;
  categoryName: string;
  ratePlanId: string;
  ratePlanName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  addons: Array<{ addonId: string; quantity: number; unitAmount: number }>;
  totalAmount: number;
  currency: string;
  savedAt: string; // ISO — for TTL check
}

export function saveBookingSelection(selection: BookingSelection): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function loadBookingSelection(tenantId: string): BookingSelection | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingSelection;
    // Wrong tenant
    if (parsed.tenantId !== tenantId) return null;
    // Expired (30 min TTL)
    if (Date.now() - new Date(parsed.savedAt).getTime() > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBookingSelection(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
