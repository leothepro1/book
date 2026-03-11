"use client";

/**
 * Rich Text Link Modal — Multi-type link destination picker
 * ═══════════════════════════════════════════════════════════════
 *
 * Replaces the simple URL-only link modal with a 6-type system:
 *   1. Länk (URL)       — external web link
 *   2. Dokument (PDF)   — file upload via Cloudinary
 *   3. E-post (email)   — mailto: link
 *   4. Telefonnummer     — tel: link
 *   5. Kontaktuppgifter  — full contact card (modal)
 *   6. Text              — rich text content (modal)
 *
 * LAYOUT:
 *   ┌──────────────────────────────────┐
 *   │ Infoga länk                  [×] │
 *   ├──────────────────────────────────┤
 *   │ ┌ bg: #F1F1F1 ──────────────┐   │
 *   │ │ Typ                       │   │
 *   │ │ [▾ Länk              ]    │   │
 *   │ │                           │   │
 *   │ │ < type-specific fields >  │   │
 *   │ │                           │   │
 *   │ │ □ Öppna i nytt fönster    │   │
 *   │ └───────────────────────────┘   │
 *   │            [Ta bort]  [Infoga]   │
 *   └──────────────────────────────────┘
 *
 * CSS prefix: rt-link-* (reuses existing link modal styles)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type RichTextLinkData,
  type RichTextLinkType,
  type RichTextLinkPayload,
  type UrlPayload,
  type DocumentPayload,
  type EmailPayload,
  type PhonePayload,
  type ContactPayload,
  type TextPayload,
  LINK_TYPE_OPTIONS,
  DEFAULT_TARGET,
  SHOWS_NEW_TAB_CHECKBOX,
  COUNTRIES,
  createEmptyPayload,
  validatePayload,
} from "./richTextLinkTypes";
import { useUpload } from "@/app/(admin)/_hooks/useUpload";
import { EditorIcon } from "@/app/_components/EditorIcon";

// ═══════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════

type Props = {
  /** Initial data when editing an existing link. Null for new links. */
  initialData: RichTextLinkData | null;
  isEditing: boolean;
  onConfirm: (data: RichTextLinkData) => void;
  onRemove?: () => void;
  onClose: () => void;
};

// ═══════════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════════

