"use server";

/**
 * Token-based check-in actions — not used in booking engine.
 * Kept as export so existing pages don't crash during migration.
 */

export async function markCheckedIn(_token?: string | null) {
  // No-op — booking engine does not support token-based check-in
}
