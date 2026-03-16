"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getCheckinSettings, getCheckInPrerequisiteStatus, toggleCheckin, toggleEarlyCheckin, updateEarlyCheckinDays } from "./actions";
import type { CheckInPrerequisiteStatus } from "./actions";
import { useSettings } from "@/app/(admin)/_components/SettingsContext";

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;
  return (
    <svg className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none"
      style={{ marginTop: 1 }} onAnimationEnd={handleAnimationEnd} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;

    // Strip everything except digits and colon
    const cleaned = raw.replace(/[^0-9:]/g, "");

    // If user is deleting, allow it
    if (cleaned.length < value.length) {
      onChange(cleaned);
      return;
    }

    // Only digits typed so far (no colon yet)
    const digitsOnly = cleaned.replace(/:/g, "");

    if (digitsOnly.length <= 2) {
      // First two digits — validate as hours (0-23)
      if (digitsOnly.length === 2) {
        const hours = parseInt(digitsOnly, 10);
        if (hours > 23) return; // Invalid hour
        onChange(digitsOnly + ":");
      } else {
        onChange(digitsOnly);
      }
      return;
    }

    if (digitsOnly.length <= 4) {
      const hours = digitsOnly.slice(0, 2);
      const minutes = digitsOnly.slice(2);

      // Validate minutes (0-59)
      if (minutes.length === 2) {
        const mins = parseInt(minutes, 10);
        if (mins > 59) return;
      } else if (minutes.length === 1) {
        const firstDigit = parseInt(minutes, 10);
        if (firstDigit > 5) return; // Minutes can't start with 6-9
      }

      onChange(hours + ":" + minutes);
      return;
    }

    // Max length reached — ignore
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      className="admin-float-input"
      style={{ padding: "10px 12px", width: "100%", textAlign: "center", fontSize: 14, letterSpacing: "0.05em" }}
      maxLength={5}
      inputMode="numeric"
    />
  );
}

// ── Early Checkin Days Dropdown ───────────────────────────────

const EARLY_CHECKIN_OPTIONS = [
  { value: 0, label: "Samma dag" },
  { value: 1, label: "1 dag före ankomst" },
  { value: 2, label: "2 dagar före ankomst" },
  { value: 3, label: "3 dagar före ankomst" },
  { value: 5, label: "5 dagar före ankomst" },
  { value: 7, label: "7 dagar före ankomst" },
];

