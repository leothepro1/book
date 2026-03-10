/**
 * Rich Text Link Types — Typed link system for inline anchors
 * ═══════════════════════════════════════════════════════════════
 *
 * Six link destination types, each with its own form fields,
 * validation, and rendering target behaviour.
 *
 * Storage: data attributes on <a> elements inside contentEditable.
 *   data-link-type   = "url" | "document" | "email" | "phone" | "contact" | "text"
 *   data-link-target = "external" | "iframe" | "modal"
 *   data-link-payload = JSON-encoded payload specific to the type
 *
 * CSS prefix: none (pure logic + types).
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type RichTextLinkType =
  | "url"
  | "document"
  | "email"
  | "phone"
  | "contact"
  | "text";

export type RichTextLinkTarget = "external" | "iframe" | "modal";

/**
 * Per-type payloads. Discriminated union on `type`.
 */
export type UrlPayload = {
  href: string;
  openInNewTab: boolean;
};

export type DocumentPayload = {
  fileUrl: string;
  fileName: string;
  filePublicId: string;
  fileDescription: string;
};

export type EmailPayload = {
  email: string;
  subject?: string;
};

export type PhonePayload = {
  phone: string;
};

export type ContactPayload = {
  contactName: string;
  phone1Prefix: string;
  phone1Number: string;
  phone2Prefix: string;
  phone2Number: string;
  fax1Prefix: string;
  fax1Number: string;
  fax2Prefix: string;
  fax2Number: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  zip: string;
  notes: string;
};

export type TextPayload = {
  title: string;
  content: string;
};

export type RichTextLinkPayload =
  | UrlPayload
  | DocumentPayload
  | EmailPayload
  | PhonePayload
  | ContactPayload
  | TextPayload;

