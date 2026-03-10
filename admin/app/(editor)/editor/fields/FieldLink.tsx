"use client";

/**
 * Link Field — Destination picker for click behavior
 * ═══════════════════════════════════════════════════════════════
 *
 * Standalone settings field that configures what happens when the
 * user clicks on an element (heading, button, image, etc.).
 *
 * The text/content is NOT affected — only the click destination.
 * Supports 6 destination types: URL, Document, Email, Phone,
 * Contact (modal), and Text (modal).
 *
 * VALUE FORMAT (stored in element settings):
 *   null                         — no link
 *   { type, target, payload }    — RichTextLinkData
 *
 * CSS prefix: rt-link-* (reuses link modal styles)
 */

import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { RichTextLinkModal } from "./RichTextLinkModal";
import type {
  RichTextLinkData,
  RichTextLinkType,
} from "./richTextLinkTypes";

// ═══════════════════════════════════════════════════════════════
// LABEL MAP
// ═══════════════════════════════════════════════════════════════

const TYPE_LABELS: Record<RichTextLinkType, string> = {
  url: "Länk",
  document: "Dokument",
  email: "E-post",
  phone: "Telefonnummer",
  contact: "Kontaktuppgifter",
  text: "Text",
};

function summarizeLink(data: RichTextLinkData): string {
  switch (data.type) {
    case "url":
      return (data.payload as { href: string }).href;
    case "document":
      return (data.payload as { fileName: string }).fileName || "Dokument";
    case "email":
      return (data.payload as { email: string }).email;
    case "phone":
      return (data.payload as { phone: string }).phone;
    case "contact":
      return (data.payload as { contactName: string }).contactName || "Kontakt";
    case "text": {
      const content = (data.payload as { content: string }).content;
      return content.length > 40 ? content.slice(0, 40) + "…" : content;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldLink({ field, value, onChange }: Props) {
  const [showModal, setShowModal] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = React.useState<Element | null>(null);
  const linkData = value as RichTextLinkData | null;

  // Resolve portal target on mount AND on showModal (in case DOM wasn't ready at mount)
  React.useEffect(() => {
    if (containerRef.current) {
      const dp = containerRef.current.closest(".dp");
      if (dp) setPortalTarget(dp);
    }
  }, [showModal]);

  const handleConfirm = useCallback(
    (data: RichTextLinkData) => {
      onChange(field.key, data);
      setShowModal(false);
    },
    [field.key, onChange]
  );

  const handleRemove = useCallback(() => {
    onChange(field.key, null);
    setShowModal(false);
  }, [field.key, onChange]);

  const modalElement = showModal ? (
    <RichTextLinkModal
      initialData={linkData}
      isEditing={linkData !== null}
      onConfirm={handleConfirm}
      onRemove={linkData ? handleRemove : undefined}
      onClose={() => setShowModal(false)}
    />
  ) : null;

  return (
    <FieldWrapper field={field}>
      <div ref={containerRef}>
        {linkData ? (
          <div className="fl-current">
            <div className="fl-current__info">
              <span className="fl-current__type">{TYPE_LABELS[linkData.type]}</span>
              <span className="fl-current__summary">{summarizeLink(linkData)}</span>
            </div>
            <div className="fl-current__actions">
              <button
                type="button"
                className="fl-current__btn"
                onClick={() => setShowModal(true)}
              >
                Ändra
              </button>
              <button
                type="button"
                className="fl-current__btn fl-current__btn--remove"
                onClick={() => onChange(field.key, null)}
              >
                Ta bort
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="fl-add-btn"
            onClick={() => setShowModal(true)}
          >
            <LinkPlusIcon />
            <span>Lägg till länk</span>
          </button>
        )}
      </div>
      {modalElement && portalTarget
        ? createPortal(modalElement, portalTarget)
        : modalElement}
    </FieldWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function LinkPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M15.842 4.175a3.746 3.746 0 0 0-5.298 0l-2.116 2.117a3.75 3.75 0 0 0 .01 5.313l.338.336a.75.75 0 1 0 1.057-1.064l-.339-.337a2.25 2.25 0 0 1-.005-3.187l2.116-2.117a2.246 2.246 0 1 1 3.173 3.18l-1.052 1.047a.75.75 0 0 0 1.058 1.064l1.052-1.047a3.746 3.746 0 0 0 .006-5.305Zm-11.664 11.67a3.75 3.75 0 0 0 5.304 0l2.121-2.121a3.75 3.75 0 0 0 0-5.303l-.362-.362a.75.75 0 0 0-1.06 1.06l.362.362a2.25 2.25 0 0 1 0 3.182l-2.122 2.122a2.25 2.25 0 1 1-3.182-3.182l1.07-1.07a.75.75 0 1 0-1.062-1.06l-1.069 1.069a3.75 3.75 0 0 0 0 5.303Z"
      />
    </svg>
  );
}
