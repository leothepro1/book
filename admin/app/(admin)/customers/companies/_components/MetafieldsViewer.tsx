/**
 * Read-only JSON viewer for Metafields.
 *
 * Metafields are user-defined key/value blobs (Shopify parity) — they have no
 * canonical shape, so we render the raw JSON pretty-printed. This component
 * is intentionally a viewer only; editing arrives in FAS 5.
 */

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "object") {
    if (Array.isArray(v)) return v.length === 0;
    return Object.keys(v as Record<string, unknown>).length === 0;
  }
  return false;
}

export function MetafieldsViewer({ metafields }: { metafields: unknown }) {
  if (isEmpty(metafields)) {
    return <p className="co-muted">Inga metafields</p>;
  }
  let pretty: string;
  try {
    pretty = JSON.stringify(metafields, null, 2);
  } catch {
    // If for some reason the payload has a circular structure (shouldn't —
    // it came from the DB as JSON), fall back to String().
    pretty = String(metafields);
  }
  return <pre className="co-json">{pretty}</pre>;
}
