/**
 * Full-screen overlay shown when check-in is not enabled for this tenant.
 *
 * Server component — no client JS shipped.
 * Rendered when:
 *   - Tenant not found (invalid subdomain)
 *   - Tenant exists but checkinEnabled === false
 */
export function CheckInDisabled() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ebebeb",
      }}
    >
      <p
        style={{
          fontSize: 15,
          color: "#6b6b6b",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: 24,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Denna portal har inte aktiverat incheckning
      </p>
    </div>
  );
}
