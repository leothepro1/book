"use client";

/**
 * Rich Text Field — Inline formatting with Bold, Italic + Link action
 * ═══════════════════════════════════════════════════════════════
 *
 * TOOLBAR:
 *   [B] [I] [🔗]
 *   Bold and Italic toggle formatting on selected text.
 *   Link opens the multi-type destination modal.
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
 *   ⌘K / Ctrl+K → Link modal
 *
 * CSS prefix: rt-* (rich text)
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";
import { RichTextLinkModal } from "./RichTextLinkModal";
import type { RichTextLinkData } from "./richTextLinkTypes";

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
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>("");
  const [format, setFormat] = useState<FormatState>({
    bold: false,
    italic: false,
  });
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  // Current link data from sibling "link" key
  const linkData = (allValues?.link ?? null) as RichTextLinkData | null;

  // ── Mount: resolve portal target (.dp ancestor) ──

  useEffect(() => {
    if (editorRef.current) {
      setPortalTarget(editorRef.current.closest(".dp"));
    }
  }, []);

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

  // ── Link: open modal ──

  const openLinkModal = useCallback(() => {
    setShowLinkModal(true);
  }, []);

  // ── Link: confirm (writes to sibling "link" key) ──

  const handleLinkConfirm = useCallback(
    (data: RichTextLinkData) => {
      onChange("link", data);
      setShowLinkModal(false);
    },
    [onChange]
  );

  // ── Link: remove ──

  const handleLinkRemove = useCallback(() => {
    onChange("link", null);
    setShowLinkModal(false);
  }, [onChange]);

  // ── Keyboard shortcuts ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        toggleBold();
      } else if (mod && e.key === "i") {
        e.preventDefault();
        toggleItalic();
      } else if (mod && e.key === "k") {
        e.preventDefault();
        openLinkModal();
      }
    },
    [toggleBold, toggleItalic, openLinkModal]
  );

  // ── Render ──

  const linkModalElement = showLinkModal ? (
    <RichTextLinkModal
      initialData={linkData}
      isEditing={linkData !== null}
      onConfirm={handleLinkConfirm}
      onRemove={linkData ? handleLinkRemove : undefined}
      onClose={() => setShowLinkModal(false)}
    />
  ) : null;

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
            type="button"
            className={`rt-toolbar__btn${linkData ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss}
            onClick={openLinkModal}
            aria-label="Infoga länk (⌘K)"
            aria-pressed={!!linkData}
          >
            <LinkIcon />
          </button>
        </div>

        {/* ── Editable area ── */}
        <div
          ref={editorRef}
          className="rt-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="false"
          aria-label={field.label}
          data-placeholder={(field.default as string) ?? ""}
        />
      </div>

      {/* ── Link modal (portaled to .dp for correct positioning) ── */}
      {linkModalElement && portalTarget
        ? createPortal(linkModalElement, portalTarget)
        : linkModalElement}
    </FieldWrapper>
  );
}

/** Prevent toolbar button clicks from stealing editor selection. */
function preventFocusLoss(e: React.MouseEvent) {
  e.preventDefault();
}

// ═══════════════════════════════════════════════════════════════
// HTML SANITIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Allowlist of safe inline tags. Everything else is stripped
 * but its text content is preserved. NO <a> tags — links are
 * stored as a separate setting, not in the HTML.
 */
const SAFE_TAGS = new Set(["b", "strong", "i", "em", "br"]);

/**
 * Sanitize contentEditable output.
 *
 * - Strips all tags except SAFE_TAGS (no <a>)
 * - Normalizes empty content to empty string
 *
 * Uses DOMParser for safe parsing (no script execution).
 */
function sanitizeHtml(raw: string): string {
  if (!raw) return "";

  // Normalize browser-specific empty states
  const trimmed = raw
    .replace(/^(<br\s*\/?>|\s|<div><br\s*\/?><\/div>)+$/i, "")
    .trim();
  if (!trimmed) return "";

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  return serializeNode(doc.body);
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(serializeNode).join("");

  // Container/wrapper tags (incl <a>): unwrap, keep children
  if (!SAFE_TAGS.has(tag)) return inner;

  // Self-closing
  if (tag === "br") return "<br>";

  // b, strong, i, em — no attributes needed
  return `<${tag}>${inner}</${tag}>`;
}

// ═══════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════

function BoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7 3c-.83 0-1.5.67-1.5 1.5v10.46c0 .85.69 1.54 1.54 1.54h4.46a4 4 0 0 0 2.32-7.26 4 4 0 0 0-3.32-6.24h-3.5Zm3.5 5.5a1.5 1.5 0 0 0 0-3h-2.5v3h2.5Zm-2.5 2.5v3h3.5a1.5 1.5 0 0 0 0-3h-3.5Z"
      />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="16" height="16" viewBox="1 1 18 18" fill="currentColor" aria-hidden="true">
      <path d="M7.5 4.25c0-.41.34-.75.75-.75h6a.75.75 0 0 1 0 1.5h-2.34l-2.28 10h2.12a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5h2.34l2.28-10h-2.12a.75.75 0 0 1-.75-.75Z" />
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