export type RichTextLinkData = {
  type: RichTextLinkType;
  target: RichTextLinkTarget;
  payload: RichTextLinkPayload;
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

export type LinkTypeOption = {
  value: RichTextLinkType;
  label: string;
  icon: string; // SVG path reference or emoji
};

export const LINK_TYPE_OPTIONS: LinkTypeOption[] = [
  { value: "url", label: "Länk", icon: "link" },
  { value: "document", label: "Dokument", icon: "file" },
  { value: "email", label: "E-post", icon: "mail" },
  { value: "phone", label: "Telefonnummer", icon: "phone" },
  { value: "text", label: "Text", icon: "text" },
];

/** Default target per link type. */
export const DEFAULT_TARGET: Record<RichTextLinkType, RichTextLinkTarget> = {
  url: "external",
  document: "iframe",
  email: "external",
  phone: "external",
  contact: "modal",
  text: "modal",
};

/** Whether the type shows the "open in new tab" checkbox. */
export const SHOWS_NEW_TAB_CHECKBOX: Record<RichTextLinkType, boolean> = {
  url: true,
  document: true,
  email: false,
  phone: false,
  contact: false,
  text: false,
};

/** Countries list (Swedish labels) for the contact form. */
export const COUNTRIES = [
  "Sverige",
  "Norge",
  "Danmark",
  "Finland",
  "Island",
  "Tyskland",
  "Frankrike",
  "Spanien",
  "Italien",
  "Storbritannien",
  "USA",
  "Kanada",
  "Australien",
  "Japan",
  "Kina",
  "Indien",
  "Brasilien",
];

// ═══════════════════════════════════════════════════════════════
// EMPTY PAYLOADS
// ═══════════════════════════════════════════════════════════════

export function createEmptyPayload(type: RichTextLinkType): RichTextLinkPayload {
  switch (type) {
    case "url":
      return { href: "", openInNewTab: false };
    case "document":
      return { fileUrl: "", fileName: "", filePublicId: "", fileDescription: "" };
    case "email":
      return { email: "", subject: "" };
    case "phone":
      return { phone: "" };
    case "contact":
      return {
        contactName: "",
        phone1Prefix: "+46",
        phone1Number: "",
        phone2Prefix: "+46",
        phone2Number: "",
        fax1Prefix: "+46",
        fax1Number: "",
        fax2Prefix: "+46",
        fax2Number: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        country: "Sverige",
        zip: "",
        notes: "",
      };
    case "text":
      return { title: "", content: "" };
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validatePayload(
  type: RichTextLinkType,
  payload: RichTextLinkPayload
): boolean {
  switch (type) {
    case "url": {
      const p = payload as UrlPayload;
      return isValidWebUrl(p.href);
    }
    case "document": {
      const p = payload as DocumentPayload;
      return p.fileUrl.length > 0;
    }
    case "email": {
      const p = payload as EmailPayload;
      return isValidEmail(p.email);
    }
    case "phone": {
      const p = payload as PhonePayload;
      return p.phone.replace(/\s/g, "").length >= 5;
    }
    case "contact": {
      const p = payload as ContactPayload;
      return p.contactName.trim().length > 0;
    }
    case "text": {
      const p = payload as TextPayload;
      return p.content.trim().length > 0;
    }
  }
}

function isValidWebUrl(input: string): boolean {
  if (!input.trim()) return false;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

// ═══════════════════════════════════════════════════════════════
// SERIALIZATION — Data ↔ DOM attributes
// ═══════════════════════════════════════════════════════════════
//
// CLEAN HTML OUTPUT — no redundant data, minimal attributes:
//
//   url:      <a href="https://..." target="_blank" rel="noopener noreferrer">
//   email:    <a href="mailto:name@ex.com?subject=Hi">
//   phone:    <a href="tel:+46701234567">
//   document: <a href="https://..." data-link-type="document" data-link-name="report.pdf" data-link-id="pub/id">
//   contact:  <a href="#" data-link-type="contact" data-link-contact='{...}'>
//   text:     <a href="#" data-link-type="text" data-link-content="...">
//
// URL, email, and phone produce STANDARD HTML — zero data attributes.
// Type is inferred from href pattern on deserialize.
// ═══════════════════════════════════════════════════════════════

/**
 * All data-* attribute names we use (for sanitizer allowlist).
 */
export const DATA_ATTRS = [
  "data-link-type",
  "data-link-name",
  "data-link-id",
  "data-link-contact",
  "data-link-content",
];

/**
 * Serialize link data to an attribute map for <a> elements.
 * Produces the cleanest possible HTML per type.
 */
export function serializeLinkData(data: RichTextLinkData): Record<string, string> {
  const attrs: Record<string, string> = {};

  switch (data.type) {
    case "url": {
      const p = data.payload as UrlPayload;
      attrs.href = p.href;
      if (p.openInNewTab) {
        attrs.target = "_blank";
        attrs.rel = "noopener noreferrer";
      }
      // No data-link-* — just a standard <a>
      break;
    }
    case "email": {
      const p = data.payload as EmailPayload;
      attrs.href = `mailto:${p.email}${p.subject ? `?subject=${encodeURIComponent(p.subject)}` : ""}`;
      // No data-link-* — standard mailto
      break;
    }
    case "phone": {
      const p = data.payload as PhonePayload;
      attrs.href = `tel:${p.phone.replace(/\s/g, "")}`;
      // No data-link-* — standard tel
      break;
    }
    case "document": {
      const p = data.payload as DocumentPayload;
      attrs.href = p.fileUrl;
      attrs["data-link-type"] = "document";
      if (p.fileName) attrs["data-link-name"] = p.fileName;
      if (p.filePublicId) attrs["data-link-id"] = p.filePublicId;
      break;
    }
    case "contact": {
      const p = data.payload as ContactPayload;
      attrs.href = "#";
      attrs["data-link-type"] = "contact";
      attrs["data-link-contact"] = JSON.stringify(p);
      break;
    }
    case "text": {
      const p = data.payload as TextPayload;
      attrs.href = "#";
      attrs["data-link-type"] = "text";
      attrs["data-link-content"] = p.content;
      break;
    }
  }

  return attrs;
}

/**
 * Deserialize link data from an <a> element's attributes.
 * Detects type from data-link-type or infers from href pattern.
 */
export function deserializeLinkData(el: HTMLAnchorElement): RichTextLinkData | null {
  const href = el.getAttribute("href") || "";
  const explicitType = el.getAttribute("data-link-type") as RichTextLinkType | null;

  // ── Explicit typed links (document, contact, text) ──
  if (explicitType === "document") {
    return {
      type: "document",
      target: "iframe",
      payload: {
        fileUrl: href,
        fileName: el.getAttribute("data-link-name") || "",
        filePublicId: el.getAttribute("data-link-id") || "",
      } as DocumentPayload,
    };
  }
  if (explicitType === "contact") {
    let contact: ContactPayload;
    try {
      contact = JSON.parse(el.getAttribute("data-link-contact") || "{}");
    } catch {
      contact = createEmptyPayload("contact") as ContactPayload;
    }
    return { type: "contact", target: "modal", payload: contact };
  }
  if (explicitType === "text") {
    return {
      type: "text",
      target: "modal",
      payload: { content: el.getAttribute("data-link-content") || "" } as TextPayload,
    };
  }

  // ── Infer type from href pattern ──
  if (href.startsWith("mailto:")) {
    const mailtoUrl = href.replace("mailto:", "");
    const [email, query] = mailtoUrl.split("?");
    const params = new URLSearchParams(query || "");
    return {
      type: "email",
      target: "external",
      payload: {
        email: decodeURIComponent(email),
        subject: params.get("subject") ? decodeURIComponent(params.get("subject")!) : "",
      } as EmailPayload,
    };
  }
  if (href.startsWith("tel:")) {
    return {
      type: "phone",
      target: "external",
      payload: { phone: href.replace("tel:", "") } as PhonePayload,
    };
  }

  // ── Default: treat as URL ──
  if (href && href !== "#") {
    const isNewTab = el.getAttribute("target") === "_blank";
    return {
      type: "url",
      target: "external",
      payload: { href, openInNewTab: isNewTab } as UrlPayload,
    };
  }

  return null;
}

/**
 * Apply serialized attributes to an existing anchor element.
 * Cleans old attributes before applying new ones.
 */
export function applyLinkDataToElement(
  el: HTMLAnchorElement,
  data: RichTextLinkData
): void {
  // Remove all previous data-link-* and standard link attrs
  for (const attr of DATA_ATTRS) el.removeAttribute(attr);
  el.removeAttribute("target");
  el.removeAttribute("rel");

  const attrs = serializeLinkData(data);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val);
  }
}

/**
 * Build a RichTextLinkData from a plain <a> that only has href/target
 * (legacy or pasted link). Uses deserializeLinkData which infers type.
 */
export function fromPlainAnchor(el: HTMLAnchorElement): RichTextLinkData {
  const result = deserializeLinkData(el);
  if (result) return result;
  // Fallback
  const href = el.getAttribute("href") || "";
  const isNewTab = el.getAttribute("target") === "_blank";
  return {
    type: "url",
    target: "external",
    payload: { href, openInNewTab: isNewTab } as UrlPayload,
  };
}
