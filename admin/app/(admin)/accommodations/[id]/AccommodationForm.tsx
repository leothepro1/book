"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { groupFacilitiesByCategory, FACILITY_MAP } from "@/app/_lib/accommodations/facility-map";
import { updateAccommodation } from "../actions";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";
import type { AccommodationStatus, FacilityType, BedType } from "@prisma/client";
import "../../products/_components/product-form.css";

// ── Constants ────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const TYPE_LABELS: Record<string, string> = {
  HOTEL: "Hotell", CABIN: "Stuga", CAMPING: "Camping",
  APARTMENT: "Lägenhet", PITCH: "Plats",
};

const BED_TYPE_LABELS: Record<string, string> = {
  SINGLE: "Enkelsäng", DOUBLE: "Dubbelsäng", QUEEN: "Queen size",
  KING: "King size", SOFA_BED: "Bäddsoffa", BUNK_BED: "Våningssäng",
  FRENCH: "Fransk säng", FUTON: "Futon", TATAMI: "Tatami",
  FOLDABLE: "Nedfällbar säng", EXTRA_BED: "Extrasäng",
};

const CANCELLATION_LABELS: Record<string, string> = {
  FLEXIBLE: "Flexibel", MODERATE: "Måttlig", NON_REFUNDABLE: "Ej återbetalningsbar",
};

function formatDate(d: string | Date | null): string {
  if (!d) return "Aldrig";
  return new Date(d).toLocaleString("sv-SE");
}

// ── Component ────────────────────────────────────────────────

