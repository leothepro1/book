/**
 * Render a JSON address blob as a multi-line display block.
 *
 * The schema for billing/shipping addresses is intentionally loose (matches
 * AddressJsonSchema in `app/_lib/companies/types.ts` — all fields optional).
 * Missing pieces degrade to em-dashes rather than empty lines so the card
 * never looks "half-broken".
 */

type AddressInput = Record<string, unknown> | null | undefined;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function AddressBlock({ address }: { address: AddressInput }) {
  if (!address || typeof address !== "object") {
    return <p className="co-muted">—</p>;
  }

  const name = str(address.name);
  const line1 = str(address.line1) ?? str(address.address1);
  const line2 = str(address.line2) ?? str(address.address2);
  const postal = str(address.postalCode);
  const city = str(address.city);
  const country = str(address.country);

  const postalCity = [postal, city].filter(Boolean).join(" ");
  const lines = [name, line1, line2, postalCity || null, country].filter(
    (x): x is string => !!x,
  );

  if (lines.length === 0) return <p className="co-muted">—</p>;

  return (
    <address className="co-address">
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </address>
  );
}
