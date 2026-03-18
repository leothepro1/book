"use client";

/**
 * Link Field — LinkPicker-powered destination selector
 * ═══════════════════════════════════════════════════════════════
 *
 * Uses the global LinkPicker component (same as /menus).
 * Input field that opens LinkPicker popup on focus.
 * Stores result as RichTextLinkData for backward compatibility
 * with ElementLinkWrapper rendering.
 *
 * VALUE FORMAT (stored in element settings):
 *   null                         — no link
 *   { type, target, payload }    — RichTextLinkData
 */

import React, { useCallback, useState, useRef, useMemo } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { LinkPicker } from "@/app/_components/LinkPicker";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { getMapThumbnail } from "@/app/(admin)/maps/maps-constants";
import type { RichTextLinkData } from "./richTextLinkTypes";
import { DEFAULT_TARGET } from "./richTextLinkTypes";

// ═══════════════════════════════════════════════════════════════
// URL → RichTextLinkData conversion
// ═══════════════════════════════════════════════════════════════

function urlToLinkData(url: string): RichTextLinkData {
  if (url.startsWith("mailto:")) {
    const mailtoUrl = url.replace("mailto:", "");
    const [email] = mailtoUrl.split("?");
    return {
      type: "email",
      target: DEFAULT_TARGET.email,
      payload: { email: decodeURIComponent(email), subject: "" },
    };
  }
  if (url.startsWith("tel:")) {
    return {
      type: "phone",
      target: DEFAULT_TARGET.phone,
      payload: { phone: url.replace("tel:", "") },
    };
  }
  if (url.includes(".pdf") || url.includes("cloudinary.com")) {
    const filename = url.split("/").pop()?.split("?")[0] ?? "";
    if (filename.endsWith(".pdf")) {
      return {
        type: "document",
        target: DEFAULT_TARGET.document,
        payload: { fileUrl: url, fileName: filename, filePublicId: "", fileDescription: "" },
      };
    }
  }
  // #map:, #text:, internal paths, external URLs — all stored as url type
  const isExternal = url.startsWith("http");
  return {
    type: "url",
    target: DEFAULT_TARGET.url,
    payload: { href: url, openInNewTab: isExternal },
  };
}

// ═══════════════════════════════════════════════════════════════
// RichTextLinkData → display (formatted or raw URL)
// ═══════════════════════════════════════════════════════════════

type LinkDisplay = { prefix: string; name: string } | null;

function getLinkDisplay(data: RichTextLinkData, maps: { id: string; name: string }[]): LinkDisplay {
  switch (data.type) {
    case "url": {
      const href = (data.payload as { href: string }).href;
      if (href.startsWith("#map:")) {
        const mapId = href.slice(5);
        const map = maps.find((m) => m.id === mapId);
        return { prefix: "Karta:", name: map?.name ?? mapId };
      }
      if (href.startsWith("#text:")) {
        const content = decodeURIComponent(href.slice(6));
        return { prefix: "Text —", name: content.length > 40 ? content.slice(0, 40) + "…" : content };
      }
      return null;
    }
    case "document": {
      const fileName = (data.payload as { fileName: string }).fileName;
      return { prefix: "Dokument:", name: fileName || "dokument" };
    }
    default:
      return null;
  }
}

function linkDataToRawUrl(data: RichTextLinkData): string {
  switch (data.type) {
    case "url":
      return (data.payload as { href: string }).href;
    case "email":
      return (data.payload as { email: string }).email;
    case "phone":
      return (data.payload as { phone: string }).phone;
    case "document":
      return (data.payload as { fileName: string }).fileName || "Dokument";
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
  const { config } = usePreview();
  const linkData = value as RichTextLinkData | null;
  const anchorRef = useRef<HTMLElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Maps for LinkPicker
  const maps = useMemo(
    () => (config?.maps ?? []).map((m) => ({ id: m.id, name: m.name, thumbnail: getMapThumbnail(m.style) })),
    [config?.maps],
  );

  // Formatted display for special links (map, text, document)
  const display = linkData ? getLinkDisplay(linkData, maps) : null;
  const rawUrl = linkData ? linkDataToRawUrl(linkData) : "";

  const handleSelect = useCallback(
    (url: string, _label: string) => {
      const data = urlToLinkData(url);
      onChange(field.key, data);
      setPickerOpen(false);
      setInputValue("");
    },
    [field.key, onChange],
  );

  const handleRemove = useCallback(() => {
    onChange(field.key, null);
    setInputValue("");
  }, [field.key, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleFocus = useCallback(() => {
    setPickerOpen(true);
  }, []);

  return (
    <FieldWrapper field={field}>
      <div style={{ position: "relative" }}>
        {linkData ? (
          <div className="fl-current">
            {display ? (
              <div
                ref={anchorRef as React.RefObject<HTMLDivElement>}
                className="fl-current__display"
                onClick={handleFocus}
                tabIndex={0}
                onFocus={handleFocus}
              >
                <span className="fl-current__prefix">{display.prefix}</span>
                {" "}
                <span className="fl-current__name">{display.name}</span>
              </div>
            ) : (
              <input
                ref={anchorRef as React.RefObject<HTMLInputElement>}
                type="text"
                className="fl-current__input"
                value={rawUrl}
                readOnly
                onFocus={handleFocus}
              />
            )}
            <button
              type="button"
              className="fl-current__btn fl-current__btn--remove"
              onClick={handleRemove}
              aria-label="Ta bort länk"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        ) : (
          <input
            ref={anchorRef as React.RefObject<HTMLInputElement>}
            type="text"
            className="fl-link-input"
            placeholder="Sök eller klistra in länk…"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
          />
        )}
        <LinkPicker
          open={pickerOpen}
          anchorRef={anchorRef}
          maps={maps}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      </div>
    </FieldWrapper>
  );
}
