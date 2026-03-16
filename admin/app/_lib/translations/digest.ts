// ── Content fingerprinting ────────────────────────────────────
//
// Synchronous, browser-safe FNV-1a hash. Used by scanner to detect
// stale translations. Not cryptographic — this is change detection.
// 8 hex chars = 32 bits — sufficient for this use case.

export function computeDigest(value: string): string {
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep 32-bit unsigned
  }
  return hash.toString(16).padStart(8, "0");
}
