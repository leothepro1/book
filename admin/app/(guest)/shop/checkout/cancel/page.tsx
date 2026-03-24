import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CheckoutCancelPage() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "clamp(3rem, 8vw, 6rem) 1.5rem", textAlign: "center" }}>
      <span
        className="material-symbols-rounded"
        style={{ fontSize: 48, color: "#d97706", fontVariationSettings: "'FILL' 1, 'wght' 400" }}
      >
        info
      </span>
      <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 0.5vw, 1.5rem)", fontWeight: 600, margin: "1rem 0 0.5rem" }}>
        Betalningen avbröts
      </h1>
      <p style={{ fontSize: "0.9375rem", color: "#666", margin: "0 0 2rem" }}>
        Inga pengar har dragits. Din varukorg finns kvar.
      </p>
      <Link
        href="/shop"
        style={{
          display: "inline-block",
          padding: "0.75rem 2rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          background: "#1a1a1a",
          color: "#fff",
          borderRadius: 10,
          textDecoration: "none",
        }}
      >
        Tillbaka till butiken
      </Link>
    </div>
  );
}
