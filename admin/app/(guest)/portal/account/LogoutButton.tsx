"use client";

import { useTransition } from "react";

/**
 * Logout button — calls POST /api/guest-auth/logout then redirects to /login.
 * Styled to match the guest portal's existing UI patterns.
 */
export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      try {
        await fetch("/api/guest-auth/logout", { method: "POST" });
      } catch {
        // Best-effort — redirect regardless
      }
      window.location.href = "/login";
    });
  }

  return (
    <div style={{ padding: "24px 16px 40px", textAlign: "center" }}>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "14px 24px",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text)",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 12,
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {isPending ? "Loggar ut..." : "Logga ut"}
      </button>
    </div>
  );
}
