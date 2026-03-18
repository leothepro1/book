"use client";

/**
 * Rich Text Field — Inline formatting with Bold, Italic + Link action
 * ═══════════════════════════════════════════════════════════════
 *
 * TOOLBAR:
 *   [B] [I] [🔗]
 *   Bold and Italic toggle formatting on selected text.
 *   Link opens the global LinkPicker (same as /menus and FieldLink).
 *
 * KEY DESIGN:
 *   The link button does NOT insert <a> tags into the content.
 *   Instead it writes to a sibling "link" key via onChange("link", data).
 *   The content stays clean: only <b>, <strong>, <i>, <em>, <br>.
 *   The link applies to the ENTIRE element (click behavior).
 *
 * OUTPUT FORMAT:
 *   Clean HTML with only: <b>, <strong>, <i>, <em>, <br>.
 *   All other tags stripped. Paste forced to plain text.
 *
 * KEYBOARD SHORTCUTS:
 *   ⌘B / Ctrl+B → Bold
 *   ⌘I / Ctrl+I → Italic
 *   ⌘K / Ctrl+K → LinkPicker
 *
 * CSS prefix: rt-* (rich text)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { LinkPicker } from "@/app/_components/LinkPicker";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { getMapThumbnail } from "@/app/(admin)/maps/maps-constants";
import type { RichTextLinkData } from "./richTextLinkTypes";
import { DEFAULT_TARGET } from "./richTextLinkTypes";

// ═══════════════════════════════════════════════════════════════
// URL ↔ RichTextLinkData (shared with FieldLink)
// ═══════════════════════════════════════════════════════════════

function urlToLinkData(url: string): RichTextLinkData {
  if (url.startsWith("mailto:")) {
    const [email] = url.replace("mailto:", "").split("?");
    return { type: "email", target: DEFAULT_TARGET.email, payload: { email: decodeURIComponent(email), subject: "" } };
  }
  if (url.startsWith("tel:")) {
    return { type: "phone", target: DEFAULT_TARGET.phone, payload: { phone: url.replace("tel:", "") } };
  }
  if (url.includes(".pdf") && (url.includes("cloudinary.com") || url.includes(".pdf"))) {
    const filename = url.split("/").pop()?.split("?")[0] ?? "";
    if (filename.endsWith(".pdf")) {
      return { type: "document", target: DEFAULT_TARGET.document, payload: { fileUrl: url, fileName: filename, filePublicId: "", fileDescription: "" } };
    }
  }
  const isExternal = url.startsWith("http");
  return { type: "url", target: DEFAULT_TARGET.url, payload: { href: url, openInNewTab: isExternal } };
}

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  allValues?: Record<string, unknown>;
};

type FormatState = {
  bold: boolean;
  italic: boolean;
};

// ═══════════════════════════════════════════════════════════════
// FIELD COMPONENT
// ═══════════════════════════════════════════════════════════════

export function FieldRichText({ field, value, onChange, allValues }: Props) {
  const { config } = usePreview();
  const editorRef = useRef<HTMLDivElement>(null);
  const linkAnchorRef = useRef<HTMLButtonElement>(null);
  const lastEmittedRef = useRef<string>("");
  const [format, setFormat] = useState<FormatState>({ bold: false, italic: false });
  const [pickerOpen, setPickerOpen] = useState(false);

  // Current link data from sibling "link" key
  const linkData = (allValues?.link ?? null) as RichTextLinkData | null;

  // Maps for LinkPicker
  const maps = useMemo(
    () => (config?.maps ?? []).map((m) => ({ id: m.id, name: m.name, thumbnail: getMapThumbnail(m.style) })),
    [config?.maps],
  );

  // ── Sync external value → DOM ──

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = (value as string) ?? "";
    if (html !== lastEmittedRef.current) {
      el.innerHTML = html;
      lastEmittedRef.current = html;
    }
  }, [value]);

  // ── Track selection + format state ──

  useEffect(() => {
    const update = () => {
      const sel = document.getSelection();
      if (!sel || !editorRef.current) return;
      if (!editorRef.current.contains(sel.anchorNode)) return;
      setFormat({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
      });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  // ── Emit sanitized HTML ──

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeHtml(el.innerHTML);
    if (html === lastEmittedRef.current) return;
    lastEmittedRef.current = html;
    onChange(field.key, html);
  }, [field.key, onChange]);

  // ── Paste: plain text only ──

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
      emitChange();
    },
    [emitChange]
  );

  // ── Format: bold ──

  const toggleBold = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand("bold", false);
    emitChange();
  }, [emitChange]);

  // ── Format: italic ──

  const toggleItalic = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand("italic", false);
    emitChange();
  }, [emitChange]);

  // ── Link: open LinkPicker ──

  const openLinkPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  // ── Link: select from LinkPicker ──

  const handleLinkSelect = useCallback(
    (url: string, _label: string) => {
      onChange("link", urlToLinkData(url));
      setPickerOpen(false);
    },
    [onChange]
  );

  // ── Keyboard shortcuts ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") { e.preventDefault(); toggleBold(); }
      else if (mod && e.key === "i") { e.preventDefault(); toggleItalic(); }
      else if (mod && e.key === "k") { e.preventDefault(); openLinkPicker(); }
    },
    [toggleBold, toggleItalic, openLinkPicker]
  );

  // ── Render ──

  return (
    <FieldWrapper field={field}>
      <div className="rt">
        {/* ── Toolbar ── */}
        <div className="rt-toolbar" role="toolbar" aria-label="Textformatering">
          <button
            type="button"
            className={`rt-toolbar__btn${format.bold ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss}
            onClick={toggleBold}
            aria-label="Fetstil (⌘B)"
            aria-pressed={format.bold}
          >
            <BoldIcon />
          </button>
          <button
            type="button"
            className={`rt-toolbar__btn${format.italic ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss}
            onClick={toggleItalic}
            aria-label="Kursiv (⌘I)"
            aria-pressed={format.italic}
          >
            <ItalicIcon />
          </button>
          <button
            ref={linkAnchorRef}
            type="button"
            className={`rt-toolbar__btn${linkData ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss}
            onClick={() => {
              if (linkData) {
                // If link exists, remove it
                onChange("link", null);
              } else {
                openLinkPicker();
              }
            }}
            aria-label="Länk (⌘K)"
            aria-pressed={!!linkData}
          >
            <LinkIcon />
          </button>
        </div>

        {/* ── Editor ── */}
        <div
          ref={editorRef}
          className="rt-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="false"
          aria-label={field.label}
          data-placeholder={(field.default as string) ?? ""}
        />
      </div>

      {/* ── LinkPicker (same as /menus and FieldLink) ── */}
      <LinkPicker
        open={pickerOpen}
        anchorRef={linkAnchorRef}
        maps={maps}
        onSelect={handleLinkSelect}
        onClose={() => setPickerOpen(false)}
      />
    </FieldWrapper>
  );
}

/** Prevent toolbar button clicks from stealing editor selection. */
function preventFocusLoss(e: React.MouseEvent) {
  e.preventDefault();
}

// ═══════════════════════════════════════════════════════════════
// HTML SANITIZER
// ═══════════════════════════════════════════════════════════════

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "br"]);

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return sanitizeNode(doc.body);
}

function sanitizeNode(node: Node): string {
  let result = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === "br") {
        result += "<br>";
      } else if (ALLOWED_TAGS.has(tag)) {
        const inner = sanitizeNode(el);
        result += inner ? `<${tag}>${inner}</${tag}>` : "";
      } else {
        // Unwrap: keep children, discard tag
        result += sanitizeNode(el);
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function BoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M15.842 4.175a3.746 3.746 0 0 0-5.298 0l-2.116 2.117a3.75 3.75 0 0 0 .01 5.313l.338.336a.75.75 0 1 0 1.057-1.064l-.339-.337a2.25 2.25 0 0 1-.005-3.187l2.116-2.117a2.246 2.246 0 1 1 3.173 3.18l-1.052 1.047a.75.75 0 0 0 1.058 1.064l1.052-1.047a3.746 3.746 0 0 0 .006-5.305Zm-11.664 11.67a3.75 3.75 0 0 0 5.304 0l2.121-2.121a3.75 3.75 0 0 0 0-5.303l-.362-.362a.75.75 0 0 0-1.06 1.06l.362.362a2.25 2.25 0 0 1 0 3.182l-2.122 2.122a2.25 2.25 0 1 1-3.182-3.182l1.07-1.07a.75.75 0 1 0-1.062-1.06l-1.069 1.069a3.75 3.75 0 0 0 0 5.303Z"
      />
    </svg>
  );
}