export function RichTextLinkModal({
  initialData,
  isEditing,
  onConfirm,
  onRemove,
  onClose,
}: Props) {
  const [linkType, setLinkType] = useState<RichTextLinkType>(
    initialData?.type ?? "url"
  );
  const [payload, setPayload] = useState<RichTextLinkPayload>(
    initialData?.payload ?? createEmptyPayload("url")
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Escape closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleTypeChange = useCallback((newType: RichTextLinkType) => {
    setLinkType(newType);
    setPayload(createEmptyPayload(newType));
    setDropdownOpen(false);
  }, []);

  const updatePayload = useCallback(
    (partial: Partial<RichTextLinkPayload>) => {
      setPayload((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const isValid = validatePayload(linkType, payload);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;
    onConfirm({
      type: linkType,
      target: DEFAULT_TARGET[linkType],
      payload,
    });
  }, [isValid, linkType, payload, onConfirm]);

  const showCheckbox = SHOWS_NEW_TAB_CHECKBOX[linkType];
  const selectedOption = LINK_TYPE_OPTIONS.find((o) => o.value === linkType)!;

  return (
    <div className="rt-link-overlay">
      <div className="rt-link-modal" role="dialog" aria-label="Infoga länk">
        {/* ── Header ── */}
        <div className="rt-link-modal__header">
          <span className="rt-link-modal__title">
            {isEditing ? "Redigera länk" : "Infoga länk"}
          </span>
          <button
            type="button"
            className="rt-link-modal__close"
            onClick={onClose}
            aria-label="Stäng"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="rt-link-modal__body rt-link-modal__body--scrollable">
          {/* Type selector dropdown */}
          <div className="rt-link-modal__field">
            <label className="rt-link-modal__label">Typ</label>
            <div className="rt-type-dropdown" ref={dropdownRef}>
              <button
                type="button"
                className="rt-type-dropdown__trigger"
                onClick={() => setDropdownOpen((v) => !v)}
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
              >
                <TypeIcon type={selectedOption.value} />
                <span className="rt-type-dropdown__text">{selectedOption.label}</span>
                <ChevronIcon open={dropdownOpen} />
              </button>
              {dropdownOpen && (
                <ul className="rt-type-dropdown__menu" role="listbox">
                  {LINK_TYPE_OPTIONS.map((opt) => (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={opt.value === linkType}
                      className={`rt-type-dropdown__item${
                        opt.value === linkType ? " rt-type-dropdown__item--active" : ""
                      }`}
                      onClick={() => handleTypeChange(opt.value)}
                    >
                      <TypeIcon type={opt.value} />
                      <span>{opt.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Type-specific form */}
          <TypeForm
            type={linkType}
            payload={payload}
            onChange={updatePayload}
            onSubmit={handleSubmit}
          />

          {/* New tab checkbox (only for url + document) */}
          {showCheckbox && (
            <label className="rt-link-modal__checkbox">
              <input
                type="checkbox"
                checked={
                  linkType === "url"
                    ? (payload as UrlPayload).openInNewTab
                    : false
                }
                onChange={(e) =>
                  updatePayload({ openInNewTab: e.target.checked } as Partial<UrlPayload>)
                }
              />
              <span>Öppna den här länken i ett nytt fönster</span>
            </label>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="rt-link-modal__footer">
          {isEditing && onRemove && (
            <button
              type="button"
              className="rt-link-modal__btn rt-link-modal__btn--remove"
              onClick={onRemove}
            >
              Ta bort länk
            </button>
          )}
          <div className="rt-link-modal__spacer" />
          <button
            type="button"
            className="rt-link-modal__btn rt-link-modal__btn--primary"
            disabled={!isValid}
            onClick={handleSubmit}
          >
            {isEditing ? "Uppdatera" : "Infoga länk"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TYPE-SPECIFIC FORMS
// ═══════════════════════════════════════════════════════════════

type TypeFormProps = {
  type: RichTextLinkType;
  payload: RichTextLinkPayload;
  onChange: (partial: Partial<RichTextLinkPayload>) => void;
  onSubmit: () => void;
};

function TypeForm({ type, payload, onChange, onSubmit }: TypeFormProps) {
  switch (type) {
    case "url":
      return <UrlForm payload={payload as UrlPayload} onChange={onChange} onSubmit={onSubmit} />;
    case "document":
      return <DocumentForm payload={payload as DocumentPayload} onChange={onChange} />;
    case "email":
      return <EmailForm payload={payload as EmailPayload} onChange={onChange} onSubmit={onSubmit} />;
    case "phone":
      return <PhoneForm payload={payload as PhonePayload} onChange={onChange} onSubmit={onSubmit} />;
    case "contact":
      return <ContactForm payload={payload as ContactPayload} onChange={onChange} />;
    case "text":
      return <TextForm payload={payload as TextPayload} onChange={onChange} />;
  }
}

// ── URL Form ──

function UrlForm({
  payload,
  onChange,
  onSubmit,
}: {
  payload: UrlPayload;
  onChange: (p: Partial<UrlPayload>) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const isValid =
    !payload.href.trim() ||
    (() => {
      try {
        const u = new URL(payload.href);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    })();
  const showError = touched && payload.href.length > 0 && !isValid;

  return (
    <div className="rt-link-modal__field">
      <label className="rt-link-modal__label" htmlFor="rt-link-href">
        Länk
      </label>
      <input
        ref={inputRef}
        id="rt-link-href"
        type="url"
        className={`rt-link-modal__input${showError ? " rt-link-modal__input--error" : ""}`}
        value={payload.href}
        onChange={(e) => {
          onChange({ href: e.target.value });
          setTouched(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Klistra in en länk eller sök"
        autoComplete="off"
        spellCheck={false}
      />
      <span className={`rt-link-modal__hint${showError ? " rt-link-modal__hint--error" : ""}`}>
        {showError
          ? "Ange en giltig webbadress (t.ex. https://example.com)"
          : "http:// krävs för länkar"}
      </span>
    </div>
  );
}

// ── Document Form ──

function DocumentForm({
  payload,
  onChange,
}: {
  payload: DocumentPayload;
  onChange: (p: Partial<DocumentPayload>) => void;
}) {
  const { isUploading, error, upload } = useUpload("hospitality/documents");
  const [preview, setPreview] = useState<string>(
    payload.fileUrl
      ? payload.fileUrl.replace("/upload/", "/upload/pg_1,w_600,f_jpg/")
      : ""
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      upload(
        file,
        (localUrl) => setPreview(localUrl),
        (result) => {
          onChange({
            fileUrl: result.url,
            fileName: file.name,
            filePublicId: result.publicId,
          });
          setPreview(result.url.replace("/upload/", "/upload/pg_1,w_600,f_jpg/"));
        }
      );
    },
    [upload, onChange]
  );

  return (
    <>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">Dokument</label>
        {payload.fileUrl ? (
          <div className="rt-doc-preview">
            {preview && (
              <img
                src={preview}
                alt={payload.fileName}
                className="rt-doc-preview__img"
              />
            )}
            <div className="rt-doc-preview__info">
              <span className="rt-doc-preview__name">{payload.fileName}</span>
              <button
                type="button"
                className="rt-doc-preview__change"
                onClick={() => fileInputRef.current?.click()}
              >
                Byt fil
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="rt-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Laddar upp…" : "Välj fil"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          className="rt-upload-input"
          onChange={handleFileChange}
        />
        {error && <span className="rt-link-modal__hint rt-link-modal__hint--error">{error}</span>}
        <span className="rt-link-modal__hint">PDF, Word, Excel eller PowerPoint</span>
      </div>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-doc-name">Namn</label>
        <input
          id="rt-link-doc-name"
          type="text"
          className="rt-link-modal__input"
          value={payload.fileName || ""}
          onChange={(e) => onChange({ fileName: e.target.value })}
          placeholder="Dokumentets namn"
        />
      </div>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-doc-desc">
          Beskrivning <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <textarea
          id="rt-link-doc-desc"
          className="rt-link-modal__input rt-link-modal__textarea"
          value={payload.fileDescription || ""}
          maxLength={240}
          onChange={(e) => onChange({ fileDescription: e.target.value })}
          placeholder="Kort beskrivning av dokumentet"
          rows={3}
        />
        <span className="rt-link-modal__hint">{(payload.fileDescription || "").length}/240</span>
      </div>
    </>
  );
}

// ── Email Form ──

function EmailForm({
  payload,
  onChange,
  onSubmit,
}: {
  payload: EmailPayload;
  onChange: (p: Partial<EmailPayload>) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-email">
          E-postadress
        </label>
        <input
          ref={inputRef}
          id="rt-link-email"
          type="email"
          className="rt-link-modal__input"
          value={payload.email}
          onChange={(e) => onChange({ email: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="namn@exempel.se"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-subject">
          Ämne <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <input
          id="rt-link-subject"
          type="text"
          className="rt-link-modal__input"
          value={payload.subject ?? ""}
          onChange={(e) => onChange({ subject: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ämnesrad"
          autoComplete="off"
        />
      </div>
    </>
  );
}

// ── Phone Form ──

function PhoneForm({
  payload,
  onChange,
  onSubmit,
}: {
  payload: PhonePayload;
  onChange: (p: Partial<PhonePayload>) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rt-link-modal__field">
      <label className="rt-link-modal__label" htmlFor="rt-link-phone">
        Telefonnummer
      </label>
      <input
        ref={inputRef}
        id="rt-link-phone"
        type="tel"
        className="rt-link-modal__input"
        value={payload.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="+46 70 123 45 67"
        autoComplete="off"
      />
      <span className="rt-link-modal__hint">Inkludera landskod (t.ex. +46)</span>
    </div>
  );
}

// ── Contact Form ──

function ContactForm({
  payload,
  onChange,
}: {
  payload: ContactPayload;
  onChange: (p: Partial<ContactPayload>) => void;
}) {
  return (
    <div className="rt-contact-form">
      {/* Name */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-contact-name">
          Kontaktnamn
        </label>
        <input
          id="rt-contact-name"
          type="text"
          className="rt-link-modal__input"
          value={payload.contactName}
          onChange={(e) => onChange({ contactName: e.target.value })}
          placeholder="Namn"
          autoComplete="off"
        />
      </div>

      {/* Phone 1 */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">Telefon 1</label>
        <div className="rt-phone-row">
          <input
            type="text"
            className="rt-link-modal__input rt-phone-row__prefix"
            value={payload.phone1Prefix}
            onChange={(e) => onChange({ phone1Prefix: e.target.value })}
            placeholder="+46"
          />
          <input
            type="tel"
            className="rt-link-modal__input rt-phone-row__number"
            value={payload.phone1Number}
            onChange={(e) => onChange({ phone1Number: e.target.value })}
            placeholder="Nummer"
          />
        </div>
      </div>

      {/* Phone 2 */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">
          Telefon 2 <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <div className="rt-phone-row">
          <input
            type="text"
            className="rt-link-modal__input rt-phone-row__prefix"
            value={payload.phone2Prefix}
            onChange={(e) => onChange({ phone2Prefix: e.target.value })}
            placeholder="+46"
          />
          <input
            type="tel"
            className="rt-link-modal__input rt-phone-row__number"
            value={payload.phone2Number}
            onChange={(e) => onChange({ phone2Number: e.target.value })}
            placeholder="Nummer"
          />
        </div>
      </div>

      {/* Fax 1 */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">
          Fax 1 <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <div className="rt-phone-row">
          <input
            type="text"
            className="rt-link-modal__input rt-phone-row__prefix"
            value={payload.fax1Prefix}
            onChange={(e) => onChange({ fax1Prefix: e.target.value })}
            placeholder="+46"
          />
          <input
            type="tel"
            className="rt-link-modal__input rt-phone-row__number"
            value={payload.fax1Number}
            onChange={(e) => onChange({ fax1Number: e.target.value })}
            placeholder="Nummer"
          />
        </div>
      </div>

      {/* Fax 2 */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">
          Fax 2 <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <div className="rt-phone-row">
          <input
            type="text"
            className="rt-link-modal__input rt-phone-row__prefix"
            value={payload.fax2Prefix}
            onChange={(e) => onChange({ fax2Prefix: e.target.value })}
            placeholder="+46"
          />
          <input
            type="tel"
            className="rt-link-modal__input rt-phone-row__number"
            value={payload.fax2Number}
            onChange={(e) => onChange({ fax2Number: e.target.value })}
            placeholder="Nummer"
          />
        </div>
      </div>

      {/* Address */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label">Adress</label>
        <input
          type="text"
          className="rt-link-modal__input"
          value={payload.addressLine1}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          placeholder="Adressrad 1"
          autoComplete="off"
        />
        <input
          type="text"
          className="rt-link-modal__input"
          value={payload.addressLine2}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
          placeholder="Adressrad 2 (valfritt)"
          autoComplete="off"
        />
      </div>

      {/* City + Zip */}
      <div className="rt-link-modal__field">
        <div className="rt-city-row">
          <div className="rt-city-row__zip">
            <label className="rt-link-modal__label" htmlFor="rt-contact-zip">
              Postnummer
            </label>
            <input
              id="rt-contact-zip"
              type="text"
              className="rt-link-modal__input"
              value={payload.zip}
              onChange={(e) => onChange({ zip: e.target.value })}
              placeholder="123 45"
            />
          </div>
          <div className="rt-city-row__city">
            <label className="rt-link-modal__label" htmlFor="rt-contact-city">
              Stad
            </label>
            <input
              id="rt-contact-city"
              type="text"
              className="rt-link-modal__input"
              value={payload.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="Stockholm"
            />
          </div>
        </div>
      </div>

      {/* Country */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-contact-country">
          Land
        </label>
        <select
          id="rt-contact-country"
          className="rt-link-modal__input rt-link-modal__select"
          value={payload.country}
          onChange={(e) => onChange({ country: e.target.value })}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-contact-notes">
          Anteckningar <span className="rt-link-modal__optional">(valfritt)</span>
        </label>
        <textarea
          id="rt-contact-notes"
          className="rt-link-modal__input rt-link-modal__textarea"
          value={payload.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Öppettider, avdelning, etc."
          rows={3}
        />
      </div>
    </div>
  );
}

// ── Text Form ──

function TextForm({
  payload,
  onChange,
}: {
  payload: TextPayload;
  onChange: (p: Partial<TextPayload>) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-text-title">Namn</label>
        <input
          ref={titleRef}
          id="rt-link-text-title"
          type="text"
          className="rt-link-modal__input"
          value={payload.title || ""}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Rubrik i modalen"
        />
      </div>
      <div className="rt-link-modal__field">
        <label className="rt-link-modal__label" htmlFor="rt-link-text">Textinnehåll</label>
        <textarea
          id="rt-link-text"
          className="rt-link-modal__input rt-link-modal__textarea"
          value={payload.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Skriv textinnehåll här…"
          rows={5}
        />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <EditorIcon
      name="expand_more"
      size={16}
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
    />
  );
}

function TypeIcon({ type }: { type: RichTextLinkType }) {
  switch (type) {
    case "url":
      return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M13.842 2.176a3.746 3.746 0 0 0-5.298 0l-2.116 2.116a3.75 3.75 0 0 0 .01 5.313l.338.337a.751.751 0 0 0 1.057-1.064l-.339-.338a2.25 2.25 0 0 1-.005-3.187l2.116-2.117a2.247 2.247 0 1 1 3.173 3.18l-1.052 1.048a.749.749 0 1 0 1.057 1.063l1.053-1.047a3.745 3.745 0 0 0 .006-5.304m-11.664 11.67a3.75 3.75 0 0 0 5.304 0l2.121-2.122a3.75 3.75 0 0 0 0-5.303l-.362-.362a.749.749 0 1 0-1.06 1.06l.361.363c.88.878.88 2.303 0 3.182l-2.12 2.121a2.25 2.25 0 0 1-3.183-3.182l1.07-1.069a.75.75 0 0 0-1.062-1.06l-1.069 1.068a3.75 3.75 0 0 0 0 5.304" />
        </svg>
      );
    case "document":
      return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5.25 4.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5z" />
          <path d="M4.5 8a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75" />
          <path d="M5.25 10a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5z" />
          <path fillRule="evenodd" d="M5.25 1.5a3.75 3.75 0 0 0-3.75 3.75v5.5a3.75 3.75 0 0 0 3.75 3.75h5.5a3.75 3.75 0 0 0 3.75-3.75v-5.5a3.75 3.75 0 0 0-3.75-3.75zm-2.25 3.75a2.25 2.25 0 0 1 2.25-2.25h5.5a2.25 2.25 0 0 1 2.25 2.25v5.5a2.25 2.25 0 0 1-2.25 2.25h-5.5a2.25 2.25 0 0 1-2.25-2.25z" />
        </svg>
      );
    case "email":
      return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3.75 2.5a2.75 2.75 0 0 0-2.75 2.75v5.5a2.75 2.75 0 0 0 2.75 2.75h8.5a2.75 2.75 0 0 0 2.75-2.75v-5.5a2.75 2.75 0 0 0-2.75-2.75zm-1.25 2.75c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25zm2.067.32a.75.75 0 0 0-.634 1.36l3.538 1.651c.335.156.723.156 1.058 0l3.538-1.651a.75.75 0 0 0-.634-1.36l-3.433 1.602z" />
        </svg>
      );
    case "phone":
      return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3.855 1.6a1.5 1.5 0 0 1 1.79.243l1.72 1.72a1.5 1.5 0 0 1 .147 1.94l-.834 1.112a.25.25 0 0 0-.02.26 8.4 8.4 0 0 0 2.468 2.467.25.25 0 0 0 .26-.02l1.112-.834a1.5 1.5 0 0 1 1.94.147l1.72 1.72a1.5 1.5 0 0 1 .243 1.79l-.674 1.349a1.5 1.5 0 0 1-1.395.806c-2.69-.073-5.323-1.2-7.346-3.224C2.96 9.052 1.834 6.42 1.76 3.73a1.5 1.5 0 0 1 .806-1.395zm1.257 1.304a.25.25 0 0 0-.298-.04L3.464 3.54a.25.25 0 0 0-.134.232c.065 2.345 1.065 4.636 2.855 6.426 1.79 1.79 4.081 2.79 6.426 2.855a.25.25 0 0 0 .232-.134l.675-1.35a.25.25 0 0 0-.04-.298l-1.72-1.72a.25.25 0 0 0-.324-.024l-1.112.834a1.75 1.75 0 0 1-1.82.142 9.9 9.9 0 0 1-2.907-2.907 1.75 1.75 0 0 1 .142-1.82l.834-1.112a.25.25 0 0 0-.024-.324z" />
        </svg>
      );
    case "contact":
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clipRule="evenodd" />
        </svg>
      );
    case "text":
      return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M9.75 2a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5z" />
          <path d="M9 6.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75" />
          <path d="M1.75 9a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5z" />
          <path d="M1.75 12.5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z" />
          <path d="M1 6.75a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-.5v-1a.25.25 0 0 1 .25-.25.75.75 0 0 0 0-1.5 1.75 1.75 0 0 0-1.75 1.75z" />
          <path d="M6.5 4.75v-1a.25.25 0 0 1 .25-.25.75.75 0 0 0 0-1.5 1.75 1.75 0 0 0-1.75 1.75v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1z" />
        </svg>
      );
  }
}
