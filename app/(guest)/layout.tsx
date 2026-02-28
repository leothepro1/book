export const dynamic = "force-dynamic";

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        background: "#f5f5f5",
      }}
    >
      <header
        style={{
          padding: 20,
          background: "white",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <strong>Guest Header (global)</strong>
      </header>

      <main style={{ padding: 24 }}>{children}</main>

      <footer
        style={{
          padding: 20,
          background: "white",
          borderTop: "1px solid #e5e5e5",
          fontSize: 14,
        }}
      >
        Guest Footer (global)
      </footer>
    </div>
  );
}