"use client";

import { useEffect } from "react";

export default function CompanyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("company detail error", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        padding: 40,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Kunde inte läsa företaget
      </h1>
      <p style={{ fontSize: 14, color: "#666", maxWidth: 420, marginBottom: 24 }}>
        {isDev ? error.message : "Ett oväntat fel uppstod. Försök igen."}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "10px 24px",
          fontSize: 14,
          fontWeight: 500,
          background: "#303030",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Försök igen
      </button>
    </div>
  );
}
