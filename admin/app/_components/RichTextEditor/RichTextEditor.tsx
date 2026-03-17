"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  type TextAlign,
  BLOCK_OPTIONS,
  ALIGN_OPTIONS,
  ALIGN_ICONS,
  rtSanitize,
  rtNormalize,
  rtClosestBlock,
  rtGetSelectedBlocks,
  rtApplyBlock,
  rtApplyAlign,
  rtGetAlign,
} from "./richtext-utils";
import { ColorPickerPopup } from "@/app/(admin)/_components/ColorPicker";
import "./richtext.css";

const RT_BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

// ── Bold/Italic icons ────────────────────────────────────────

function BoldIcon() {
  return <span className="material-symbols-rounded" style={{ fontSize: 20 }}>format_bold</span>;
}

function ItalicIcon() {
  return <span className="material-symbols-rounded" style={{ fontSize: 20 }}>format_italic</span>;
}

function ImageIcon() {
  return <span className="material-symbols-rounded" style={{ fontSize: 20 }}>broken_image</span>;
}

// ── Props ────────────────────────────────────────────────────

export interface RichTextEditorHandle {
  insertImage: (src: string, alt?: string, mediaId?: string) => void;
}

interface RichTextEditorProps {
  /** Current HTML content */
  value: string;
  /** Called with sanitized HTML on every change */
  onChange: (html: string) => void;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Show image insertion button. Requires onImageInsert. */
  showMediaPicker?: boolean;
  /** Called when user wants to insert an image. Caller handles media library. */
  onRequestMediaPicker?: () => void;
  /** Min height of editor area */
  minHeight?: number;
  /** Max height of editor area (scrolls beyond) */
  maxHeight?: number;
  /** Ref to access editor methods (insertImage) */
  editorHandle?: React.MutableRefObject<RichTextEditorHandle | null>;
}

