"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        fontFamily: "system-ui, sans-serif",
        color: "#303030",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 24, textAlign: "center", maxWidth: 400 }}>
        {isDev ? error.message : "An unexpected error occurred. Please try again."}
      </p>
      {isDev && error.stack && (
        <pre
          style={{
            fontSize: 11,
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 8,
            maxWidth: "100%",
            overflow: "auto",
            marginBottom: 24,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.stack}
        </pre>
      )}
      <button
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
        Try again
      </button>
    </div>
  );
}
