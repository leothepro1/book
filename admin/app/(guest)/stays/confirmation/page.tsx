import Link from "next/link";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const confirmationNumber = sp.confirmationNumber;
  const portalToken = sp.portalToken;

  if (!confirmationNumber) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <p style={{ color: "color-mix(in srgb, var(--text, #000) 55%, transparent)" }}>
          Ingen bokningsbekräftelse hittades.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(2rem, 5vw, 4rem) 1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: 56,
            color: "var(--success, #16a34a)",
            fontVariationSettings: "'FILL' 1, 'wght' 400",
          }}
        >
          check_circle
        </span>
        <h1 style={{
          fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
          fontWeight: 600,
          color: "var(--text, #1a1a1a)",
          margin: "1rem 0 0.5rem",
        }}>
          Bokning bekräftad!
        </h1>
        <p style={{
          fontSize: "0.9375rem",
          color: "color-mix(in srgb, var(--text, #000) 55%, transparent)",
          margin: 0,
        }}>
          Bokningsnummer: <strong>{confirmationNumber}</strong>
        </p>
      </div>

      <p style={{
        textAlign: "center",
        fontSize: "0.8125rem",
        color: "color-mix(in srgb, var(--text, #000) 50%, transparent)",
        marginBottom: "2rem",
      }}>
        En bekräftelse har skickats till din e-post.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
        {portalToken && (
          <Link
            href={`/p/${portalToken}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.75rem 2rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              background: "var(--button-bg, #1a1a1a)",
              color: "var(--button-fg, #fff)",
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            Visa min bokning
          </Link>
        )}
        <Link
          href="/stays"
          style={{
            fontSize: "0.8125rem",
            color: "color-mix(in srgb, var(--text, #000) 55%, transparent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          Sök fler boenden
        </Link>
      </div>
    </div>
  );
}
