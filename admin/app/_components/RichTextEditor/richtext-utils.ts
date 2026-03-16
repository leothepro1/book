// ── Rich Text Editor — DOM utilities ──────────────────────────
//
// Pure functions. No React. No side effects beyond DOM mutation.
// Shared by all richtext editor instances (maps, translations, etc.)

export type TextAlign = "left" | "center" | "right";

export const BLOCK_OPTIONS: { tag: string; label: string; fontSize: number; fontWeight: number }[] = [
  { tag: "p", label: "Stycke", fontSize: 14, fontWeight: 400 },
  { tag: "h1", label: "Rubrik 1", fontSize: 28, fontWeight: 700 },
  { tag: "h2", label: "Rubrik 2", fontSize: 24, fontWeight: 700 },
  { tag: "h3", label: "Rubrik 3", fontSize: 20, fontWeight: 600 },
  { tag: "h4", label: "Rubrik 4", fontSize: 18, fontWeight: 600 },
  { tag: "h5", label: "Rubrik 5", fontSize: 16, fontWeight: 600 },
  { tag: "h6", label: "Rubrik 6", fontSize: 14, fontWeight: 600 },
];

export const ALIGN_ICONS = {
  left: `<span class="material-symbols-rounded" style="font-size:20px">format_align_left</span>`,
  center: `<span class="material-symbols-rounded" style="font-size:20px">format_align_justify</span>`,
  right: `<span class="material-symbols-rounded" style="font-size:20px">format_align_right</span>`,
};

export const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Vänster" },
  { value: "center", label: "Centrerat" },
  { value: "right", label: "Höger" },
];

const RT_SAFE_TAGS = new Set(["b", "strong", "i", "em", "u", "br", "p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "span", "font"]);
const RT_BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

// ── Sanitization ─────────────────────────────────────────────

export function rtSanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return rtWalk(doc.body);
}

function rtWalk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

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
  if (tag !== "br" && !inner.trim() && !inner.includes("<br") && !inner.includes("<img")) return "";
  if (RT_SAFE_TAGS.has(tag)) {
    if (RT_BLOCK_TAGS.has(tag)) {
      const stripped = inner.replace(/<br\s*\/?>$/, "");
      if (stripped.length > 0) inner = stripped;
    }
    let attrs = "";
    if (RT_BLOCK_TAGS.has(tag)) {
      const align = el.style.textAlign;
      if (align && align !== "left" && align !== "start") {
        attrs = ` style="text-align:${align}"`;
      }
    }
    // Preserve color on font/span elements (from foreColor command)
    if (tag === "font") {
      const color = el.getAttribute("color");
      if (color) attrs = ` color="${color}"`;
    }
    if (tag === "span") {
      const color = el.style.color;
      if (color) attrs = ` style="color:${color}"`;
    }
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }
  return inner;
}

// ── DOM Helpers ──────────────────────────────────────────────

export function rtClosestBlock(node: Node | null, editor: HTMLElement): HTMLElement | null {
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && RT_BLOCK_TAGS.has((node as HTMLElement).tagName.toLowerCase())) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

export function rtNormalize(editor: HTMLElement): void {
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
  if (!editor.firstChild) {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    editor.appendChild(p);
  }
}

export function rtGetSelectedBlocks(editor: HTMLElement): HTMLElement[] {
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

// ── Alignment ────────────────────────────────────────────────

export function rtApplyAlign(align: TextAlign, editor: HTMLElement): void {
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

export function rtGetAlign(editor: HTMLElement): TextAlign {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return "left";
  const block = rtClosestBlock(sel.anchorNode, editor);
  if (!block) return "left";
  const computed = block.style.textAlign || getComputedStyle(block).textAlign;
  if (computed === "center") return "center";
  if (computed === "right" || computed === "end") return "right";
  return "left";
}

// ── Block Operations ─────────────────────────────────────────

function rtSwapBlockTag(block: HTMLElement, tag: string): HTMLElement {
  if (block.tagName.toLowerCase() === tag) return block;
  const newBlock = document.createElement(tag);
  if (block.style.textAlign) newBlock.style.textAlign = block.style.textAlign;
  while (block.firstChild) newBlock.appendChild(block.firstChild);
  block.replaceWith(newBlock);
  return newBlock;
}

export function rtApplyBlock(tag: string, editor: HTMLElement): void {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  const blocks = rtGetSelectedBlocks(editor);
  if (blocks.length > 1) {
    for (const b of blocks) rtSwapBlockTag(b, tag);
    return;
  }

  const block = blocks[0] || rtClosestBlock(range.startContainer, editor);
  if (!block) return;
  const currentTag = block.tagName.toLowerCase();

  if (range.collapsed || range.toString().trim().length >= (block.textContent ?? "").trim().length) {
    const newBlock = rtSwapBlockTag(block, tag);
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
  if (hasBefore) { const b = document.createElement(currentTag); b.appendChild(beforeFrag); result.push(b); }
  const middle = document.createElement(tag); middle.appendChild(selectedFrag); result.push(middle);
  if (hasAfter) { const a = document.createElement(currentTag); a.appendChild(afterFrag); result.push(a); }

  const parent = block.parentNode!;
  const ref = block.nextSibling;
  block.remove();
  for (const el of result) parent.insertBefore(el, ref);

  try {
    const r = document.createRange();
    r.selectNodeContents(middle);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /* non-critical */ }
}
