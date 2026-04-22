"use client";

/**
 * CustomerCreateForm — identisk struktur med CompanyCreateForm.
 *
 * Återanvänder alla .pf-* + .admin-label + .email-sender__input-klasser
 * från product-form.css + .ord-note-*-klasser från orders.css.
 *
 * Server-action createCustomerAction hanterar:
 *   - admin auth + tenant resolution
 *   - e-postvalidering
 *   - dup-check mot unique(tenantId, email) — returnerar vänligt fel
 *   - atomisk create + tags via $transaction
 *   - fire-and-forget ACCOUNT_CREATED event
 *   - revalidatePath på /customers
 *
 * Robusthet i nivå med rabatter:
 *   - validate() blockar submit på klient-sida
 *   - server gör hård valideringskontroll + duplicate guard
 *   - felmeddelanden visas i pf-error-banner, auto-dismiss 5s
 *   - race-safe (try/catch fångar unique violation om check-then-create racar)
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { createCustomerAction } from "../actions";
import "@/app/(admin)/products/_components/product-form.css";
import "@/app/(admin)/orders/orders.css";

// Kopierad från ProductForm — samma visuella kort.
const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export default function CustomerCreateForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Kunduppgifter
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // ── Adress
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("SE");

  // ── Anteckningar-modal (identisk struktur med ordrar)
  const [note, setNote] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // ── Taggar
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (!t || tags.includes(t)) {
        setTagInput("");
        return;
      }
      setTags([...tags, t]);
      setTagInput("");
    },
    [tags],
  );
  const removeTag = useCallback(
    (tag: string) => setTags(tags.filter((t) => t !== tag)),
    [tags],
  );

  // Dirty tracking — mark on any state change.
  useEffect(() => {
    const anyFieldFilled = !!(
      firstName ||
      lastName ||
      email ||
      phone ||
      address1 ||
      address2 ||
      postalCode ||
      city ||
      note ||
      tags.length
    ) || country !== "SE";
    setDirty(anyFieldFilled);
  }, [
    firstName,
    lastName,
    email,
    phone,
    address1,
    address2,
    postalCode,
    city,
    country,
    note,
    tags,
  ]);

  // ── Validation ─────────────────────────────────────────────
  function validate(): string | null {
    if (!email.trim()) return "E-post krävs";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Ogiltig e-postadress";
    }
    return null;
  }

  const handleSave = useCallback(() => {
    const err = validate();
    if (err) {
      setSaveError(err);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    startTransition(async () => {
      const result = await createCustomerAction({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
        address1: address1.trim() || undefined,
        address2: address2.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || "SE",
        note: note.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      setIsSaving(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      router.push(`/customers/${result.data.customerId}`);
    });
  }, [
    firstName,
    lastName,
    email,
    phone,
    address1,
    address2,
    postalCode,
    city,
    country,
    note,
    tags,
    router,
  ]);

  const handleDiscard = useCallback(() => {
    if (dirty && !confirm("Osparade ändringar — lämna formuläret?")) return;
    setIsDiscarding(true);
    setTimeout(() => router.push("/customers"), 100);
  }, [dirty, router]);

  const breadcrumbTitle =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    email.trim() ||
    "Skapa kund";

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header ── */}
        <div className="admin-header pf-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/customers")}
              aria-label="Tillbaka till kunder"
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 22 }}
              >
                group
              </span>
            </button>
            <EditorIcon
              name="chevron_right"
              size={16}
              style={{
                color: "var(--admin-text-tertiary)",
                flexShrink: 0,
              }}
            />
            <span style={{ marginLeft: 3 }}>{breadcrumbTitle}</span>
          </h1>
          <div className="pf-header__actions">
            <button className="settings-btn--muted" disabled>
              Fler åtgärder
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="pf-body">
          {/* LEFT — 70% */}
          <div className="pf-main">
            {/* Card 1: Kunduppgifter */}
            <div style={CARD}>
              <div
                className="pf-field"
                style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Förnamn</label>
                  <input
                    type="text"
                    className="email-sender__input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Efternamn</label>
                  <input
                    type="text"
                    className="email-sender__input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="pf-field">
                <label className="admin-label">E-post</label>
                <input
                  type="email"
                  className="email-sender__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exempel@foretag.se"
                />
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Telefon</label>
                <input
                  type="tel"
                  className="email-sender__input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+46 70 123 45 67"
                />
              </div>
            </div>

            {/* Card 2: Adress */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 12 }}
              >
                <span className="pf-card-title">Adress</span>
              </div>

              <div className="pf-field">
                <label className="admin-label">Gatuadress</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Adresstillägg</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  placeholder="Valfritt"
                />
              </div>

              <div
                className="pf-field"
                style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Postnummer</label>
                  <input
                    type="text"
                    className="email-sender__input"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="admin-label">Ort</label>
                  <input
                    type="text"
                    className="email-sender__input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Land</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="SE"
                />
              </div>
            </div>
          </div>

          {/* RIGHT — 30% */}
          <div className="pf-sidebar">
            {/* Anteckningar — identisk container + modal-lösning som ordrar */}
            <div style={CARD}>
              <div className="ord-note-header">
                <span className="pf-card-title">Anteckningar</span>
                <button
                  type="button"
                  className="ord-note-edit"
                  onClick={() => {
                    setNoteDraft(note);
                    setNoteModalOpen(true);
                  }}
                  aria-label="Redigera anteckningar"
                >
                  <EditorIcon name="edit" size={16} />
                </button>
              </div>
              <div className="ord-customer-note">
                {note || (
                  <span className="ord-customer-note--empty">
                    Inga anteckningar
                  </span>
                )}
              </div>
            </div>

            {/* Taggar-kort (mirror ProductForm Produktorganisering-pattern) */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 12 }}
              >
                <span className="pf-card-title">Organisering</span>
              </div>

              <label
                className="admin-label"
                style={{ display: "block", marginBottom: 4 }}
              >
                Taggar
              </label>
              <div className="pf-collection-trigger">
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder=""
                />
              </div>
              {tags.length > 0 && (
                <div className="pf-collection-pills">
                  {tags.map((tag) => (
                    <span key={tag} className="pf-collection-pill">
                      {tag}
                      <button
                        type="button"
                        className="pf-collection-pill__remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Ta bort ${tag}`}
                      >
                        <EditorIcon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {saveError && (
          <div className="pf-error-banner">
            <EditorIcon name="error" size={16} />
            <span>{saveError}</span>
            <button
              type="button"
              className="pf-error-banner__close"
              onClick={() => setSaveError(null)}
            >
              <EditorIcon name="close" size={14} />
            </button>
          </div>
        )}

        <PublishBarUI
          hasUnsavedChanges={dirty}
          isPublishing={isSaving}
          isDiscarding={isDiscarding}
          isLingeringAfterPublish={savedAt}
          onPublish={handleSave}
          onDiscard={handleDiscard}
        />
      </div>

      {/* Anteckningar-modal — identisk struktur med ordrar */}
      {noteModalOpen && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setNoteModalOpen(false)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                boxShadow: "0 24px 48px rgba(0,0,0,0.16)",
                width: 480,
                maxWidth: "90vw",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--admin-border)",
                  background: "#f3f3f4",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--admin-text)",
                  }}
                >
                  Redigera anteckningar
                </span>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    border: "none",
                    borderRadius: 6,
                    background: "none",
                    color: "var(--admin-text-tertiary)",
                    cursor: "pointer",
                  }}
                  onClick={() => setNoteModalOpen(false)}
                  aria-label="Stäng"
                >
                  <EditorIcon name="close" size={18} />
                </button>
              </div>
              <div style={{ padding: 20 }}>
                <textarea
                  style={{
                    width: "100%",
                    border: "1px solid var(--admin-border)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: "var(--font-sm)",
                    fontFamily: "inherit",
                    fontWeight: 400,
                    color: "var(--admin-text)",
                    background: "#fff",
                    resize: "vertical",
                    lineHeight: 1.5,
                    minHeight: 100,
                    outline: "none",
                  }}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Skriv en anteckning..."
                  rows={4}
                  maxLength={1000}
                  autoFocus
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "#616161",
                    marginTop: 0,
                    lineHeight: 1.4,
                  }}
                >
                  Interna anteckningar om kunden — synliga endast för personalen.
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  padding: "12px 20px",
                  borderTop: "1px solid var(--admin-border)",
                }}
              >
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  onClick={() => setNoteModalOpen(false)}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  className={`admin-btn ${noteDraft.trim() !== (note ?? "") ? "admin-btn--accent" : ""}`}
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  disabled={noteDraft.trim() === (note ?? "")}
                  onClick={() => {
                    setNote(noteDraft);
                    setNoteModalOpen(false);
                  }}
                >
                  Spara
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
