"use client";

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaLibraryModal } from "../_components/MediaLibrary";
import type { MediaLibraryResult } from "../_components/MediaLibrary";
import { ColorPickerPopup } from "../_components/ColorPicker";
import type { MapMarkerConfig } from "./maps-constants";
import { createMarkerId, DEFAULT_MARKER, MAPBOX_TOKEN } from "./maps-constants";
import { MarkerAddressSearch } from "./MapDetailView";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Markers Card System ─────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Icons (shared with Home pattern) ─────────────────────────

const MkDragIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>drag_indicator</span>
);
const MkPenIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>edit</span>
);
const MkTrashIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>delete</span>
);
const MkCloseIcon = () => (
  <span className="material-symbols-rounded" style={{ fontSize: 19 }}>close</span>
);

// ── Toggle ───────────────────────────────────────────────────

function MkToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={"admin-toggle" + (checked ? " admin-toggle-on" : "")}>
      <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-rounded">check</span>
      <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-rounded">remove</span>
      <span className="admin-toggle-thumb" />
    </button>
  );
}

// ── Panel types ──────────────────────────────────────────────

type MkPanelKey = "content" | "location" | "appearance" | "delete" | null;
const MK_PANEL_LABELS: Record<Exclude<MkPanelKey, null>, string> = {
  content: "Innehåll", location: "Plats", appearance: "Färger", delete: "Ta bort",
};

// ── Panel contents ───────────────────────────────────────────

function MkLocationPanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  return (
    <div className="tp-fields">
      <div className="mk-panel-intro">
        <span className="mk-panel-intro__label">Sökadress</span>
        <span className="mk-panel-intro__desc">Sök efter en plats för att placera markören på kartan.</span>
      </div>
      <MarkerAddressSearch
        value={marker.address || ""}
        onSelect={(addr, lat, lng) => onUpdate({ ...marker, address: addr, lat, lng })}
      />
      <div className="mk-or-divider">
        <span className="mk-or-divider__line" />
        <span className="mk-or-divider__text">ELLER</span>
        <span className="mk-or-divider__line" />
      </div>
      <div className="mk-coord-row">
        <div className="mk-coord-field">
          <span className="tp-field-label">Latitud</span>
          <input type="number" className="tp-float-input" value={marker.lat}
            onChange={e => onUpdate({ ...marker, lat: parseFloat(e.target.value) || 0 })} step="0.0001" />
        </div>
        <div className="mk-coord-field">
          <span className="tp-field-label">Longitud</span>
          <input type="number" className="tp-float-input" value={marker.lng}
            onChange={e => onUpdate({ ...marker, lng: parseFloat(e.target.value) || 0 })} step="0.0001" />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── Content Panel — Enterprise Rich Text Editor ─────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Architecture:
//   - contentEditable with manual DOM operations (no libraries)
//   - Block model: every top-level child of the editor is a block element
//   - Inline model: <b>, <strong>, <i>, <em>, <br> within blocks
//   - Block splitting: partial selection + block change → 3-way split
//   - Normalization: bare text/divs/spans → <p> after every mutation
//   - Sanitization: allowlist-based HTML cleaning on every emit
//   - Undo: native browser undo stack (Ctrl+Z) preserved by using
//     execCommand where possible and manual DOM ops where needed
//

// ── Text Alignment ──────────────────────────────────────────────

type TextAlign = "left" | "center" | "right";

const ALIGN_OPTIONS: { value: TextAlign; label: string; icon: React.ReactNode }[] = [
  {
    value: "left",
    label: "Vänster",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 2a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5z" />
        <path d="M2 5.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z" />
        <path d="M1 9.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5h-12.5a.75.75 0 0 1-.75-.75" />
        <path d="M2 12.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z" />
      </svg>
    ),
  },
  {
    value: "center",
    label: "Centrerad",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M1 2.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5h-12.5a.75.75 0 0 1-.75-.75" />
        <path fillRule="evenodd" d="M3.25 6.25a.75.75 0 0 1 .75-.75h8a.75.75 0 0 1 0 1.5h-8a.75.75 0 0 1-.75-.75" />
        <path fillRule="evenodd" d="M1 9.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5h-12.5a.75.75 0 0 1-.75-.75" />
        <path fillRule="evenodd" d="M3.25 13.25a.75.75 0 0 1 .75-.75h8a.75.75 0 0 1 0 1.5h-8a.75.75 0 0 1-.75-.75" />
      </svg>
    ),
  },
  {
    value: "right",
    label: "Höger",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.75 2a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5z" />
        <path d="M6.25 5.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z" />
        <path d="M1 9.75a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5h-12.5a.75.75 0 0 1-.75-.75" />
        <path d="M6.25 12.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z" />
      </svg>
    ),
  },
];

/** Apply text-align to all blocks in the current selection */
function rtApplyAlign(align: TextAlign, editor: HTMLElement): void {
  const blocks = rtGetSelectedBlocks(editor);
  if (blocks.length === 0) {
    const sel = document.getSelection();
    if (sel && sel.anchorNode) {
      const block = rtClosestBlock(sel.anchorNode, editor);
      if (block) blocks.push(block);
    }
  }
  for (const block of blocks) {
    if (align === "left") {
      block.style.textAlign = "";
      if (!block.getAttribute("style")) block.removeAttribute("style");
    } else {
      block.style.textAlign = align;
    }
  }
}

