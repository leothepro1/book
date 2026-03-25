"use client";

import { useState, useTransition } from "react";

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  postalCode: string;
  country: string;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "0.875rem",
  border: "1px solid color-mix(in srgb, var(--text) 15%, transparent)",
  borderRadius: 8,
  background: "var(--background, #fff)",
  color: "var(--text, #1a1a1a)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--text)",
  opacity: 0.7,
  marginBottom: 4,
};

export default function ProfileForm({ initial }: { initial: ProfileData }) {
  const [data, setData] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function update(field: keyof ProfileData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    setStatus("idle");
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/guest-auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone || undefined,
            address1: data.address1 || undefined,
            city: data.city || undefined,
            postalCode: data.postalCode || undefined,
            country: data.country || undefined,
          }),
        });
        if (res.ok) {
          setStatus("saved");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Email — read only */}
      <div>
        <label style={labelStyle}>E-post</label>
        <input style={{ ...fieldStyle, opacity: 0.6 }} value={data.email} readOnly />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label style={labelStyle}>Förnamn</label>
          <input style={fieldStyle} value={data.firstName} onChange={(e) => update("firstName", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Efternamn</label>
          <input style={fieldStyle} value={data.lastName} onChange={(e) => update("lastName", e.target.value)} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Telefon</label>
        <input style={fieldStyle} value={data.phone} onChange={(e) => update("phone", e.target.value)} />
      </div>

      <div>
        <label style={labelStyle}>Adress</label>
        <input style={fieldStyle} value={data.address1} onChange={(e) => update("address1", e.target.value)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label style={labelStyle}>Postnummer</label>
          <input style={fieldStyle} value={data.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Ort</label>
          <input style={fieldStyle} value={data.city} onChange={(e) => update("city", e.target.value)} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        style={{
          marginTop: "0.5rem",
          padding: "12px 24px",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--button-fg, #fff)",
          background: "var(--button-bg, #1a1a1a)",
          border: "none",
          borderRadius: 8,
          cursor: isPending ? "not-allowed" : "pointer",
          opacity: isPending ? 0.6 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {isPending ? "Sparar..." : "Spara"}
      </button>

      {status === "saved" && (
        <p style={{ fontSize: "0.8125rem", color: "#16a34a", margin: 0 }}>Uppgifterna har sparats.</p>
      )}
      {status === "error" && (
        <p style={{ fontSize: "0.8125rem", color: "#ef4444", margin: 0 }}>Något gick fel. Försök igen.</p>
      )}
    </div>
  );
}