// ── Component ────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Skriv innehåll...",
  showMediaPicker = false,
  onRequestMediaPicker,
  minHeight = 140,
  maxHeight = 200,
  editorHandle,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState({ bold: false, italic: false, underline: false, textAlign: "left" as TextAlign });
  const [blockType, setBlockType] = useState("p");
  const [blockDropdownOpen, setBlockDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const blockDropdownRef = useRef<HTMLDivElement>(null);
  const blockListRef = useRef<HTMLUListElement>(null);
  const alignDropdownRef = useRef<HTMLDivElement>(null);
  const alignListRef = useRef<HTMLUListElement>(null);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const pendingColorRef = useRef<string | null>(null);
  const [htmlView, setHtmlView] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number; editorWidth: number } | null>(null);

  // Stable refs
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Init + re-init when leaving HTML view ──
  useEffect(() => {
    if (htmlView || !editorRef.current) return;
    editorRef.current.innerHTML = value || "<p><br></p>";
    rtNormalize(editorRef.current);
  }, [htmlView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outside click closes dropdowns ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!blockDropdownRef.current?.contains(t) && !blockListRef.current?.contains(t)) setBlockDropdownOpen(false);
      if (!alignDropdownRef.current?.contains(t) && !alignListRef.current?.contains(t)) setAlignDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Real-time format tracking ──
  useEffect(() => {
    const handler = () => {
      if (!editorRef.current) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current.contains(sel.anchorNode)) return;
      const anchorInText = sel.anchorNode?.nodeType === Node.TEXT_NODE && (sel.anchorNode.textContent ?? "").length > 0;
      setFormat({
        bold: anchorInText ? document.queryCommandState("bold") : false,
        italic: anchorInText ? document.queryCommandState("italic") : false,
        underline: anchorInText ? document.queryCommandState("underline") : false,
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
    if (target.tagName === "IMG") { e.preventDefault(); setSelectedImg(target as HTMLImageElement); }
    else setSelectedImg(null);
  }, []);

  useEffect(() => {
    if (!selectedImg) return;
    const handler = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) setSelectedImg(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedImg]);

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
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: selectedImg.offsetWidth, editorWidth: editorRef.current.offsetWidth };
  }, [selectedImg]);

  const [, forceUpdate] = useState(0);
  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing || !resizeRef.current || !selectedImg) return;
    const dx = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(40, resizeRef.current.startWidth + dx);
    const pct = Math.min(100, Math.round((newWidth / resizeRef.current.editorWidth) * 100));
    selectedImg.style.width = `${pct}%`;
    selectedImg.style.maxWidth = `${pct}%`;
    forceUpdate(n => n + 1);
  }, [resizing, selectedImg]);

  const handleResizeEnd = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    resizeRef.current = null;
    emitChangeRef.current();
  }, [resizing]);

  // ── Emit ──
  const preventFocusLoss = useCallback((e: React.MouseEvent) => { e.preventDefault(); }, []);

  const emitChange = useCallback((normalize = false) => {
    if (!editorRef.current) return;
    if (normalize) rtNormalize(editorRef.current);
    const html = rtSanitize(editorRef.current.innerHTML);
    onChangeRef.current(html);
  }, []);

  const emitChangeRef = useRef(emitChange);
  emitChangeRef.current = emitChange;

  // ── Formatting ──
  const toggleBold = useCallback(() => { document.execCommand("bold", false); setFormat(f => ({ ...f, bold: !f.bold })); emitChange(); }, [emitChange]);
  const toggleItalic = useCallback(() => { document.execCommand("italic", false); setFormat(f => ({ ...f, italic: !f.italic })); emitChange(); }, [emitChange]);
  const toggleUnderline = useCallback(() => { document.execCommand("underline", false); setFormat(f => ({ ...f, underline: !f.underline })); emitChange(); }, [emitChange]);

  const openColorPicker = useCallback(() => {
    // Save current selection so we can restore it after color pick
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
    setColorPickerOpen(true);
  }, []);

  const stageTextColor = useCallback((hex: string) => {
    pendingColorRef.current = hex;
  }, []);

  const commitTextColor = useCallback(() => {
    const hex = pendingColorRef.current;
    if (!hex) return;
    pendingColorRef.current = null;
    // Restore saved selection and apply color once
    const saved = savedSelectionRef.current;
    if (saved && editorRef.current) {
      const sel = document.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
    }
    document.execCommand("foreColor", false, hex);
    savedSelectionRef.current = null;
    emitChange();
  }, [emitChange]);

  const handleApplyBlock = useCallback((tag: string) => {
    if (!editorRef.current) { setBlockDropdownOpen(false); return; }
    rtApplyBlock(tag, editorRef.current);
    setBlockType(tag);
    setBlockDropdownOpen(false);
    emitChange(true);
  }, [emitChange]);

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
    if (mod && e.key === "u") { e.preventDefault(); toggleUnderline(); return; }
    if (mod && (e.key === "z" || e.key === "y")) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      emitChange();
      return;
    }

    if (e.key === "Backspace" && editorRef.current) {
      const sel = document.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const block = rtClosestBlock(range.startContainer, editorRef.current);
        if (block && range.startOffset === 0 && range.startContainer === block.firstChild) {
          const prev = block.previousElementSibling as HTMLElement | null;
          if (prev && RT_BLOCK_TAGS.has(prev.tagName.toLowerCase())) {
            e.preventDefault();
            const r = document.createRange();
            if (prev.lastChild) r.setStartAfter(prev.lastChild); else r.setStart(prev, 0);
            r.collapse(true);
            while (block.firstChild) {
              if (block.firstChild.nodeName === "BR" && prev.textContent) { block.firstChild.remove(); continue; }
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

    if (e.key === "Delete" && editorRef.current) {
      const sel = document.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const block = rtClosestBlock(range.startContainer, editorRef.current);
        if (block) {
          const atEnd = range.startOffset === (range.startContainer.textContent ?? "").length
            || (range.startContainer === block && range.startOffset === block.childNodes.length);
          const next = block.nextElementSibling as HTMLElement | null;
          if (atEnd && next && RT_BLOCK_TAGS.has(next.tagName.toLowerCase())) {
            e.preventDefault();
            while (next.firstChild) {
              if (next.firstChild.nodeName === "BR" && block.textContent) { next.firstChild.remove(); continue; }
              block.appendChild(next.firstChild);
            }
            next.remove();
            emitChange();
            return;
          }
        }
      }
    }
  }, [toggleBold, toggleItalic, toggleUnderline, emitChange]);

  // ── Paste ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const html = text.split(/\r?\n/).join("<br>");
    document.execCommand("insertHTML", false, html);
    emitChange(true);
  }, [emitChange]);

  // ── Public method: insert image at cursor ──
  const insertImage = useCallback((src: string, alt: string = "", mediaId?: string) => {
    if (!editorRef.current) return;
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.style.cssText = "max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;";
    if (mediaId) img.setAttribute("data-media-id", mediaId);
    editorRef.current.appendChild(img);
    emitChange(true);
  }, [emitChange]);

  // Expose insertImage via ref callback
  const insertImageRef = useRef(insertImage);
  insertImageRef.current = insertImage;

  // Expose handle for external callers
  useEffect(() => {
    if (editorHandle) {
      editorHandle.current = { insertImage: (...args) => insertImageRef.current(...args) };
    }
  }, [editorHandle]);

  const activeBlockLabel = BLOCK_OPTIONS.find(o => o.tag === blockType)?.label || "Stycke";

  return (
    <div className="rt-container">
      {/* Toolbar */}
      <div className="rt-toolbar" role="toolbar" aria-label="Textformatering">
        {/* Block type dropdown */}
        <div className="rt-block-dropdown" ref={blockDropdownRef}>
          <button type="button" className="rt-block-dropdown__trigger"
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
              <ul ref={blockListRef} className="rt-block-dropdown__list rt-block-dropdown__list--fixed"
                style={{ top: rect.bottom + 4, left: rect.left }}>
                {BLOCK_OPTIONS.map(opt => (
                  <li key={opt.tag}>
                    <button type="button"
                      className={`rt-block-dropdown__item${opt.tag === blockType ? " rt-block-dropdown__item--active" : ""}`}
                      onMouseDown={preventFocusLoss}
                      onClick={() => handleApplyBlock(opt.tag)}>
                      <span style={{ fontSize: opt.fontSize, fontWeight: opt.fontWeight }}>{opt.label}</span>
                      {opt.tag === blockType && (
                        <span className="material-symbols-rounded" style={{ fontSize: 24, color: "#0075DE" }}>check</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>,
              document.body,
            );
          })()}
        </div>

        {/* Divider */}
        <div className="rt-toolbar__divider" />

        {/* Group 2: Bold, Italic, Underline, Color */}
        <div className="rt-toolbar__group">
          <button type="button" className={`rt-toolbar__btn${format.bold ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss} onClick={toggleBold} aria-label="Fetstil (⌘B)">
            <BoldIcon />
          </button>
          <button type="button" className={`rt-toolbar__btn${format.italic ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss} onClick={toggleItalic} aria-label="Kursiv (⌘I)">
            <ItalicIcon />
          </button>
          <button type="button" className={`rt-toolbar__btn${format.underline ? " rt-toolbar__btn--active" : ""}`}
            onMouseDown={preventFocusLoss} onClick={toggleUnderline} aria-label="Understruken (⌘U)">
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>format_underlined</span>
          </button>
          <button
            ref={colorBtnRef}
            type="button"
            className="rt-toolbar__btn"
            onMouseDown={preventFocusLoss}
            onClick={openColorPicker}
            aria-label="Textfärg"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>format_color_text</span>
          </button>
          {colorPickerOpen && createPortal(
            <ColorPickerPopup
              value="#000000"
              onChange={stageTextColor}
              onClose={() => { commitTextColor(); setColorPickerOpen(false); }}
              anchorRef={colorBtnRef}
            />,
            document.body,
          )}
        </div>

        {/* Divider */}
        <div className="rt-toolbar__divider" />

        {/* Group 3: Alignment */}
        <div className="rt-toolbar__group">
          <div className="rt-block-dropdown" ref={alignDropdownRef}>
            <button type="button" className="rt-block-dropdown__trigger"
              onMouseDown={preventFocusLoss} onClick={() => setAlignDropdownOpen(!alignDropdownOpen)}>
              <span style={{ display: "flex", alignItems: "center" }}
                dangerouslySetInnerHTML={{ __html: ALIGN_ICONS[format.textAlign] }} />
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                {alignDropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {alignDropdownOpen && (() => {
              const rect = alignDropdownRef.current?.getBoundingClientRect();
              if (!rect) return null;
              return createPortal(
                <ul ref={alignListRef} className="rt-block-dropdown__list rt-block-dropdown__list--fixed"
                  style={{ top: rect.bottom + 4, left: rect.left }}>
                  {ALIGN_OPTIONS.map(opt => (
                    <li key={opt.value}>
                      <button type="button"
                        className={`rt-block-dropdown__item${opt.value === format.textAlign ? " rt-block-dropdown__item--active" : ""}`}
                        onMouseDown={preventFocusLoss}
                        onClick={() => handleApplyAlign(opt.value)}>
                        <span style={{ display: "flex", alignItems: "center" }}
                          dangerouslySetInnerHTML={{ __html: ALIGN_ICONS[opt.value] }} />
                        {opt.value === format.textAlign && (
                          <span className="material-symbols-rounded" style={{ fontSize: 24, color: "#0075DE" }}>check</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>,
                document.body,
              );
            })()}
          </div>
        </div>

        {showMediaPicker && (
          <>
            {/* Divider */}
            <div className="rt-toolbar__divider" />

            {/* Group 4: Image */}
            <div className="rt-toolbar__group">
              <button type="button" className="rt-toolbar__btn"
                onMouseDown={preventFocusLoss} onClick={onRequestMediaPicker} aria-label="Infoga bild">
                <ImageIcon />
              </button>
            </div>
          </>
        )}

        {/* HTML view toggle — far right edge of toolbar */}
        <button type="button"
          className={`rt-toolbar__btn rt-toolbar__btn--code${htmlView ? " rt-toolbar__btn--active" : ""}`}
          onMouseDown={preventFocusLoss}
          onClick={() => setHtmlView(!htmlView)}
          aria-label="Visa HTML"
          aria-pressed={htmlView}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>code</span>
        </button>
      </div>

      {/* Editor area */}
      <div className="rt-editor-wrap">
        {htmlView ? (
          <pre className="rt-editor rt-editor--html" style={{ minHeight }}>
            {editorRef.current ? rtSanitize(editorRef.current.innerHTML) : value}
          </pre>
        ) : (
          <div
            ref={editorRef}
            className="rt-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={() => emitChange()}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onClick={handleEditorClick}
            role="textbox"
            aria-multiline="true"
            data-placeholder={placeholder}
            style={{ minHeight }}
          />
        )}
        {selectedImg && editorRef.current && (() => {
          const top = selectedImg.offsetTop;
          const left = selectedImg.offsetLeft;
          const w = selectedImg.offsetWidth;
          const h = selectedImg.offsetHeight;
          const pct = Math.round((w / editorRef.current!.offsetWidth) * 100);
          return (
            <div className="rt-img-overlay" style={{ top, left, width: w, height: h }} contentEditable={false}>
              <div className="rt-img-overlay__border" />
              {(["nw", "ne", "sw", "se"] as const).map(corner => (
                <div key={corner} className={`rt-img-handle rt-img-handle--${corner}`}
                  onPointerDown={handleResizeStart} onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeEnd} onPointerCancel={handleResizeEnd} />
              ))}
              <div className="rt-img-overlay__pct">{pct}%</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export { type RichTextEditorProps };