export default function AccommodationForm({
  accommodation,
  tenantId,
}: {
  accommodation: ResolvedAccommodation;
  tenantId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Editable fields ──
  const [nameOverride, setNameOverride] = useState(accommodation.displayName !== accommodation.displayName ? "" : "");
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [status, setStatus] = useState<AccommodationStatus>(accommodation.status as AccommodationStatus);
  const [statusOpen, setStatusOpen] = useState(false);
  const [externalCode, setExternalCode] = useState("");

  // ── Bed configs ──
  const [bedConfigs, setBedConfigs] = useState(
    accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })),
  );

  const markDirty = useCallback(() => setDirty(true), []);

  // ── Facilities (read-only display for V1) ──
  const facilityGroups = groupFacilitiesByCategory(accommodation.facilities);

  // ── Save ──
  const handleSave = useCallback(() => {
    setIsSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const result = await updateAccommodation(accommodation.id, {
        nameOverride: nameInput || null,
        descriptionOverride: descInput || null,
        status,
        externalCode: externalCode || null,
        bedConfigs: bedConfigs.filter((b) => b.quantity > 0),
      });

      setIsSaving(false);
      if (result.ok) {
        setDirty(false);
        setSavedAt(true);
        setTimeout(() => setSavedAt(false), 1500);
        router.refresh();
      } else {
        setSaveError(result.error);
        setTimeout(() => setSaveError(null), 5000);
      }
    });
  }, [nameInput, descInput, status, externalCode, bedConfigs, accommodation.id, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setNameInput("");
    setDescInput("");
    setStatus(accommodation.status as AccommodationStatus);
    setExternalCode("");
    setBedConfigs(accommodation.bedConfigs.map((b) => ({ bedType: b.bedType as BedType, quantity: b.quantity })));
    setTimeout(() => {
      setDirty(false);
      setIsDiscarding(false);
    }, 100);
  }, [accommodation]);

  return (
    <div className="admin-page admin-page--no-preview accommodations-page">
      <div className="admin-editor">
        {/* ── Header (breadcrumb) ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/accommodations")}
              aria-label="Tillbaka till boenden"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>bed</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{accommodation.displayName}</span>
          </h1>
        </div>

        {/* ── Body: two-column ── */}
        <div className="pf-body">
          {/* Left column (70%) */}
          <div className="pf-main">
            {/* Card 1 — Grundinformation */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Grundinformation</span>
              </div>
              <div className="pf-field">
                <label className="admin-label">Namn</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); markDirty(); }}
                  placeholder={accommodation.displayName}
                />
                <p style={{ fontSize: 11, color: "var(--admin-text-tertiary)", margin: "4px 0 0" }}>
                  Lämna tomt för att använda PMS-namnet
                </p>
              </div>
              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <textarea
                  className="email-sender__input"
                  value={descInput}
                  onChange={(e) => { setDescInput(e.target.value); markDirty(); }}
                  placeholder={accommodation.displayDescription.slice(0, 100) + "..."}
                  rows={4}
                  style={{ resize: "vertical", minHeight: 80 }}
                />
                <p style={{ fontSize: 11, color: "var(--admin-text-tertiary)", margin: "4px 0 0" }}>
                  Lämna tomt för att använda PMS-beskrivningen
                </p>
              </div>
              <div className="pf-field">
                <label className="admin-label">Internt rumsnummer / kod</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={externalCode}
                  onChange={(e) => { setExternalCode(e.target.value); markDirty(); }}
                  placeholder="T.ex. 101, A12"
                />
              </div>
            </div>

            {/* Card 2 — Faciliteter */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Faciliteter</span>
              </div>
              {facilityGroups.length === 0 ? (
                <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", margin: 0 }}>
                  Inga faciliteter synkade från PMS.
                </p>
              ) : (
                facilityGroups.map((group) => (
                  <div key={group.category} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {group.label}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                      {group.facilities.map((f) => (
                        <div key={f.label} style={{ fontSize: 13, color: "var(--admin-text)", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                          <EditorIcon name="check" size={14} style={{ color: "var(--admin-accent)" }} />
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Card 3 — Bäddkonfiguration */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Bäddkonfiguration</span>
              </div>
              {bedConfigs.length === 0 ? (
                <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", margin: 0 }}>
                  Ingen bäddkonfiguration angiven.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bedConfigs.map((b, i) => (
                    <div key={b.bedType} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{BED_TYPE_LABELS[b.bedType] ?? b.bedType}</span>
                      <button
                        type="button"
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => {
                          const next = [...bedConfigs];
                          next[i] = { ...next[i], quantity: Math.max(0, next[i].quantity - 1) };
                          setBedConfigs(next.filter((c) => c.quantity > 0));
                          markDirty();
                        }}
                      >
                        <EditorIcon name="remove" size={16} />
                      </button>
                      <span style={{ width: 24, textAlign: "center", fontSize: 14, fontWeight: 500 }}>{b.quantity}</span>
                      <button
                        type="button"
                        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--admin-border)", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={() => {
                          const next = [...bedConfigs];
                          next[i] = { ...next[i], quantity: next[i].quantity + 1 };
                          setBedConfigs(next);
                          markDirty();
                        }}
                      >
                        <EditorIcon name="add" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column (30%) */}
          <div className="pf-sidebar">
            {/* Status */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Status</span>
              </div>
              <div className="admin-dropdown">
                <button
                  type="button"
                  className="admin-dropdown__trigger"
                  onClick={() => setStatusOpen(!statusOpen)}
                >
                  <span className="admin-dropdown__text" style={{ textAlign: "left" }}>
                    {status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
                  </span>
                  <EditorIcon name="expand_more" size={18} className="admin-dropdown__chevron" />
                </button>
                {statusOpen && (
                  <div className="admin-dropdown__list">
                    {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`admin-dropdown__item${status === s ? " admin-dropdown__item--active" : ""}`}
                        onClick={() => { setStatus(s); setStatusOpen(false); markDirty(); }}
                      >
                        {s === "ACTIVE" ? "Aktiv" : "Inaktiv"}
                        {status === s && <span className="admin-dropdown__check"><EditorIcon name="check" size={16} /></span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Kapacitet (read-only) */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Kapacitet</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--font-sm)" }}>
                <Row label="Max gäster" value={String(accommodation.maxGuests)} />
                <Row label="Min gäster" value={String(accommodation.minGuests)} />
                <Row label="Extrasängar" value={String(accommodation.extraBeds)} />
                <Row label="Rumsstorlek" value={accommodation.roomSizeSqm ? `${accommodation.roomSizeSqm} m²` : "–"} />
                <Row label="Sovrum" value={accommodation.bedrooms != null ? String(accommodation.bedrooms) : "–"} />
                <Row label="Badrum" value={accommodation.bathrooms != null ? String(accommodation.bathrooms) : "–"} />
              </div>
              <p style={{ fontSize: 11, color: "var(--admin-text-tertiary)", margin: "8px 0 0" }}>Hämtas från PMS</p>
            </div>

            {/* Prissättning (read-only) */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Prissättning</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--font-sm)" }}>
                <Row
                  label="Baspris/natt"
                  value={accommodation.basePricePerNight > 0 ? `${formatPriceDisplay(accommodation.basePricePerNight, accommodation.currency)} kr` : "–"}
                />
              </div>
              {accommodation.ratePlans.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--admin-border)", paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", marginBottom: 8 }}>Prisalternativ</div>
                  {accommodation.ratePlans.map((rp) => (
                    <div key={rp.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>{rp.name}</span>
                      <span style={{ fontSize: 11, color: "var(--admin-text-tertiary)" }}>
                        {CANCELLATION_LABELS[rp.cancellationPolicy] ?? rp.cancellationPolicy}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--admin-text-tertiary)", margin: "8px 0 0" }}>Hämtas från PMS</p>
            </div>

            {/* PMS-information */}
            <div style={{ ...CARD, background: "var(--admin-surface)" }}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">PMS-information</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "var(--font-sm)" }}>
                <Row label="Leverantör" value={accommodation.pmsProvider ?? "Manuell"} />
                <Row label="Externt ID" value={accommodation.externalId ?? "–"} mono />
                <Row label="Senast synkad" value={formatDate(accommodation.updatedAt)} />
                <Row label="Typ" value={TYPE_LABELS[accommodation.accommodationType] ?? accommodation.accommodationType} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save/discard bar */}
      <PublishBarUI
        hasUnsavedChanges={dirty}
        isPublishing={isSaving}
        isDiscarding={isDiscarding}
        isLingeringAfterPublish={savedAt}
        onPublish={handleSave}
        onDiscard={handleDiscard}
        error={saveError}
      />
    </div>
  );
}

// ── Shared read-only row ──

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--admin-text-secondary)" }}>{label}</span>
      <span style={mono ? { fontFamily: "var(--sf-mono, monospace)", fontSize: "var(--font-xs)" } : undefined}>{value}</span>
    </div>
  );
}
