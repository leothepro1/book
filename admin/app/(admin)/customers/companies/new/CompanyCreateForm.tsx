"use client";

/**
 * CompanyCreateForm — identisk struktur med /products/new → ProductForm.
 *
 * Återanvänder direkt:
 *   - .products-page container (product-form.css)
 *   - .pf-header / .pf-header__actions
 *   - .pf-body  /  .pf-main  (70%)  /  .pf-sidebar (30%)
 *   - CARD objekt inline style
 *   - .pf-field + .admin-label + .email-sender__input
 *   - .admin-dropdown pattern för select-menyer
 *   - .pf-collection-trigger + .pf-collection-pills + .pf-collection-pill för taggar
 *   - .pf-checkbox-row för toggle-rader
 *   - .pf-error-banner för felmeddelande
 *   - PublishBarUI för spara/ignorera
 *
 * Inga nya klasser. Inga uppfinningar. Samma React-hooks + useTransition +
 * samma { ok, error } server-action pattern som ProductForm.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import {
  createCompanyAction,
  searchGuestsForCompanyContact,
} from "../actions";
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

interface PaymentTermOption {
  id: string;
  name: string;
}

export default function CompanyCreateForm({
  paymentTermsOptions,
}: {
  paymentTermsOptions: PaymentTermOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Section 1 ── Företagsuppgifter
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [note, setNote] = useState("");

  // Taggar (exakt som products)
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

  // ── Section 2 ── Faktureringsadress (adress)
  const [billLine1, setBillLine1] = useState("");
  const [billLine2, setBillLine2] = useState("");
  const [billPostalCode, setBillPostalCode] = useState("");
  const [billCity, setBillCity] = useState("");
  const [billCountry, setBillCountry] = useState("SE");

  // ── Anteckningar-modal (identisk struktur med ordrar) ──
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // ── Section 3 ── Huvudkontakt (search + Bläddra, precis som rabatter)
  // Endast en kontakt väljs. Efter FAS 5.5 finns ingen roll — varje kontakt
  // som har access till en plats har fullständiga rättigheter där.
  type GuestOption = { id: string; name: string; email: string };
  const [pickedGuest, setPickedGuest] = useState<GuestOption | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<GuestOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPickerResults = useCallback(async (query: string) => {
    setPickerLoading(true);
    const results = await searchGuestsForCompanyContact(query);
    setPickerResults(results);
    setPickerLoading(false);
  }, []);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerSearch("");
    loadPickerResults("");
  }, [loadPickerResults]);

  const handlePickerSearch = useCallback(
    (query: string) => {
      setPickerSearch(query);
      if (pickerSearchTimer.current) clearTimeout(pickerSearchTimer.current);
      pickerSearchTimer.current = setTimeout(() => loadPickerResults(query), 300);
    },
    [loadPickerResults],
  );

  const pickGuest = useCallback((guest: GuestOption) => {
    setPickedGuest(guest);
    setPickerOpen(false);
  }, []);

  // ── Sidebar ── Betalningsvillkor + Skatt
  const [paymentTermsId, setPaymentTermsId] = useState<string>("");
  const [paymentTermsOpen, setPaymentTermsOpen] = useState(false);
  const paymentTermsRef = useRef<HTMLDivElement>(null);

  // Organisationsnummer lever i Företagsuppgifter-kortet.
  const [taxId, setTaxId] = useState("");

  const [taxSetting, setTaxSetting] = useState<
    "COLLECT" | "EXEMPT" | "COLLECT_UNLESS_EXEMPT"
  >("COLLECT");
  const [taxSettingOpen, setTaxSettingOpen] = useState(false);
  const taxSettingRef = useRef<HTMLDivElement>(null);

  // ── Outside-click for dropdowns (mirror ProductForm pattern) ──
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        paymentTermsRef.current &&
        !paymentTermsRef.current.contains(e.target as Node)
      ) {
        setPaymentTermsOpen(false);
      }
      if (
        taxSettingRef.current &&
        !taxSettingRef.current.contains(e.target as Node)
      ) {
        setTaxSettingOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Dirty tracking — mark on any state change.
  useEffect(() => {
    const anyFieldFilled =
      !!(
        name ||
        externalId ||
        note ||
        tags.length ||
        billLine1 ||
        billLine2 ||
        billPostalCode ||
        billCity ||
        pickedGuest ||
        paymentTermsId ||
        taxId
      ) ||
      billCountry !== "SE" ||
      taxSetting !== "COLLECT";
    setDirty(anyFieldFilled);
  }, [
    name,
    externalId,
    note,
    tags,
    billLine1,
    billLine2,
    billPostalCode,
    billCity,
    billCountry,
    pickedGuest,
    paymentTermsId,
    taxId,
    taxSetting,
  ]);

  // ── Validation ─────────────────────────────────────────────
  function validate(): string | null {
    if (!name.trim()) return "Företagsnamn krävs";
    if (!billLine1.trim() || !billCity.trim() || !billPostalCode.trim()) {
      return "Fullständig faktureringsadress krävs";
    }
    if (!pickedGuest) return "Välj en huvudkontakt";
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
      const result = await createCompanyAction({
        name: name.trim(),
        externalId: externalId.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        note: note.trim() || undefined,
        firstLocation: {
          // Platsens namn speglar företagsnamnet. Små företag har en plats;
          // större kan döpa om eller lägga till fler från detaljsidan.
          name: name.trim(),
          billingAddress: {
            line1: billLine1.trim(),
            line2: billLine2.trim() || undefined,
            postalCode: billPostalCode.trim(),
            city: billCity.trim(),
            country: billCountry.trim() || "SE",
          } as Record<string, unknown>,
          // Inga separata leveransadresser — beställningar levereras till
          // faktureringsadressen. shippingAddress lämnas som undefined.
          shippingAddress: undefined,
        },
        mainContact: {
          guestAccountId: pickedGuest!.id,
        },
      });

      setIsSaving(false);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      router.push(`/customers/companies/${result.data.companyId}`);
    });
  }, [
    name,
    externalId,
    note,
    tags,
    billLine1,
    billLine2,
    billPostalCode,
    billCity,
    billCountry,
    pickedGuest,
    router,
  ]);

  const handleDiscard = useCallback(() => {
    if (dirty && !confirm("Osparade ändringar — lämna formuläret?")) return;
    setIsDiscarding(true);
    setTimeout(() => router.push("/customers/companies"), 100);
  }, [dirty, router]);

  const breadcrumbTitle = name.trim() || "Skapa företag";

  const selectedTerm = paymentTermsOptions.find((t) => t.id === paymentTermsId);
  const taxSettingLabel =
    taxSetting === "COLLECT"
      ? "Samla in moms"
      : taxSetting === "EXEMPT"
        ? "Momsbefriad"
        : "Samla in om inte befriad";

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header (mirror ProductForm line 468-531) ── */}
        <div className="admin-header pf-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/customers/companies")}
              aria-label="Tillbaka till företag"
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 22 }}
              >
                domain
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

        {/* ── Body (mirror ProductForm line 534-1042) ── */}
        <div className="pf-body">
          {/* LEFT — 70% */}
          <div className="pf-main">
            {/* Card 1: Företagsuppgifter */}
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Företagsnamn</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="T.ex. Grand Hotel AB"
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Externt ID</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  placeholder="Används för synk med ERP eller PMS"
                />
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Organisationsnummer</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="T.ex. SE556677889901"
                />
              </div>
            </div>

            {/* Card 2: Huvudkontakt — search + Bläddra, precis som rabatter */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 12 }}
              >
                <span className="pf-card-title">Huvudkontakt</span>
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Kund</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div
                    className="pf-collection-trigger"
                    style={{ flex: 1 }}
                  >
                    <EditorIcon
                      name="search"
                      size={18}
                      style={{
                        color: "var(--admin-text-tertiary)",
                        flexShrink: 0,
                      }}
                    />
                    <input
                      type="text"
                      className="pf-collection-trigger__input"
                      placeholder="Sök kunder"
                      onFocus={openPicker}
                      readOnly
                    />
                  </div>
                  <button
                    type="button"
                    className="settings-btn--muted"
                    onClick={openPicker}
                  >
                    Bläddra
                  </button>
                </div>

                {/* Vald kontakt (exakt samma rad-visuell som rabatter) */}
                {pickedGuest && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0,
                      marginTop: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 0",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {pickedGuest.name && (
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--admin-text)",
                              fontWeight: 500,
                            }}
                          >
                            {pickedGuest.name}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--admin-text-secondary)",
                          }}
                        >
                          {pickedGuest.email}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickedGuest(null)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--admin-text-secondary)",
                          display: "flex",
                        }}
                        aria-label={`Ta bort ${pickedGuest.name || pickedGuest.email}`}
                      >
                        <EditorIcon name="close" size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Faktureringsadress */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 12 }}
              >
                <span className="pf-card-title">Faktureringsadress</span>
              </div>

              <div className="pf-field">
                <label className="admin-label">Gatuadress</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={billLine1}
                  onChange={(e) => setBillLine1(e.target.value)}
                />
              </div>

              <div className="pf-field">
                <label className="admin-label">Adresstillägg</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={billLine2}
                  onChange={(e) => setBillLine2(e.target.value)}
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
                    value={billPostalCode}
                    onChange={(e) => setBillPostalCode(e.target.value)}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="admin-label">Ort</label>
                  <input
                    type="text"
                    className="email-sender__input"
                    value={billCity}
                    onChange={(e) => setBillCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Land</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={billCountry}
                  onChange={(e) => setBillCountry(e.target.value)}
                  placeholder="SE"
                />
              </div>
            </div>
          </div>

          {/* RIGHT — 30% (mirror ProductForm sidebar) */}
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

            {/* Betalningsvillkor */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 8 }}
              >
                <span className="pf-card-title">Betalningsvillkor</span>
              </div>
              <div className="admin-dropdown" ref={paymentTermsRef}>
                <button
                  type="button"
                  className="admin-dropdown__trigger"
                  onClick={() => setPaymentTermsOpen(!paymentTermsOpen)}
                >
                  <span
                    className="admin-dropdown__text"
                    style={{ textAlign: "left" }}
                  >
                    {selectedTerm?.name ?? "Inga villkor"}
                  </span>
                  <EditorIcon
                    name="expand_more"
                    size={18}
                    className="admin-dropdown__chevron"
                  />
                </button>
                {paymentTermsOpen && (
                  <div className="admin-dropdown__list">
                    <button
                      type="button"
                      className={`admin-dropdown__item${paymentTermsId === "" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => {
                        setPaymentTermsId("");
                        setPaymentTermsOpen(false);
                      }}
                    >
                      Inga villkor
                      {paymentTermsId === "" && (
                        <span className="admin-dropdown__check">✓</span>
                      )}
                    </button>
                    {paymentTermsOptions.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`admin-dropdown__item${paymentTermsId === t.id ? " admin-dropdown__item--active" : ""}`}
                        onClick={() => {
                          setPaymentTermsId(t.id);
                          setPaymentTermsOpen(false);
                        }}
                      >
                        {t.name}
                        {paymentTermsId === t.id && (
                          <span className="admin-dropdown__check">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Skatt */}
            <div style={CARD}>
              <div
                className="pf-card-header"
                style={{ marginBottom: 7 }}
              >
                <span className="pf-card-title">Skatt</span>
              </div>

              <div className="pf-field" style={{ marginBottom: 0 }}>
                <div className="admin-dropdown" ref={taxSettingRef}>
                  <button
                    type="button"
                    className="admin-dropdown__trigger"
                    onClick={() => setTaxSettingOpen(!taxSettingOpen)}
                  >
                    <span
                      className="admin-dropdown__text"
                      style={{ textAlign: "left" }}
                    >
                      {taxSettingLabel}
                    </span>
                    <EditorIcon
                      name="expand_more"
                      size={18}
                      className="admin-dropdown__chevron"
                    />
                  </button>
                  {taxSettingOpen && (
                    <div className="admin-dropdown__list">
                      {(
                        [
                          ["COLLECT", "Samla in moms"],
                          ["EXEMPT", "Momsbefriad"],
                          ["COLLECT_UNLESS_EXEMPT", "Samla in om inte befriad"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`admin-dropdown__item${taxSetting === value ? " admin-dropdown__item--active" : ""}`}
                          onClick={() => {
                            setTaxSetting(value);
                            setTaxSettingOpen(false);
                          }}
                        >
                          {label}
                          {taxSetting === value && (
                            <span className="admin-dropdown__check">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error banner — mirror ProductForm line 1044-1053 */}
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

        {/* Publish bar — same component, same props */}
        <PublishBarUI
          hasUnsavedChanges={dirty}
          isPublishing={isSaving}
          isDiscarding={isDiscarding}
          isLingeringAfterPublish={savedAt}
          onPublish={handleSave}
          onDiscard={handleDiscard}
        />
      </div>

      {/* Kund-picker-modal — identisk struktur med rabatter's behörighets-picker.
          Single-select: klick på en kund väljer + stänger omedelbart. */}
      {pickerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={() => setPickerOpen(false)}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--admin-overlay)",
                animation: "settings-modal-fade-in 0.15s ease",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                background: "var(--admin-surface)",
                borderRadius: 16,
                width: 560,
                maxHeight: "80vh",
                minHeight: 450,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                animation:
                  "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "20px 20px 12px",
                  borderBottom: "1px solid #EBEBEB",
                  background: "#f3f3f3",
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                  Välj kund
                </h3>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--admin-text-secondary)",
                  }}
                  aria-label="Stäng"
                >
                  <EditorIcon name="close" size={20} />
                </button>
              </div>

              <div
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid #EBEBEB",
                }}
              >
                <div className="pf-collection-trigger">
                  <EditorIcon
                    name="search"
                    size={18}
                    style={{
                      color: "var(--admin-text-tertiary)",
                      flexShrink: 0,
                    }}
                  />
                  <input
                    type="text"
                    className="pf-collection-trigger__input"
                    value={pickerSearch}
                    onChange={(e) => handlePickerSearch(e.target.value)}
                    placeholder="Sök kunder"
                    autoFocus
                  />
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {pickerLoading &&
                  pickerResults.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={`skel-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 20px",
                        borderBottom: "1px solid #EBEBEB",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 12,
                          borderRadius: 4,
                          background: "#e8e8e8",
                          animation:
                            "skeleton-shimmer 1.2s ease-in-out infinite",
                          animationDelay: `${i * 0.05}s`,
                        }}
                      />
                    </div>
                  ))}
                {pickerResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => pickGuest(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 20px",
                      cursor: "pointer",
                      borderBottom: "1px solid #EBEBEB",
                    }}
                  >
                    <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                      {item.name && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--admin-text)",
                            fontWeight: 500,
                          }}
                        >
                          {item.name}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--admin-text-secondary)",
                        }}
                      >
                        {item.email}
                      </div>
                    </div>
                  </div>
                ))}
                {!pickerLoading && pickerResults.length === 0 && (
                  <p
                    style={{
                      padding: 20,
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--admin-text-tertiary)",
                      margin: 0,
                    }}
                  >
                    Inga kunder hittades
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Anteckningar-modal — identisk struktur med ordrar's Anteckningar.
          Skillnaden: i create-kontexten sparar modalen bara lokalt state
          (ingen server-call); det riktiga persistet sker vid publish. */}
      {noteModalOpen && (
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
                Interna anteckningar om företaget — synliga endast för personalen.
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
        </div>
      )}
    </div>
  );
}
