"use client";

/**
 * CompanyMetaCard — meta-kort i sidebaren ovanför Anteckningar.
 *
 * Innehåll (uppifrån och ner):
 *   1. Bolagsnamnet (stor h2)
 *   2. Status-badge (Aktiv / Arkiverad / Väntar godkännande)
 *   3. Organisationsnummer
 *   4. "Kunder"-label
 *   5. Horisontellt staplade pill:ar — en per kontakt.
 *      Klick på pill → /customers/[guestAccountId]
 *   6. I övre högra hörnet: more_horiz-ikon → dropdown med länkar
 *      (innehåll läggs till senare)
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyStatus } from "@prisma/client";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { CompanyStatusBadge } from "./CompanyStatusBadge";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  position: "relative",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export interface ContactPill {
  guestAccountId: string;
  name: string;
}

interface Props {
  name: string;
  status: CompanyStatus;
  orderingApproved: boolean;
  organizationNumber: string | null;
  contacts: ContactPill[];
}

export function CompanyMetaCard({
  name,
  status,
  orderingApproved,
  organizationNumber,
  contacts,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Stäng dropdown vid utsideklick
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <div style={CARD} className="co-meta-card">
      {/* Overflow-knapp i övre högra hörnet */}
      <div
        ref={menuRef}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
        }}
      >
        <button
          type="button"
          className="ord-note-edit"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Fler åtgärder"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <EditorIcon name="more_horiz" size={18} />
        </button>
        {menuOpen ? (
          <div
            className="co-meta-card__menu"
            role="menu"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: "var(--admin-surface)",
              borderRadius: 12,
              padding: 4,
              minWidth: 200,
              boxShadow:
                "0 20px 24px #1919190d, 0 5px 8px #19191907, 0 0 0 1px #2a1c0012",
              zIndex: 20,
            }}
          >
            {/* Dropdown-länkar fylls på i nästa iteration */}
            <div
              style={{
                padding: "8px 10px",
                fontSize: 13,
                color: "var(--admin-text-tertiary)",
              }}
            >
              Inga åtgärder ännu
            </div>
          </div>
        ) : null}
      </div>

      {/* 1. Bolagsnamn */}
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--admin-text)",
          margin: 0,
          paddingRight: 32,
          lineHeight: 1.3,
        }}
      >
        {name}
      </h2>

      {/* 2. Status */}
      <div style={{ marginTop: 8 }}>
        <CompanyStatusBadge
          status={status}
          orderingApproved={orderingApproved}
        />
      </div>

      {/* 3. Organisationsnummer */}
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "var(--admin-text)",
          lineHeight: 1.4,
        }}
      >
        {organizationNumber ? (
          organizationNumber
        ) : (
          <span style={{ color: "var(--admin-text-tertiary)" }}>
            Inget org-nummer
          </span>
        )}
      </div>

      {/* 4. Label + 5. Kontakt-pills */}
      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          fontWeight: 550,
          color: "var(--admin-text)",
          textTransform: "none",
          letterSpacing: 0,
        }}
      >
        Kunder
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 6,
        }}
      >
        {contacts.length === 0 ? (
          <span
            style={{
              fontSize: 13,
              color: "var(--admin-text-tertiary)",
            }}
          >
            Inga kunder kopplade
          </span>
        ) : (
          contacts.map((c) => (
            <button
              key={c.guestAccountId}
              type="button"
              onClick={() => router.push(`/customers/${c.guestAccountId}`)}
              className="co-meta-card__pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "inherit",
                color: "var(--admin-text)",
                background: "#f0f0f0",
                border: "1px solid transparent",
                borderRadius: 999,
                cursor: "pointer",
                transition:
                  "background var(--duration-fast), border-color var(--duration-fast)",
              }}
            >
              {c.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