/** Read the text-align of the block at the current cursor position */
function rtGetAlign(editor: HTMLElement): TextAlign {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return "left";
  const block = rtClosestBlock(sel.anchorNode, editor);
  if (!block) return "left";
  const computed = block.style.textAlign || getComputedStyle(block).textAlign;
  if (computed === "center") return "center";
  if (computed === "right" || computed === "end") return "right";
  return "left";
}

const BLOCK_OPTIONS: { tag: string; label: string; fontSize: number; fontWeight: number }[] = [
  { tag: "p", label: "Stycke", fontSize: 14, fontWeight: 400 },
  { tag: "h1", label: "Rubrik 1", fontSize: 28, fontWeight: 700 },
  { tag: "h2", label: "Rubrik 2", fontSize: 24, fontWeight: 700 },
  { tag: "h3", label: "Rubrik 3", fontSize: 20, fontWeight: 600 },
  { tag: "h4", label: "Rubrik 4", fontSize: 18, fontWeight: 600 },
  { tag: "h5", label: "Rubrik 5", fontSize: 16, fontWeight: 600 },
  { tag: "h6", label: "Rubrik 6", fontSize: 14, fontWeight: 600 },
];

const RT_SAFE_TAGS = new Set(["b", "strong", "i", "em", "br", "p", "h1", "h2", "h3", "h4", "h5", "h6", "img"]);
const RT_BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

// ── Sanitization ─────────────────────────────────────────────────

function rtSanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return rtWalk(doc.body);
}

function rtWalk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Self-closing: br, img
  if (tag === "br") return "<br>";
  if (tag === "img") {
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    const mediaId = el.getAttribute("data-media-id") || "";
    const style = el.getAttribute("style") || "";
    if (!src) return "";
    let attrs = ` src="${src}" alt="${alt}"`;
    if (mediaId) attrs += ` data-media-id="${mediaId}"`;
    if (style) attrs += ` style="${style}"`;
    return `<img${attrs} />`;
  }

  let inner = Array.from(el.childNodes).map(rtWalk).join("");
  // Strip empty non-br tags (but keep blocks that contain images)
  if (tag !== "br" && !inner.trim() && !inner.includes("<br") && !inner.includes("<img")) return "";
  if (RT_SAFE_TAGS.has(tag)) {
    // Block elements: strip trailing <br> cursor anchor
    // Browser adds a trailing <br> so the cursor has a place to sit on the
    // new empty line. Keep it only if the entire block is just <br> (empty line).
    if (RT_BLOCK_TAGS.has(tag)) {
      const stripped = inner.replace(/<br\s*\/?>$/, "");
      if (stripped.length > 0) inner = stripped;
    }
    // Preserve text-align on block elements
    let attrs = "";
    if (RT_BLOCK_TAGS.has(tag)) {
      const align = el.style.textAlign;
      if (align && align !== "left" && align !== "start") {
        attrs = ` style="text-align:${align}"`;
      }
    }
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }
  return inner;
}

// ── DOM Helpers ──────────────────────────────────────────────────

function rtClosestBlock(node: Node | null, editor: HTMLElement): HTMLElement | null {
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && RT_BLOCK_TAGS.has((node as HTMLElement).tagName.toLowerCase())) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

/** Ensure all direct children are block elements. Wraps bare text/inline in <p>. */
function rtNormalize(editor: HTMLElement): void {
  let child = editor.firstChild;
  while (child) {
    const next = child.nextSibling;
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent ?? "").trim()) {
        const p = document.createElement("p");
        child.replaceWith(p);
        p.appendChild(child);
      } else {
        child.remove();
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      // Browser sometimes inserts <div> on Enter — convert to <p>
      if (tag === "div") {
        const p = document.createElement("p");
        while (child.firstChild) p.appendChild(child.firstChild);
        child.replaceWith(p);
      } else if (!RT_BLOCK_TAGS.has(tag) && tag !== "br") {
        const p = document.createElement("p");
        child.replaceWith(p);
        p.appendChild(child);
      }
    }
    child = next;
  }
  // Guarantee at least one block
  if (!editor.firstChild) {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    editor.appendChild(p);
  }
}

/** Collect all block elements touched by the current selection range */
function rtGetSelectedBlocks(editor: HTMLElement): HTMLElement[] {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return [];

  const startBlock = rtClosestBlock(range.startContainer, editor);
  const endBlock = rtClosestBlock(range.endContainer, editor);
  if (!startBlock) return [];

  const blocks: HTMLElement[] = [];
  let cur: Element | null = startBlock;
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE && RT_BLOCK_TAGS.has(cur.tagName.toLowerCase())) {
      blocks.push(cur as HTMLElement);
    }
    if (cur === endBlock) break;
    cur = cur.nextElementSibling;
  }
  return blocks;
}

// ── Block Operations ─────────────────────────────────────────────

