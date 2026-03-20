/**
 * Magic Link Module — Public API
 * ═══════════════════════════════
 *
 * Email-based guest portal authentication.
 * All consumers import from '@/app/_lib/magic-link' — never from subfiles.
 */

export { generateToken, getExpiryDate, EXPIRY_HUMAN } from "./tokens";
export { requestMagicLink } from "./request";
export { validateMagicLink, lookupMagicLinkTenant, type MagicLinkValidationResult } from "./validate";
export { getGuestSession, setGuestSession, clearGuestSession, type GuestSession } from "./session";