function EarlyCheckinDaysDropdown({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = EARLY_CHECKIN_OPTIONS.find((o) => o.value === value) ?? EARLY_CHECKIN_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [open]);

  return (
    <div style={{ paddingTop: 14 }}>
      <label className="admin-label">Tillåt incheckning upp till</label>
      <div className="sf-dropdown">
        <button
          ref={triggerRef}
          type="button"
          className="sf-dropdown__trigger"
          onClick={() => setOpen(!open)}
        >
          <span className="sf-dropdown__text">{selected.label}</span>
          <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
        </button>
        {open && createPortal(
          <ul
            ref={menuRef}
            className="sf-dropdown__menu"
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {EARLY_CHECKIN_OPTIONS.map((opt) => (
              <li
                key={opt.value}
                className={`sf-dropdown__item${opt.value === value ? " sf-dropdown__item--active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                <span className={`material-symbols-rounded sf-dropdown__check${opt.value === value ? " sf-dropdown__check--visible" : ""}`}>check</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      </div>
    </div>
  );
}

// ── Copy URL Input ────────────────────────────────────────

function CopyUrlInput({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: "relative", marginTop: 12 }}>
      <input
        type="text"
        value={value}
        disabled
        className="admin-float-input"
        style={{
          width: "100%",
          padding: "10px 40px 10px 12px",
          fontSize: 13,
          color: "var(--admin-text-secondary)",
          background: "var(--admin-bg, #f5f5f5)",
          cursor: "default",
        }}
      />
      <button
        onClick={handleCopy}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: copied ? "#1a7f37" : "var(--admin-text-secondary)",
          transition: "color 0.15s",
        }}
        aria-label="Kopiera URL"
      >
        <EditorIcon name={copied ? "check" : "content_copy"} size={18} />
      </button>
    </div>
  );
}

type CheckinContentProps = {
  onSubTitleChange?: (title: string | null) => void;
  onNavigate?: (tab: string) => void;
};

export function CheckinContent({ onSubTitleChange, onNavigate }: CheckinContentProps) {
  const { close: closeSettings } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [earlyCheckinEnabled, setEarlyCheckinEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showPrereqModal, setShowPrereqModal] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showEarlyCheckinModal, setShowEarlyCheckinModal] = useState(false);
  const [showEarlyCheckinDeactivate, setShowEarlyCheckinDeactivate] = useState(false);
  const [earlyCheckinToggling, setEarlyCheckinToggling] = useState(false);
  const [earlyCheckinDays, setEarlyCheckinDays] = useState(0);
  const [checkinUrl, setCheckinUrl] = useState("");
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");

  useEffect(() => {
    getCheckinSettings().then((data) => {
      if (data) {
        setEnabled(data.checkinEnabled);
        setEarlyCheckinEnabled(data.earlyCheckinEnabled);
        setEarlyCheckinDays(data.earlyCheckinDays);
        setCheckinUrl(data.checkinUrl);
      }
      setLoading(false);
    });
  }, []);

  async function handleDeactivate() {
    setToggling(true);
    const result = await toggleCheckin(false);
    if (result.ok) setEnabled(false);
    setToggling(false);
  }

  if (loading) {
    return (
      <div>
        <div className="skel skel--text" style={{ width: 180, height: 16, marginBottom: 8 }} />
        <div className="skel skel--text" style={{ width: "100%", height: 12, marginBottom: 20 }} />
        <div className="skel" style={{ width: "100%", height: 64, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <>
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
          In- och utcheckning
        </h4>
        <p className="admin-desc" style={{ marginBottom: 16 }}>
          Aktivera digitala in- och utcheckningsflöden för dina gäster. När aktiverat kan gäster checka in och ut via sin gästportal.
        </p>

        <div style={{
          border: "1px solid var(--admin-border)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 14px",
          }}>
          <EditorIcon name="door_open" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text)", lineHeight: "1em", marginBottom: 4 }}>
              In- och utcheckning
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 1.4 }}>
              Gäster kan checka in och ut digitalt via portalen.
            </div>
          </div>
          {enabled ? (
            <button
              className="settings-btn--danger"
              style={{ fontSize: 13, padding: "5px 12px" }}
              disabled={toggling}
              onClick={() => setShowDeactivateConfirm(true)}
            >
              Avaktivera
            </button>
          ) : (
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => setShowPrereqModal(true)}
            >
              Aktivera
            </button>
          )}
          </div>
        </div>
      </div>

      {enabled && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
            Tider för in- och utcheckning
          </h4>
          <p className="admin-desc" style={{ marginBottom: 16 }}>
            Dessa tider styr när gäster kan checka in och ut via gästportalen.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Incheckning</label>
              <TimeInput value={checkInTime} onChange={setCheckInTime} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Utcheckning</label>
              <TimeInput value={checkOutTime} onChange={setCheckOutTime} />
            </div>
          </div>
        </div>
      )}

      {enabled && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", marginBottom: 16 }}>
            Tillåt tidig incheckning
          </h4>
          <div style={{
            border: "1px solid var(--admin-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "16px 14px",
            }}>
            <EditorIcon name="schedule" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text)", lineHeight: "1em", marginBottom: 4 }}>
                Tidig incheckning
              </div>
              <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 1.4 }}>
                Gör det möjligt för gäster att begära tidigare ankomst än ordinarie incheckningstid.
              </div>
            </div>
            {earlyCheckinEnabled ? (
              <button
                className="settings-btn--danger"
                style={{ fontSize: 13, padding: "5px 12px" }}
                disabled={earlyCheckinToggling}
                onClick={() => setShowEarlyCheckinDeactivate(true)}
              >
                Avaktivera
              </button>
            ) : (
              <button
                className="settings-btn--connect"
                style={{ fontSize: 13, padding: "5px 12px" }}
                onClick={() => setShowEarlyCheckinModal(true)}
              >
                Aktivera
              </button>
            )}
            </div>
            {earlyCheckinEnabled && (
              <div style={{ padding: "0 14px 16px", borderTop: "1px solid var(--admin-border)" }}>
                <EarlyCheckinDaysDropdown
                  value={earlyCheckinDays}
                  onChange={async (days) => {
                    setEarlyCheckinDays(days);
                    await updateEarlyCheckinDays(days);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {enabled && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", marginBottom: 16 }}>
            Konfigurera
          </h4>
          <div style={{
            border: "1px solid var(--admin-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}>
            {/* Inställningar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "16px 14px",
            }}>
              <EditorIcon name="design_services" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text)", lineHeight: "1em", marginBottom: 4 }}>
                  Inställningar
                </div>
                <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 1.4 }}>
                  Konfigurera layout, ordning och innehåll för in- och utcheckning.
                </div>
              </div>
              <button
                className="settings-btn--connect"
                style={{ fontSize: 13, padding: "5px 12px" }}
                onClick={() => {
                  closeSettings();
                  window.location.href = "/editor";
                }}
              >
                Anpassa
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "var(--admin-border)", margin: "0 14px" }} />

            {/* URL */}
            <div style={{ padding: "16px 14px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <EditorIcon name="link" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text)", lineHeight: "1em", marginBottom: 4 }}>
                    URL
                  </div>
                  <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", lineHeight: 1.4 }}>
                    Använd denna URL där gäster ska komma åt in- och utcheckning.
                  </div>
                </div>
                <button
                  className="settings-btn--connect"
                  style={{ fontSize: 13, padding: "5px 12px" }}
                  onClick={() => onNavigate?.("domains")}
                >
                  Hantera
                </button>
              </div>
              <CopyUrlInput value={checkinUrl} />
            </div>
          </div>
        </div>
      )}

      {showEarlyCheckinDeactivate && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowEarlyCheckinDeactivate(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Avaktivera tidig incheckning?
            </h3>
            <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
              Gäster kommer inte längre kunna begära tidig incheckning via portalen.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowEarlyCheckinDeactivate(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={earlyCheckinToggling}
                onClick={async () => {
                  setEarlyCheckinToggling(true);
                  const result = await toggleEarlyCheckin(false);
                  if (result.ok) setEarlyCheckinEnabled(false);
                  setEarlyCheckinToggling(false);
                  setShowEarlyCheckinDeactivate(false);
                }}
              >
                <ButtonSpinner visible={earlyCheckinToggling} />
                Avaktivera
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showEarlyCheckinModal && (
        <EarlyCheckinModal
          onClose={() => setShowEarlyCheckinModal(false)}
          onActivated={() => { setEarlyCheckinEnabled(true); setShowEarlyCheckinModal(false); }}
        />
      )}

      {showDeactivateConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowDeactivateConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Avaktivera in- och utcheckning?
            </h3>
            <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
              Gäster kommer inte längre kunna checka in eller ut digitalt via portalen.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowDeactivateConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={toggling}
                onClick={async () => {
                  await handleDeactivate();
                  setShowDeactivateConfirm(false);
                }}
              >
                <ButtonSpinner visible={toggling} />
                Avaktivera
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showPrereqModal && (
        <PrerequisiteModal
          onClose={() => setShowPrereqModal(false)}
          onActivated={() => { setEnabled(true); setShowPrereqModal(false); }}
          onNavigate={(tab) => { setShowPrereqModal(false); onNavigate?.(tab); }}
        />
      )}
    </>
  );
}

// ── Prerequisite Modal ────────────────────────────────────────

function PrerequisiteModal({
  onClose,
  onActivated,
  onNavigate,
}: {
  onClose: () => void;
  onActivated: () => void;
  onNavigate: (tab: string) => void;
}) {
  const [status, setStatus] = useState<CheckInPrerequisiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [activating, setActivating] = useState(false);
  const { close: closeSettings } = useSettings();

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setError(null);
    try {
      const result = await getCheckInPrerequisiteStatus();
      setStatus(result);
    } catch {
      setError("Kunde inte hämta integrationsstatus. Försök igen.");
    }
  }

  async function handleActivate() {
    setActivating(true);
    const result = await toggleCheckin(true);
    setActivating(false);
    if (result.ok) {
      onActivated();
    } else {
      setError(result.error ?? "Kunde inte aktivera");
    }
  }

  const canActivate = status?.allMet && confirmed && !activating;
  const unmetCount = status
    ? [status.pms, status.digitalLock].filter((s) => !s.connected).length
    : 0;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--admin-overlay)",
        animation: "settings-modal-fade-in 0.15s ease",
      }} />
      <div
        style={{
          position: "relative", zIndex: 1,
          background: "var(--admin-surface)",
          borderRadius: 16, width: 520,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
          padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
        }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Aktivera digital in- och utcheckning</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent",
              cursor: "pointer", color: "var(--admin-text-secondary)",
            }}
            aria-label="Stäng"
          >
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>

          {/* Loading */}
          {!status && !error && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skel" style={{ width: "100%", height: 64, borderRadius: 10 }} />
              <div className="skel" style={{ width: "100%", height: 64, borderRadius: 10 }} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "#FBE9E7", color: "#C62828",
              fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
            }}>
              <EditorIcon name="error" size={18} />
              <span style={{ flex: 1 }}>{error}</span>
              <button
                onClick={fetchStatus}
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  color: "#C62828", fontWeight: 600, fontSize: 13,
                  textDecoration: "underline",
                }}
              >
                Försök igen
              </button>
            </div>
          )}

          {/* Systemkrav */}
          {status && (
            <>
              <div style={{
                fontSize: 14, fontWeight: 500, color: "#303030",
                marginBottom: 10,
              }}>
                Krav för aktivering
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <PrerequisiteCard
                  label="PMS"
                  connectedLabel="PMS ansluten"
                  disconnectedLabel="PMS saknas"
                  status={status.pms}
                  onConfigure={() => onNavigate("integrations")}
                />
                <PrerequisiteCard
                  label="Digitala nycklar"
                  connectedLabel="Digitala nycklar anslutna"
                  disconnectedLabel="Digitala nycklar saknas"
                  status={status.digitalLock}
                  onConfigure={() => onNavigate("integrations")}
                />
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#E6E5E3", margin: "20px 0" }} />

              {/* Description */}
              <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 0 }}>
                När digital incheckning är aktiverad kan gäster checka in och ut via portalen
                och få tillgång till sin digitala nyckel direkt i mobilen.
              </p>

              <div style={{ height: 1, background: "#E6E5E3", margin: "20px 0" }} />

              {/* Confirmation checkbox */}
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: status.allMet ? "pointer" : "not-allowed",
                opacity: status.allMet ? 1 : 0.5,
              }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!status.allMet}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, cursor: "inherit", accentColor: "var(--admin-accent)" }}
                />
                <span style={{ fontSize: 14, color: "#616161", lineHeight: 1.6 }}>
                  Jag bekräftar att organisationen ansvarar för sina policyer och
                  behandling av gästdata via portalen
                </span>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
        }}>
          <div>
            {status && unmetCount > 0 && (
              <span style={{ fontSize: 13, color: "#9a6700", display: "flex", alignItems: "center", gap: 6 }}>
                <EditorIcon name="warning" size={16} />
                {unmetCount} krav återstår
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="settings-btn--outline"
              style={{ border: "none" }}
              onClick={onClose}
            >
              Avbryt
            </button>
            <button
              className="settings-btn--connect"
              disabled={!canActivate}
              onClick={handleActivate}
            >
              <ButtonSpinner visible={activating} />
              Aktivera
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Prerequisite Card ─────────────────────────────────────────

function PrerequisiteCard({
  connectedLabel,
  disconnectedLabel,
  status,
  onConfigure,
}: {
  label: string;
  connectedLabel: string;
  disconnectedLabel: string;
  status: { connected: boolean; providerName: string | null; reason: string | null };
  onConfigure: () => void;
}) {
  if (status.connected) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderRadius: 10,
        background: "rgb(221, 244, 228)",
        border: "1px solid rgba(26, 127, 55, 0.2)",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "#1a7f37", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <EditorIcon name="check" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a7f37", lineHeight: "1em", marginBottom: 5 }}>
            {connectedLabel}
          </div>
          {status.providerName && (
            <div style={{ fontSize: 12, color: "#1a7f37", opacity: 1, lineHeight: "1em" }}>
              {status.providerName}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#1a7f37",
          background: "rgba(26, 127, 55, 0.12)", padding: "3px 8px", borderRadius: 6,
        }}>
          Ansluten
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 16px", borderRadius: 10,
      background: "rgb(255, 244, 212)",
      border: "1px solid rgba(154, 103, 0, 0.2)",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: "#9a6700", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <EditorIcon name="priority_high" size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#9a6700", lineHeight: "1em", marginBottom: 5 }}>
          {disconnectedLabel}
        </div>
        {status.reason && (
          <div style={{ fontSize: 12, color: "#9a6700", opacity: 1, lineHeight: "1em" }}>
            {status.reason}
          </div>
        )}
      </div>
      <button
        onClick={onConfigure}
        style={{
          border: "none", background: "none", cursor: "pointer",
          color: "#9a6700", fontWeight: 600, fontSize: 12,
          textDecoration: "underline",
        }}
      >
        Konfigurera
      </button>
    </div>
  );
}

// ── Early Checkin Modal ───────────────────────────────────────

function EarlyCheckinModal({
  onClose,
  onActivated,
}: {
  onClose: () => void;
  onActivated: () => void;
}) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    const result = await toggleEarlyCheckin(true);
    setActivating(false);
    if (result.ok) {
      onActivated();
    } else {
      setError(result.error ?? "Kunde inte aktivera");
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--admin-overlay)",
        animation: "settings-modal-fade-in 0.15s ease",
      }} />
      <div
        style={{
          position: "relative", zIndex: 1,
          background: "var(--admin-surface)",
          borderRadius: 16, width: 520,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
          padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
        }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Aktivera tidig incheckning</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent",
              cursor: "pointer", color: "var(--admin-text-secondary)",
            }}
            aria-label="Stäng"
          >
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>

          {error && (
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "#FBE9E7", color: "#C62828",
              fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
            }}>
              <EditorIcon name="error" size={18} />
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 0 }}>
            När funktionen är aktiverad kan gäster checka in upp till ett visst antal
            dagar före ankomst. Digitala nycklar eller accesskort aktiveras fortfarande
            först vid ordinarie incheckningstid.
          </p>

        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
          gap: 8,
        }}>
          <button
            className="settings-btn--outline"
            style={{ border: "none" }}
            onClick={onClose}
          >
            Avbryt
          </button>
          <button
            className="settings-btn--connect"
            disabled={activating}
            onClick={handleActivate}
          >
            <ButtonSpinner visible={activating} />
            Aktivera
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