/** Swap a block element's tag in-place, preserving children + selection */
function rtSwapBlockTag(block: HTMLElement, tag: string, sel: Selection): HTMLElement {
  if (block.tagName.toLowerCase() === tag) return block;
  const newBlock = document.createElement(tag);
  // Preserve text-align when changing block type
  if (block.style.textAlign) newBlock.style.textAlign = block.style.textAlign;
  while (block.firstChild) newBlock.appendChild(block.firstChild);
  block.replaceWith(newBlock);
  return newBlock;
}

/**
 * Apply block tag. 3 modes:
 *   1. Collapsed cursor → swap the block the cursor is in
 *   2. Selection spans full block(s) → swap each block
 *   3. Partial selection within a block → split into before/middle/after
 */
function rtApplyBlock(tag: string, editor: HTMLElement): void {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  // Multi-block selection
  const blocks = rtGetSelectedBlocks(editor);
  if (blocks.length > 1) {
    for (const b of blocks) rtSwapBlockTag(b, tag, sel);
    return;
  }

  const block = blocks[0] || rtClosestBlock(range.startContainer, editor);
  if (!block) return;
  const currentTag = block.tagName.toLowerCase();

  // Collapsed or full-block → swap
  if (range.collapsed || range.toString().trim().length >= (block.textContent ?? "").trim().length) {
    const newBlock = rtSwapBlockTag(block, tag, sel);
    try {
      const r = document.createRange();
      r.selectNodeContents(newBlock);
      if (range.collapsed) r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch { /* selection restore non-critical */ }
    return;
  }

  // Partial selection → 3-way split
  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(range.startContainer, range.startOffset);

  const afterRange = document.createRange();
  afterRange.setStart(range.endContainer, range.endOffset);
  afterRange.setEnd(block, block.childNodes.length);

  const beforeFrag = beforeRange.cloneContents();
  const selectedFrag = range.cloneContents();
  const afterFrag = afterRange.cloneContents();

  const hasBefore = (beforeFrag.textContent ?? "").length > 0;
  const hasAfter = (afterFrag.textContent ?? "").length > 0;

  const result: HTMLElement[] = [];

  if (hasBefore) {
    const b = document.createElement(currentTag);
    b.appendChild(beforeFrag);
    result.push(b);
  }

  const middle = document.createElement(tag);
  middle.appendChild(selectedFrag);
  result.push(middle);

  if (hasAfter) {
    const a = document.createElement(currentTag);
    a.appendChild(afterFrag);
    result.push(a);
  }

  const parent = block.parentNode!;
  const ref = block.nextSibling;
  block.remove();
  for (const el of result) parent.insertBefore(el, ref);

  // Select the middle block
  try {
    const r = document.createRange();
    r.selectNodeContents(middle);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /* non-critical */ }
}

// ── Component ────────────────────────────────────────────────────

function MkContentPanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState({ bold: false, italic: false, textAlign: "left" as TextAlign });
  const [blockType, setBlockType] = useState("p");
  const [blockDropdownOpen, setBlockDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const blockDropdownRef = useRef<HTMLDivElement>(null);
  const blockListRef = useRef<HTMLUListElement>(null);
  const alignDropdownRef = useRef<HTMLDivElement>(null);
  const alignListRef = useRef<HTMLUListElement>(null);
  const initializedRef = useRef(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number; editorWidth: number } | null>(null);

  // ── Init ──
  useEffect(() => {
    if (!editorRef.current || initializedRef.current) return;
    const raw = marker.content || "";
    if (raw) {
      editorRef.current.innerHTML = raw;
    } else {
      editorRef.current.innerHTML = "<p><br></p>";
    }
    rtNormalize(editorRef.current);
    initializedRef.current = true;
  }, [marker.content]);

  // ── Outside click closes dropdowns ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!blockDropdownRef.current?.contains(t) && !blockListRef.current?.contains(t)) {
        setBlockDropdownOpen(false);
      }
      if (!alignDropdownRef.current?.contains(t) && !alignListRef.current?.contains(t)) {
        setAlignDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Real-time format + block type tracking ──
  useEffect(() => {
    const handler = () => {
      if (!editorRef.current) return;
      // Only track when selection is inside our editor
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current.contains(sel.anchorNode)) return;
      // queryCommandState can falsely report bold/italic on empty blocks or <br> nodes.
      // Only trust it when the anchor is inside an actual text node with content.
      const anchorInText = sel.anchorNode?.nodeType === Node.TEXT_NODE && (sel.anchorNode.textContent ?? "").length > 0;
      setFormat({
        bold: anchorInText ? document.queryCommandState("bold") : false,
        italic: anchorInText ? document.queryCommandState("italic") : false,
        textAlign: rtGetAlign(editorRef.current),
      });
      const block = rtClosestBlock(sel.anchorNode, editorRef.current);
      setBlockType(block ? block.tagName.toLowerCase() : "p");
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  // ── Image selection ──
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      e.preventDefault();
      setSelectedImg(target as HTMLImageElement);
    } else {
      setSelectedImg(null);
    }
  }, []);

  // Deselect on click outside editor
  useEffect(() => {
    if (!selectedImg) return;
    const handler = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setSelectedImg(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedImg]);

  // Delete selected image on Backspace/Delete
  useEffect(() => {
    if (!selectedImg) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        selectedImg.remove();
        setSelectedImg(null);
        emitChangeRef.current();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedImg]);

  // ── Image resize ──
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (!selectedImg || !editorRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startWidth: selectedImg.offsetWidth,
      editorWidth: editorRef.current.offsetWidth,
    };
  }, [selectedImg]);

  const [, forceUpdate] = useState(0);
  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing || !resizeRef.current || !selectedImg) return;
    const dx = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(40, resizeRef.current.startWidth + dx);
    const pct = Math.min(100, Math.round((newWidth / resizeRef.current.editorWidth) * 100));
    selectedImg.style.width = `${pct}%`;
    selectedImg.style.maxWidth = `${pct}%`;
    forceUpdate(n => n + 1); // Re-render overlay to follow image size
  }, [resizing, selectedImg]);

  const handleResizeEnd = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    resizeRef.current = null;
    emitChangeRef.current();
  }, [resizing]);

  // ── Emit ──
  const preventFocusLoss = useCallback((e: React.MouseEvent) => { e.preventDefault(); }, []);

  // Use ref to always have the latest marker without recreating emitChange
  const markerRef = useRef(marker);
  markerRef.current = marker;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const emitChange = useCallback((normalize = false) => {
    if (!editorRef.current) return;
    if (normalize) rtNormalize(editorRef.current);
    const html = rtSanitize(editorRef.current.innerHTML);
    onUpdateRef.current({ ...markerRef.current, content: html });
  }, []);

  // Stable ref for callbacks that can't depend on emitChange
  const emitChangeRef = useRef(emitChange);
  emitChangeRef.current = emitChange;

  // ── Inline formatting ──
  const toggleBold = useCallback(() => {
    document.execCommand("bold", false);
    setFormat(f => ({ ...f, bold: !f.bold }));
    emitChange();
  }, []);

  const toggleItalic = useCallback(() => {
    document.execCommand("italic", false);
    setFormat(f => ({ ...f, italic: !f.italic }));
    emitChange();
  }, []);

  // ── Image insertion ──
  const openMediaPicker = useCallback(() => {
    // Save current selection so we can restore it after modal closes
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    setMediaOpen(true);
  }, []);

  const handleMediaConfirm = useCallback((asset: MediaLibraryResult) => {
    setMediaOpen(false);
    if (!editorRef.current) return;

    const img = document.createElement("img");
    img.src = asset.url;
    img.alt = asset.filename || "";
    img.style.cssText = "max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;";
    img.setAttribute("data-media-id", asset.id);

    const saved = savedRangeRef.current;
    if (saved && editorRef.current.contains(saved.startContainer)) {
      // Insert at saved cursor position
      const sel = document.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
      // Find the block, insert image after it
      const block = rtClosestBlock(saved.startContainer, editorRef.current);
      if (block) {
        block.after(img);
      } else {
        editorRef.current.appendChild(img);
      }
    } else {
      // No saved position — append at the end
      editorRef.current.appendChild(img);
    }

    savedRangeRef.current = null;
    emitChange(true);
  }, [emitChange]);

  // ── Block formatting ──
  const handleApplyBlock = useCallback((tag: string) => {
    if (!editorRef.current) { setBlockDropdownOpen(false); return; }
    rtApplyBlock(tag, editorRef.current);
    setBlockType(tag);
    setBlockDropdownOpen(false);
    emitChange(true);
  }, [emitChange]);

  // ── Text alignment ──
  const handleApplyAlign = useCallback((align: TextAlign) => {
    if (!editorRef.current) { setAlignDropdownOpen(false); return; }
    rtApplyAlign(align, editorRef.current);
    setFormat(f => ({ ...f, textAlign: align }));
    setAlignDropdownOpen(false);
    emitChange();
  }, [emitChange]);

  // ── Keyboard ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "b") { e.preventDefault(); toggleBold(); return; }
    if (mod && e.key === "i") { e.preventDefault(); toggleItalic(); return; }

    // Ctrl+Z / Ctrl+Y — let browser handle undo/redo natively
    if (mod && (e.key === "z" || e.key === "y")) return;

    // Enter → <br> within current block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      emitChange();
      return;
    }

    // Backspace at start of block → merge with previous block
    if (e.key === "Backspace" && editorRef.current) {
      const sel = document.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const block = rtClosestBlock(range.startContainer, editorRef.current);
        if (block && range.startOffset === 0 && range.startContainer === block.firstChild) {
          const prev = block.previousElementSibling as HTMLElement | null;
          if (prev && RT_BLOCK_TAGS.has(prev.tagName.toLowerCase())) {
            e.preventDefault();
            // Place cursor at end of previous block
            const r = document.createRange();
            if (prev.lastChild) {
              r.setStartAfter(prev.lastChild);
            } else {
              r.setStart(prev, 0);
            }
            r.collapse(true);
            // Move all children from current block into previous
            while (block.firstChild) {
              // Remove placeholder <br> if prev has content
              if (block.firstChild.nodeName === "BR" && prev.textContent) {
                block.firstChild.remove();
                continue;
              }
              prev.appendChild(block.firstChild);
            }
            block.remove();
            sel.removeAllRanges();
            sel.addRange(r);
            emitChange();
            return;
          }
        }
      }
    }

    // Delete at end of block → merge with next block
    if (e.key === "Delete" && editorRef.current) {
      const sel = document.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const block = rtClosestBlock(range.startContainer, editorRef.current);
        if (block) {
          const atEnd = range.startOffset === (range.startContainer.textContent ?? "").length
            || range.startContainer === block && range.startOffset === block.childNodes.length;
          const next = block.nextElementSibling as HTMLElement | null;
          if (atEnd && next && RT_BLOCK_TAGS.has(next.tagName.toLowerCase())) {
            e.preventDefault();
            while (next.firstChild) {
              if (next.firstChild.nodeName === "BR" && block.textContent) {
                next.firstChild.remove();
                continue;
              }
              block.appendChild(next.firstChild);
            }
            next.remove();
            emitChange();
            return;
          }
        }
      }
    }
  }, [toggleBold, toggleItalic, emitChange]);

  // ── Paste ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    // Insert as plain text, preserving line breaks as <br>
    const lines = text.split(/\r?\n/);
    const html = lines.join("<br>");
    document.execCommand("insertHTML", false, html);
    emitChange(true);
  }, [emitChange]);

  const activeBlockLabel = BLOCK_OPTIONS.find(o => o.tag === blockType)?.label || "Stycke";

  return (
    <div>
      <div className="mk-panel-intro">
        <span className="mk-panel-intro__label">Beskrivning</span>
        <span className="mk-panel-intro__desc">Skriv en detaljerad beskrivning som visas när gästen klickar på markören.</span>
      </div>
      <div className="mk-content-panel">
      <div className="mk-rt-toolbar" role="toolbar" aria-label="Textformatering">
        <div className="mk-block-dropdown" ref={blockDropdownRef}>
          <button type="button" className="mk-block-dropdown__trigger"
            onMouseDown={preventFocusLoss} onClick={() => setBlockDropdownOpen(!blockDropdownOpen)}>
            <span>{activeBlockLabel}</span>
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
              {blockDropdownOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          {blockDropdownOpen && (() => {
            const rect = blockDropdownRef.current?.getBoundingClientRect();
            if (!rect) return null;
            return createPortal(
              <ul ref={blockListRef} className="mk-block-dropdown__list mk-block-dropdown__list--fixed"
                style={{ top: rect.bottom + 4, left: rect.left }}>
                {BLOCK_OPTIONS.map(opt => (
                  <li key={opt.tag}>
                    <button type="button"
                      className={`mk-block-dropdown__item${opt.tag === blockType ? " mk-block-dropdown__item--active" : ""}`}
                      onMouseDown={preventFocusLoss}
                      onClick={() => handleApplyBlock(opt.tag)}>
                      <span style={{ fontSize: opt.fontSize, fontWeight: opt.fontWeight }}>
                        {opt.label}
                      </span>
                      {opt.tag === blockType && (
                        <span className="material-symbols-rounded" style={{ fontSize: 24, color: "#0075DE" }}>check</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>,
              document.body
            );
          })()}
        </div>
        <div className="mk-rt-toolbar__right">
          <button type="button"
            className={`mk-rt-toolbar__btn${format.bold ? " mk-rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss} onClick={toggleBold} aria-label="Fetstil (⌘B)" aria-pressed={format.bold}>
            <MkBoldIcon />
          </button>
          <button type="button"
            className={`mk-rt-toolbar__btn${format.italic ? " mk-rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss} onClick={toggleItalic} aria-label="Kursiv (⌘I)" aria-pressed={format.italic}>
            <MkItalicIcon />
          </button>
          {/* Text alignment dropdown */}
          <div className="mk-block-dropdown" ref={alignDropdownRef}>
            <button type="button" className="mk-block-dropdown__trigger"
              onMouseDown={preventFocusLoss} onClick={() => setAlignDropdownOpen(!alignDropdownOpen)}>
              <span style={{ display: "flex", alignItems: "center" }}>
                {ALIGN_OPTIONS.find(o => o.value === format.textAlign)?.icon ?? ALIGN_OPTIONS[0].icon}
              </span>
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                {alignDropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {alignDropdownOpen && (() => {
              const rect = alignDropdownRef.current?.getBoundingClientRect();
              if (!rect) return null;
              return createPortal(
                <ul ref={alignListRef} className="mk-block-dropdown__list mk-block-dropdown__list--fixed"
                  style={{ top: rect.bottom + 4, left: rect.left }}>
                  {ALIGN_OPTIONS.map(opt => (
                    <li key={opt.value}>
                      <button type="button"
                        className={`mk-block-dropdown__item${opt.value === format.textAlign ? " mk-block-dropdown__item--active" : ""}`}
                        onMouseDown={preventFocusLoss}
                        onClick={() => handleApplyAlign(opt.value)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {opt.icon}
                          {opt.label}
                        </span>
                        {opt.value === format.textAlign && (
                          <span className="material-symbols-rounded" style={{ fontSize: 24, color: "#0075DE" }}>check</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>,
                document.body
              );
            })()}
          </div>
          <button type="button" className="mk-rt-toolbar__btn"
            onMouseDown={preventFocusLoss} onClick={openMediaPicker} aria-label="Infoga bild">
            <span className="material-symbols-rounded" style={{ fontSize: 19 }}>image</span>
          </button>
        </div>
      </div>
      <div className="mk-rt-editor-wrap">
        <div
          ref={editorRef}
          className="mk-rt-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={() => emitChange()}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onClick={handleEditorClick}
          role="textbox"
          aria-multiline="true"
          data-placeholder="Skriv innehåll..."
        />
        {selectedImg && editorRef.current && (() => {
          const top = selectedImg.offsetTop;
          const left = selectedImg.offsetLeft;
          const w = selectedImg.offsetWidth;
          const h = selectedImg.offsetHeight;
          const pct = Math.round((w / editorRef.current!.offsetWidth) * 100);
          return (
            <div className="mk-img-overlay" style={{ top, left, width: w, height: h }} contentEditable={false}>
              <div className="mk-img-overlay__border" />
              {(["nw", "ne", "sw", "se"] as const).map(corner => (
                <div
                  key={corner}
                  className={`mk-img-handle mk-img-handle--${corner}`}
                  onPointerDown={handleResizeStart}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeEnd}
                  onPointerCancel={handleResizeEnd}
                />
              ))}
              <div className="mk-img-overlay__pct">{pct}%</div>
            </div>
          );
        })()}
      </div>
      <MediaLibraryModal
        open={mediaOpen}
        onClose={() => { setMediaOpen(false); savedRangeRef.current = null; }}
        onConfirm={handleMediaConfirm}
        title="Välj bild"
      />
    </div>
    {/* ── CTA Button Section ── */}
    <MkCtaSection marker={marker} onUpdate={onUpdate} />
    </div>
  );
}

// ── CTA Button Section ────────────────────────────────────────

function isValidUrl(str: string): boolean {
  if (!str.trim()) return true; // empty is ok
  try {
    const url = new URL(str.startsWith("http") ? str : `https://${str}`);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function MkCtaSection({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const showButton = marker.showButton ?? false;
  const buttonUrl = marker.buttonUrl ?? "";
  const urlValid = isValidUrl(buttonUrl);

  return (
    <div className="mk-cta-section">
      <div className="mk-cta-toggle">
        <span className="mk-cta-toggle__label">Visa en knapp</span>
        <MkToggle checked={showButton} onChange={() => onUpdate({ ...marker, showButton: !showButton })} />
      </div>
      {showButton && (
        <div className="mk-cta-fields">
          <div className="mk-cta-field">
            <span className="tp-field-label">Knappetikett</span>
            <input
              type="text"
              className="tp-float-input"
              value={marker.buttonLabel ?? ""}
              onChange={e => onUpdate({ ...marker, buttonLabel: e.target.value })}
              placeholder="T.ex. Läs mer"
            />
          </div>
          <div className="mk-cta-field">
            <span className="tp-field-label">URL</span>
            <input
              type="url"
              className={"tp-float-input" + (!urlValid ? " mk-cta-input--invalid" : "")}
              value={buttonUrl}
              onChange={e => onUpdate({ ...marker, buttonUrl: e.target.value })}
              placeholder="https://example.com"
            />
            {!urlValid && (
              <span className="mk-cta-error">Ange en giltig URL (https://...)</span>
            )}
          </div>
          <div className="mk-cta-toggle">
            <span className="mk-cta-toggle__label">Öppna länk i en ny flik</span>
            <MkToggle
              checked={marker.buttonOpenNewTab ?? false}
              onChange={() => onUpdate({ ...marker, buttonOpenNewTab: !(marker.buttonOpenNewTab ?? false) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const MkBoldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h5a3 3 0 0 1 2.1 5.15A3.5 3.5 0 0 1 9.5 14H4V2Zm2 5h3a1 1 0 0 0 0-2H6v2Zm0 2v3h3.5a1.5 1.5 0 0 0 0-3H6Z" fill="currentColor"/></svg>
);
const MkItalicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2h6v2h-2.2l-2.6 8H9v2H3v-2h2.2l2.6-8H6V2Z" fill="currentColor"/></svg>
);

function MkAppearancePanel({ marker, onUpdate }: { marker: MapMarkerConfig; onUpdate: (m: MapMarkerConfig) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLDivElement>(null);
  return (
    <div className="tp-fields">
      <div>
        <span className="tp-field-label">Ikon</span>
        <input type="text" className="tp-float-input" value={marker.icon}
          onChange={e => onUpdate({ ...marker, icon: e.target.value })}
          placeholder="location_on" />
        <a className="sf-desc-link" href="https://fonts.google.com/icons" target="_blank" rel="noopener noreferrer">
          Se tillgängliga ikoner
          <span className="material-symbols-rounded" style={{ fontSize: 16, verticalAlign: "middle", marginLeft: 2 }}>arrow_right_alt</span>
        </a>
      </div>
      <div>
        <span className="tp-field-label">Färg</span>
        <div className="design-color-input-row">
          <input type="text" className="design-color-input" value={(marker.color || "#E74C3C").toUpperCase()}
            onChange={e => onUpdate({ ...marker, color: e.target.value })} spellCheck={false} autoComplete="off" />
          <div ref={swatchRef} className="design-color-swatch" style={{ background: marker.color || "#E74C3C" }}
            onClick={() => setPickerOpen(!pickerOpen)} />
          {pickerOpen && (
            <ColorPickerPopup
              value={marker.color || "#E74C3C"}
              onChange={v => onUpdate({ ...marker, color: v })}
              onClose={() => setPickerOpen(false)}
              anchorRef={swatchRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MkDeletePanel({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="card-panel-body card-panel-body--delete">
      <div className="delete-panel-options">
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--danger" onClick={onDelete}>Ta bort</button>
          <span className="delete-panel-sub">Markören tas bort permanent.</span>
        </div>
      </div>
    </div>
  );
}

// ── Marker Card Item ─────────────────────────────────────────

function MarkerCardItem({
  marker,
  onToggle,
  onDelete,
  onUpdate,
  openPanel,
  onPanelToggle,
  dragHandleProps,
}: {
  marker: MapMarkerConfig;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: MapMarkerConfig) => void;
  openPanel: MkPanelKey;
  onPanelToggle: (id: string, key: Exclude<MkPanelKey, null>) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLSpanElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | undefined>();
  const panelReadyRef = useRef(false);

  useEffect(() => {
    const el = panelContentRef.current;
    if (!el || !openPanel) {
      setPanelHeight(undefined);
      panelReadyRef.current = false;
      return;
    }
    if (panelReadyRef.current) {
      const frame = requestAnimationFrame(() => setPanelHeight(el.scrollHeight));
      const ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
      return () => { cancelAnimationFrame(frame); ro.disconnect(); };
    }
    let ro: ResizeObserver | null = null;
    const timeout = setTimeout(() => {
      panelReadyRef.current = true;
      setPanelHeight(el.scrollHeight);
      ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
    }, 1050);
    return () => { clearTimeout(timeout); ro?.disconnect(); };
  }, [openPanel]);

  const isActive = marker.isActive !== false;
  const coordsStr = marker.lat || marker.lng
    ? `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`
    : "";

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const el = titleInputRef.current;
    const newVal = (el?.textContent ?? "").trim();
    if (newVal && newVal !== marker.title) {
      onUpdate({ ...marker, title: newVal });
    } else if (el) {
      el.textContent = marker.title;
    }
  };

  const livePanelContent =
    openPanel === "content" ? <MkContentPanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "location" ? <MkLocationPanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "appearance" ? <MkAppearancePanel marker={marker} onUpdate={onUpdate} /> :
    openPanel === "delete" ? <MkDeletePanel onDelete={onDelete} /> : null;

  const lastPanelContentRef = useRef<React.ReactNode>(null);
  if (livePanelContent !== null) {
    lastPanelContentRef.current = livePanelContent;
  }
  const panelContent = livePanelContent ?? lastPanelContentRef.current;

  return (
    <div className={"home-card" + (openPanel ? " home-card--expanded" : "")}>
      <div className="home-card-top">
        <div className="home-card-drag" {...(dragHandleProps ?? {})} title="Dra för att sortera">
          <MkDragIcon />
        </div>
        <div className="home-card-body">
          <div className="home-card-row1">
            <span
              ref={titleInputRef}
              className={"home-card-title" + (!marker.title ? " home-card-title--empty" : "")}
              contentEditable={editingTitle}
              suppressContentEditableWarning
              data-placeholder="Markörnamn"
              onBlur={handleTitleBlur}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); }
                if (e.key === "Escape") { (e.target as HTMLElement).textContent = marker.title; setEditingTitle(false); }
              }}
            >{marker.title}</span>
            {!editingTitle && (
              <button type="button" className="home-card-icon-btn" aria-label="Redigera titel"
                onClick={() => { setEditingTitle(true); setTimeout(() => { const el = titleInputRef.current; if (el) { el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}>
                <MkPenIcon />
              </button>
            )}
          </div>
          <div className="home-card-row2">
            <span
              className={"home-card-sub" + (!coordsStr ? " home-card-sub--empty" : "")}
              data-placeholder="Ange koordinater"
            >{coordsStr}</span>
          </div>
          <div className="home-card-row3">
            <div className="home-card-icons">
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "content" ? " home-card-icon-btn--active" : "")}
                title="Innehåll" onClick={() => onPanelToggle(marker.id, "content")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>article</span>
              </button>
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "location" ? " home-card-icon-btn--active" : "")}
                title="Plats" onClick={() => onPanelToggle(marker.id, "location")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>keep</span>
              </button>
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "appearance" ? " home-card-icon-btn--active" : "")}
                title="Färger" onClick={() => onPanelToggle(marker.id, "appearance")}>
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>colors</span>
              </button>
            </div>
          </div>
        </div>
        <div className="home-card-toggle">
          <MkToggle checked={isActive} onChange={onToggle} />
          <button type="button"
            className={"home-card-icon-btn home-card-trash" + (openPanel === "delete" ? " home-card-icon-btn--active" : "")}
            onClick={() => onPanelToggle(marker.id, "delete")} aria-label="Ta bort">
            <MkTrashIcon />
          </button>
        </div>
      </div>
      <div className={"home-card-panel" + (openPanel ? " home-card-panel--open" : "")}>
        <div className="home-card-panel-inner" style={openPanel && panelHeight != null ? { height: panelHeight } : undefined}>
          <div ref={panelContentRef}>
            <div className="home-card-panel-header">
              <div style={{ width: 26, flexShrink: 0 }} />
              <span className="home-card-panel-label">{openPanel ? MK_PANEL_LABELS[openPanel] : ""}</span>
              <button type="button" className="home-card-panel-close"
                onClick={() => { if (openPanel) onPanelToggle(marker.id, openPanel); }}>
                <MkCloseIcon />
              </button>
            </div>
            <div className="card-panel-body">
              {panelContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sortable Wrappers ────────────────────────────────────────

function SortableMarkerCard({
  marker, openPanel, onPanelToggle, onToggle, onDelete, onUpdate,
}: {
  marker: MapMarkerConfig;
  openPanel: MkPanelKey;
  onPanelToggle: (id: string, key: Exclude<MkPanelKey, null>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: MapMarkerConfig) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: marker.id });
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, transition }
    : { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <MarkerCardItem
        marker={marker}
        openPanel={openPanel}
        onPanelToggle={onPanelToggle}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={onUpdate}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Markers Section (main orchestrator) ──────────────────────

export function MarkersSection({
  markers,
  onUpdate,
}: {
  markers: MapMarkerConfig[];
  onUpdate: (markers: MapMarkerConfig[]) => void;
}) {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MkPanelKey>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sorted: MapMarkerConfig[] = useMemo(() => {
    const withDefaults = markers.map((m, i) => ({
      ...m,
      isActive: m.isActive !== false,
      sortOrder: m.sortOrder ?? i,
    }));
    return [...withDefaults].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [markers]);

  const handlePanelToggle = useCallback((id: string, key: Exclude<MkPanelKey, null>) => {
    if (activeCard === id && activePanel === key) {
      setActivePanel(null);
      setActiveCard(null);
    } else {
      setActiveCard(id);
      setActivePanel(key);
    }
  }, [activeCard, activePanel]);

  const save = useCallback((newMarkers: MapMarkerConfig[]) => {
    const normalized = [...newMarkers]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((m, i) => ({ ...m, sortOrder: i }));
    onUpdate(normalized);
  }, [onUpdate]);

  // ── Drag handlers ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex(m => m.id === active.id);
    const newIndex = sorted.findIndex(m => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    save(reordered.map((m, i) => ({ ...m, sortOrder: i })));
  }, [sorted, save]);

  // ── CRUD operations ──

  const handleAdd = useCallback(() => {
    const newMarker: MapMarkerConfig = {
      ...DEFAULT_MARKER,
      id: createMarkerId(),
      title: `Markör ${markers.length + 1}`,
      isActive: true,
      sortOrder: 0,
    };
    const shifted = markers.map(m => ({ ...m, sortOrder: (m.sortOrder ?? 0) + 1 }));
    save([{ ...newMarker, sortOrder: 0 }, ...shifted]);
  }, [markers, save]);

  const handleToggle = useCallback((id: string) => {
    const target = markers.find(m => m.id === id);
    if (!target) return;
    save(markers.map(m => m.id === id ? { ...m, isActive: target.isActive === false } : m));
  }, [markers, save]);

  const handleDelete = useCallback((id: string) => {
    save(markers.filter(m => m.id !== id));
  }, [markers, save]);

  const handleUpdate = useCallback((updated: MapMarkerConfig) => {
    save(markers.map(m => m.id === updated.id ? updated : m));
  }, [markers, save]);

  const activeCount = sorted.filter(m => m.isActive !== false).length;
  const activeDragMarker = activeDragId ? sorted.find(m => m.id === activeDragId) ?? null : null;

  if (sorted.length === 0) {
    return (
      <div className="mk-empty">
        <div className="mk-empty__icon">
          <span className="material-symbols-rounded" style={{ fontSize: 35 }}>pinboard</span>
        </div>
        <h3 className="mk-empty__title">Inga markörer ännu</h3>
        <p className="mk-empty__desc">Lägg till en för att komma igång.</p>
        <button type="button" className="maps-create-btn" onClick={() => handleAdd()}>
          <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add_2</span>
          Lägg till markör
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="home-section-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="home-section-sub">{activeCount} aktiva</div>
        </div>
      </div>

      <DndContext
        id="markers-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sorted.map(m => m.id)} strategy={verticalListSortingStrategy}>
          <div className="home-card-list">
            {sorted.map((marker) => (
              <SortableMarkerCard
                key={marker.id}
                marker={marker}
                openPanel={activeCard === marker.id ? activePanel : null}
                onPanelToggle={handlePanelToggle}
                onToggle={() => handleToggle(marker.id)}
                onDelete={() => handleDelete(marker.id)}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeDragMarker ? (
            <div style={{ opacity: 1, borderRadius: 16 }}>
              <MarkerCardItem
                marker={activeDragMarker}
                openPanel={null}
                onPanelToggle={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                onUpdate={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button type="button" className="home-add-btn-full" onClick={() => handleAdd()}>
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>add_2</span>
        Lägg till
      </button>
    </>
  );
}
