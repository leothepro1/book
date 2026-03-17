"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useSettings } from "@/app/(admin)/_components/SettingsContext";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import "@/app/(admin)/files/files.css";
import {
  getEmailTemplates,
  getEmailTemplateDetail,
  saveEmailTemplate,
  resetEmailTemplate,
  sendTestEmail,
  getAdminEmail,
  getTenantSenderInfo,
  getTenantEmailBranding,
} from "./actions";
import type { EmailTemplateRow, EmailTemplateDetail, TenantSenderInfo, TenantEmailBranding } from "./actions";
import "./email.css";

// ── ButtonSpinner ───────────────────────────────────────────────

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;
  return (
    <svg className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none"
      style={{ marginTop: 1 }} onAnimationEnd={handleAnimationEnd} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2"
        strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

// ── Props ───────────────────────────────────────────────────────

type EmailContentProps = {
  onSubTitleChange?: (title: string | null) => void;
  onHeaderExtraChange?: (node: React.ReactNode) => void;
};

// ── Main component ──────────────────────────────────────────────

type EmailView = "main" | "guest-notifications" | "template-preview" | "customize-templates";

const DEFAULT_LOGO_WIDTH = 120;
const VALID_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const GUEST_NOTIFICATION_CATEGORIES = [
  {
    label: "Bekräftelser",
    items: [
      { id: "BOOKING_CONFIRMED", title: "Bokningsbekräftelse", desc: "Skickas när en bokning registreras" },
      { id: "MAGIC_LINK", title: "Inloggningslänk", desc: "Skickas när en gäst begär en ny inloggningslänk" },
    ],
  },
  {
    label: "Vistelse",
    items: [
      { id: "CHECK_IN_CONFIRMED", title: "Incheckningsbekräftelse", desc: "Skickas när en gäst checkar in" },
      { id: "CHECK_OUT_CONFIRMED", title: "Utcheckningsbekräftelse", desc: "Skickas när en gäst checkar ut" },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "SUPPORT_REPLY", title: "Supportmeddelande", desc: "Skickas när ni svarar på ett gästärende" },
    ],
  },
];

const ALL_TEMPLATE_IDS = GUEST_NOTIFICATION_CATEGORIES.flatMap((c) => c.items);

export function EmailContent({ onSubTitleChange, onHeaderExtraChange }: EmailContentProps) {
  const { subPath, setSubPath } = useSettings();
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateDetail | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplateDetail | null>(null);

  // Derive view from subPath
  const view: EmailView = subPath === "customize" ? "customize-templates"
    : subPath?.startsWith("guest/") ? "template-preview"
    : subPath === "guest" ? "guest-notifications"
    : "main";

  // Editor form state
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [html, setHtml] = useState("");
  const [originalSubject, setOriginalSubject] = useState("");
  const [originalPreviewText, setOriginalPreviewText] = useState("");
  const [originalHtml, setOriginalHtml] = useState("");

  // Preview HTML (debounced)
  const [previewHtml, setPreviewHtml] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Test send modal
  const [showTestModal, setShowTestModal] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [showTestToast, setShowTestToast] = useState(false);

  // Customize-templates state
  const [branding, setBranding] = useState<TenantEmailBranding | null>(null);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingLogoWidth, setBrandingLogoWidth] = useState(DEFAULT_LOGO_WIDTH);
  const [brandingAccentColor, setBrandingAccentColor] = useState("#1A56DB");
  const [hexInput, setHexInput] = useState("#1A56DB");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customizePreviewIdx, setCustomizePreviewIdx] = useState(0);
  const [customizeDetails, setCustomizeDetails] = useState<Map<string, EmailTemplateDetail>>(new Map());
  const [customizePreviewHtml, setCustomizePreviewHtml] = useState("");
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [showBrandingSavedToast, setShowBrandingSavedToast] = useState(false);

  // Sender info
  const [senderInfo, setSenderInfo] = useState<TenantSenderInfo | null>(null);
  const [senderLoaded, setSenderLoaded] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [senderDirty, setSenderDirty] = useState(false);
  const [senderTouched, setSenderTouched] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);
  const [showSentToast, setShowSentToast] = useState(false);
  const [sendBtnExiting, setSendBtnExiting] = useState(false);

  // Load data
  useEffect(() => {
    getEmailTemplates().then((rows) => { setTemplates(rows); setLoaded(true); });
    getAdminEmail().then(setAdminEmail);
    getTenantSenderInfo().then((info) => {
      setSenderInfo(info);
      setSenderLoaded(true);
      if (info) {
        const display = info.pendingEmailFrom
          ?? info.emailFrom
          ?? (info.portalSlug ? `noreply@${info.portalSlug}.bedfront.com` : "noreply@bedfront.com");
        setSenderEmail(display);
      }
    });
  }, []);

  // Restore view from hash on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (!subPath) return;
    restoredRef.current = true;

    if (subPath === "guest") {
      onSubTitleChange?.("Gästaviseringar");
    } else if (subPath === "customize") {
      openCustomize();
    } else if (subPath.startsWith("guest/")) {
      const eventType = subPath.split("/")[1];
      const cat = GUEST_NOTIFICATION_CATEGORIES.flatMap((c) => c.items).find((i) => i.id === eventType);
      if (cat) {
        onSubTitleChange?.(cat.title);
        getEmailTemplateDetail(eventType).then((detail) => {
          if (detail) setPreviewing(detail);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subPath, onSubTitleChange]);

  // Auto-clear toasts
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!showSentToast) return; const t = setTimeout(() => setShowSentToast(false), 4000); return () => clearTimeout(t); }, [showSentToast]);
  useEffect(() => { if (!showTestToast) return; const t = setTimeout(() => setShowTestToast(false), 4000); return () => clearTimeout(t); }, [showTestToast]);
  useEffect(() => { if (!showBrandingSavedToast) return; const t = setTimeout(() => setShowBrandingSavedToast(false), 4000); return () => clearTimeout(t); }, [showBrandingSavedToast]);

  // ── Sender handler ──────────────────────────────────────────────

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const currentAddress = senderInfo?.emailFrom ?? (senderInfo?.portalSlug ? `noreply@${senderInfo.portalSlug}.bedfront.com` : "noreply@bedfront.com");
  const senderIsValid = emailRegex.test(senderEmail);
  const senderHasChanged = senderEmail !== currentAddress;
  const showSenderError = senderTouched && senderDirty && !senderIsValid && senderEmail.length > 0;
  const hasPending = !!senderInfo?.pendingEmailFrom;
  const isPendingEmail = hasPending && senderEmail === senderInfo?.pendingEmailFrom;
  const isNewEmail = senderIsValid && senderHasChanged && senderEmail !== senderInfo?.pendingEmailFrom;
  const showSendBtn = isNewEmail && !sendBtnExiting;
  const showPendingBadge = isPendingEmail && !sendBtnExiting;

  function handleSenderEmailChange(value: string) {
    setSenderEmail(value);
    setSenderDirty(true);
  }

  async function sendVerification(email?: string) {
    const target = email ?? senderEmail.trim();
    setIsInitiating(true);
    try {
      const res = await fetch("/api/email-sender/verify/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailFrom: target }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        // Show spinner → disabled for 1.5s → slide out → show pending
        setSendBtnExiting(true);
        await new Promise((r) => setTimeout(r, 1500));
        setSendBtnExiting(false);
        setShowSentToast(true);
        setSenderDirty(false);
        setSenderTouched(false);
        const info = await getTenantSenderInfo();
        setSenderInfo(info);
        // Keep input showing the pending email
        if (info?.pendingEmailFrom) setSenderEmail(info.pendingEmailFrom);
      }
    } catch {
      // silent
    }
    setIsInitiating(false);
  }

  async function handleInitiateVerification() {
    if (!senderIsValid || !senderHasChanged) return;
    await sendVerification();
  }

  async function handleResendVerification() {
    if (!senderInfo?.pendingEmailFrom) return;
    await sendVerification(senderInfo.pendingEmailFrom);
  }

  // ── Preview header buttons ─────────────────────────────────────

  // Set header buttons when in template-preview view
  useEffect(() => {
    if (view === "template-preview" && previewing) {
      onHeaderExtraChange?.(
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button
            className="settings-btn--muted"
            style={{ fontSize: 13, padding: "5px 12px" }}
            onClick={() => setShowTestModal(true)}
          >
            Skicka test
          </button>
          <button
            className="settings-btn--connect"
            style={{ fontSize: 13, padding: "5px 12px" }}
            onClick={() => {
              if (previewing) {
                openEditor(previewing.eventType);
              }
            }}
          >
            Redigera kod
          </button>
        </div>
      );
    } else if (view === "guest-notifications") {
      onHeaderExtraChange?.(
        <button
          className="settings-btn--muted"
          style={{ marginLeft: "auto", fontSize: 13, padding: "5px 12px" }}
          onClick={() => openCustomize()}
        >
          Anpassa e-postmallar
        </button>
      );
    } else {
      onHeaderExtraChange?.(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, previewing]);

  async function handleSendTestFromPreview() {
    if (!previewing) return;
    setIsSendingTest(true);
    const result = await sendTestEmail(previewing.eventType);
    setIsSendingTest(false);
    if (result.ok) {
      setShowTestModal(false);
      setShowTestToast(true);
    }
  }

  // ── Customize templates ─────────────────────────────────────────

  async function openCustomize() {
    setSubPath("customize");
    onSubTitleChange?.("Anpassa e-postmallar");

    // Load branding
    const b = await getTenantEmailBranding();
    if (b) {
      setBranding(b);
      setBrandingLogoUrl(b.logoUrl);
      setBrandingLogoWidth(b.logoWidth ?? DEFAULT_LOGO_WIDTH);
      setBrandingAccentColor(b.accentColor ?? "#1A56DB");
      setHexInput(b.accentColor ?? "#1A56DB");
    }

    // Load first template detail for preview
    const firstId = ALL_TEMPLATE_IDS[0]?.id;
    if (firstId) {
      setCustomizePreviewIdx(0);
      const detail = await getEmailTemplateDetail(firstId);
      if (detail) {
        setCustomizeDetails((m) => new Map(m).set(firstId, detail));
        setCustomizePreviewHtml(detail.override.html ?? detail.defaults.html);
      }
    }
  }

  async function navigateCustomizePreview(direction: -1 | 1) {
    const newIdx = customizePreviewIdx + direction;
    if (newIdx < 0 || newIdx >= ALL_TEMPLATE_IDS.length) return;
    setCustomizePreviewIdx(newIdx);
    const id = ALL_TEMPLATE_IDS[newIdx].id;

    // Use cached detail or fetch
    let detail = customizeDetails.get(id);
    if (!detail) {
      detail = await getEmailTemplateDetail(id) ?? undefined;
      if (detail) {
        setCustomizeDetails((m) => new Map(m).set(id, detail!));
      }
    }
    if (detail) {
      setCustomizePreviewHtml(detail.override.html ?? detail.defaults.html);
    }
  }

  const handleMediaSelect = useCallback((asset: MediaLibraryResult) => {
    setBrandingLogoUrl(asset.url);
    setLibraryOpen(false);
  }, []);

  async function saveBranding() {
    setIsSavingBranding(true);
    try {
      const body: Record<string, unknown> = {};
      body.logoUrl = brandingLogoUrl;
      body.logoWidth = brandingLogoWidth;
      body.accentColor = brandingAccentColor;
      await fetch("/api/email-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowBrandingSavedToast(true);
    } catch {
      // silent
    }
    setIsSavingBranding(false);
  }

  // ── Template editor handlers ────────────────────────────────────

  async function openEditor(eventType: string) {
    const detail = await getEmailTemplateDetail(eventType);
    if (!detail) return;
    setEditing(detail);
    onSubTitleChange?.(detail.label);
    const s = detail.override.subject ?? "";
    const p = detail.override.previewText ?? "";
    const h = detail.override.html ?? "";
    setSubject(s); setPreviewText(p); setHtml(h);
    setOriginalSubject(s); setOriginalPreviewText(p); setOriginalHtml(h);
    setPreviewHtml(h || detail.defaults.html);
    setToast(null);
  }

  function closeEditor() {
    setEditing(null);
    if (view === "guest-notifications") {
      onSubTitleChange?.("Gästaviseringar");
    } else {
      onSubTitleChange?.(null);
    }
    setToast(null);
    getEmailTemplates().then(setTemplates);
  }

  function handleHtmlChange(value: string) {
    setHtml(value);
    if (editing) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setPreviewHtml(value.trim() || editing.defaults.html), 500);
    }
  }

  const hasChanges = subject !== originalSubject || previewText !== originalPreviewText || html !== originalHtml;

  function insertVariable(
    variable: string,
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
    value: string,
    setValue: (v: string) => void,
  ) {
    const el = ref.current;
    const tag = `{{${variable}}}`;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const newValue = value.slice(0, start) + tag + value.slice(end);
      setValue(newValue);
      requestAnimationFrame(() => { el.focus(); const pos = start + tag.length; el.setSelectionRange(pos, pos); });
    } else {
      setValue(value + tag);
    }
  }

  async function handleSave() {
    if (!editing || !hasChanges) return;
    setIsSaving(true); setToast(null);
    const data: Record<string, string | null> = {};
    if (subject !== originalSubject) data.subject = subject.trim() || null;
    if (previewText !== originalPreviewText) data.previewText = previewText.trim() || null;
    if (html !== originalHtml) data.html = html.trim() || null;
    const result = await saveEmailTemplate(editing.eventType, data);
    setIsSaving(false);
    if (result.ok) {
      setOriginalSubject(subject); setOriginalPreviewText(previewText); setOriginalHtml(html);
      setToast({ type: "success", message: "Mallen har sparats" });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte spara" });
    }
  }

  async function handleReset() {
    if (!editing) return;
    setIsResetting(true);
    const result = await resetEmailTemplate(editing.eventType);
    setIsResetting(false); setShowResetConfirm(false);
    if (result.ok) {
      setSubject(""); setPreviewText(""); setHtml("");
      setOriginalSubject(""); setOriginalPreviewText(""); setOriginalHtml("");
      setPreviewHtml(editing.defaults.html);
      setEditing({ ...editing, hasOverride: false, override: { subject: null, previewText: null, html: null, updatedAt: null } });
      setToast({ type: "success", message: "Mallen har återställts till standard" });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte återställa" });
    }
  }

  async function handleSendTest() {
    if (!editing) return;
    setIsSending(true); setToast(null);
    const result = await sendTestEmail(editing.eventType);
    setIsSending(false);
    if (result.ok) {
      setToast({ type: "success", message: `Testmail skickat till ${result.to}` });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte skicka testmail" });
    }
  }

  // Refs for cursor insertion
  const subjectRef = useRef<HTMLInputElement>(null);
  const previewTextRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "0.75rem",
    padding: 16,
    boxShadow: "0 5px 5px -2.5px #00000008, 0 3px 3px -1.5px #00000005, 0 2px 2px -1px #00000005, 0 1px 1px -0.5px #00000008, 0 0.5px 0.5px #0000000a, 0 0 0 1px #0000000f",
  };

  // ── Customize templates view ─────────────────────────────────

  if (view === "customize-templates") {
    const currentTemplate = ALL_TEMPLATE_IDS[customizePreviewIdx];
    const currentDetail = currentTemplate ? customizeDetails.get(currentTemplate.id) : null;

    // Resolve preview HTML with branding overrides applied
    const rawPreviewHtml = customizePreviewHtml;
    const resolvedCustomizeHtml = rawPreviewHtml
      .replace(/background-color:\s*#f6f6f6/gi, "background-color:#fff")
      .replace(/padding:\s*40px\s+0/gi, "padding:0")
      .replace(/padding:\s*40px\s+32px/gi, "padding:16px")
      .replace(/max-width:\s*600px/gi, "max-width:100%")
      .replace(/border-radius:\s*8px/gi, "border-radius:0")
      .replace(/margin:\s*0\s+auto/gi, "margin:0");

    return (
      <div className="email-root">
        {/* Container 1: Logotyp */}
        <div style={cardStyle}>
          <h4 className="email-customize__title">Logotyp</h4>
          {brandingLogoUrl ? (
            <div className="img-upload">
              <div className="img-upload-result">
                <div className="img-upload-result-thumb">
                  <img src={brandingLogoUrl} alt="" className="img-upload-result-img" />
                </div>
                <div className="img-upload-result-meta">
                  <span className="img-upload-result-filename">
                    {brandingLogoUrl.split("/").pop() || "logotyp"}
                  </span>
                  <button
                    type="button"
                    className="design-logo-btn design-logo-btn-edit"
                    onClick={() => setLibraryOpen(true)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" /></svg>
                    <span>Ändra</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="img-upload-trash-btn"
                  onClick={() => setBrandingLogoUrl(null)}
                  aria-label="Ta bort logotyp"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="img-upload">
              <div
                className="img-upload-empty"
                onClick={() => setLibraryOpen(true)}
                style={{ cursor: "pointer" }}
              >
                <svg className="img-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M3.5 0 3 .5v23l.5.5h17l.5-.5v-16l-.15-.35-7-7L13.5 0h-10ZM4 23V1h9v6.5l.5.5H20v15H4ZM19.3 7 14 1.7V7h5.3Z" fill="currentColor" />
                </svg>
                <span className="img-upload-empty-text">
                  Välj fil att ladda upp,<br />eller dra och släpp här
                </span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <label className="email-customize__label">Logotypstorlek</label>
            <div className="sf-range-row">
              <div
                className="sf-range__track"
                ref={(el) => {
                  if (!el) return;
                  const onDown = (e: PointerEvent) => {
                    e.preventDefault();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    const rect = el.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const v = Math.round(24 + ratio * (400 - 24));
                    setBrandingLogoWidth(v);
                  };
                  const onMove = (e: PointerEvent) => {
                    if (!el.hasPointerCapture(e.pointerId)) return;
                    const rect = el.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const v = Math.round(24 + ratio * (400 - 24));
                    setBrandingLogoWidth(v);
                  };
                  el.onpointerdown = onDown;
                  el.onpointermove = onMove;
                  el.onpointerup = () => {};
                }}
              >
                <div className="sf-range__fill" style={{ width: `${((brandingLogoWidth - 24) / (400 - 24)) * 100}%` }} />
                <div className="sf-range__thumb" style={{ left: `${((brandingLogoWidth - 24) / (400 - 24)) * 100}%` }} />
              </div>
              <div className="sf-range-input-wrap">
                <input
                  type="number"
                  className="sf-range-input"
                  value={brandingLogoWidth}
                  min={24}
                  max={400}
                  step={1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) setBrandingLogoWidth(Math.min(400, Math.max(24, v)));
                  }}
                />
                <span className="sf-range-unit">px</span>
              </div>
            </div>
          </div>
        </div>

        {/* Container 2: Färger */}
        <div style={cardStyle}>
          <h4 className="email-customize__title">Färger</h4>
          <label className="email-customize__label">Accentfärg</label>
          <div className="sf-color-row">
            <input
              type="color"
              className="sf-color-swatch"
              value={VALID_HEX.test(brandingAccentColor) ? brandingAccentColor : "#1A56DB"}
              onChange={(e) => { setBrandingAccentColor(e.target.value); setHexInput(e.target.value); }}
            />
            <input
              type="text"
              className="sf-input sf-input--color-hex"
              value={hexInput}
              onChange={(e) => {
                setHexInput(e.target.value);
                if (VALID_HEX.test(e.target.value)) {
                  setBrandingAccentColor(e.target.value);
                }
              }}
              onBlur={() => { if (!VALID_HEX.test(hexInput)) setHexInput(brandingAccentColor); }}
              maxLength={9}
            />
          </div>
        </div>

        {/* Container 3: Preview carousel */}
        <div style={cardStyle}>
          <div className="email-customize__preview-header">
            <span className="email-customize__preview-name">{currentTemplate?.title ?? ""}</span>
            <div className="email-customize__preview-nav">
              <div className="files-pagination__nav">
                <button
                  className="files-pagination__btn"
                  disabled={customizePreviewIdx === 0}
                  onClick={() => navigateCustomizePreview(-1)}
                  aria-label="Föregående mall"
                >
                  <EditorIcon name="chevron_left" size={20} />
                </button>
                <button
                  className="files-pagination__btn"
                  disabled={customizePreviewIdx >= ALL_TEMPLATE_IDS.length - 1}
                  onClick={() => navigateCustomizePreview(1)}
                  aria-label="Nästa mall"
                >
                  <EditorIcon name="chevron_right" size={20} />
                </button>
              </div>
            </div>
          </div>
          <div className="email-preview-card">
            <div className="email-preview-card__body">
              <iframe
                srcDoc={resolvedCustomizeHtml}
                title="E-postförhandsgranskning"
                sandbox="allow-same-origin"
                className="email-preview-card__iframe"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const doc = iframe.contentDocument;
                  if (doc) {
                    iframe.style.height = doc.documentElement.scrollHeight + "px";
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="settings-btn--connect"
            disabled={isSavingBranding}
            onClick={saveBranding}
          >
            <ButtonSpinner visible={isSavingBranding} />
            Spara ändringar
          </button>
        </div>

        {/* Branding saved toast */}
        <div className={`email-sender__toast ${showBrandingSavedToast ? "email-sender__toast--visible" : "email-sender__toast--hidden"}`}>
          <div className="email-sender__toast-inner">
            Ändringarna har sparats.
          </div>
        </div>

        <MediaLibraryModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onConfirm={handleMediaSelect}
          currentValue={brandingLogoUrl || undefined}
          uploadFolder="email"
          accept="image"
          title="Välj logotyp"
        />
      </div>
    );
  }

  // ── Template preview view ────────────────────────────────────

  if (view === "template-preview" && previewing) {
    const resolvedSubject = previewing.resolved.subject
      .replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const vars: Record<string, string> = { hotelName: "Grand Hotel Stockholm", guestName: "Anna Lindgren" };
        return vars[key] ?? `{{${key}}}`;
      });
    const rawHtml = previewing.override.html ?? previewing.defaults.html;
    // Strip inline styles that constrain the layout (max-width, padding, border-radius, background on outer wrappers)
    const resolvedHtml = rawHtml
      .replace(/background-color:\s*#f6f6f6/gi, "background-color:#fff")
      .replace(/padding:\s*40px\s+0/gi, "padding:0")
      .replace(/padding:\s*40px\s+32px/gi, "padding:16px")
      .replace(/max-width:\s*600px/gi, "max-width:100%")
      .replace(/border-radius:\s*8px/gi, "border-radius:0")
      .replace(/margin:\s*0\s+auto/gi, "margin:0");

    return (
      <div className="email-root">
        <div style={cardStyle}>
          <div className="email-preview-card">
            <div className="email-preview-card__subject">
              <span className="email-preview-card__subject-label">Ämne:</span> {resolvedSubject}
            </div>
            <div className="email-preview-card__body">
              <iframe
                srcDoc={resolvedHtml}
                title="E-postförhandsgranskning"
                sandbox="allow-same-origin"
                className="email-preview-card__iframe"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const doc = iframe.contentDocument;
                  if (doc) {
                    iframe.style.height = doc.documentElement.scrollHeight + "px";
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Send test modal */}
        {showTestModal && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => { if (!isSendingTest) setShowTestModal(false); }}
          >
            <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
            <div
              style={{
                position: "relative", zIndex: 1, background: "var(--admin-surface)",
                borderRadius: 16, padding: 0, width: 440, boxShadow: "none",
                animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
                padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
              }}>
                <h3 style={{ fontSize: 17, fontWeight: 600 }}>Skicka testmeddelande</h3>
                <button
                  onClick={() => { if (!isSendingTest) setShowTestModal(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "max-content", height: "max-content",
                    border: "none", background: "transparent",
                    borderRadius: "50%", cursor: "pointer", color: "var(--admin-text-secondary)",
                  }}
                  aria-label="Stäng"
                >
                  <EditorIcon name="close" size={20} />
                </button>
              </div>
              {/* Body */}
              <div style={{ padding: 20 }}>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--admin-text-secondary)", margin: 0 }}>
                  E-postmeddelande kommer att skickas till{" "}
                  <strong style={{ color: "var(--admin-text)" }}>{adminEmail ?? "..."}</strong>
                </p>
              </div>
              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 20px", borderTop: "1px solid var(--admin-border)" }}>
                <button
                  className="settings-btn--outline"
                  style={{ border: "none" }}
                  disabled={isSendingTest}
                  onClick={() => setShowTestModal(false)}
                >
                  Avbryt
                </button>
                <button
                  className="settings-btn--connect"
                  style={{ minWidth: 80 }}
                  disabled={isSendingTest}
                  onClick={handleSendTestFromPreview}
                >
                  <ButtonSpinner visible={isSendingTest} />
                  {!isSendingTest && "Skicka"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Test toast */}
        <div className={`email-sender__toast ${showTestToast ? "email-sender__toast--visible" : "email-sender__toast--hidden"}`}>
          <div className="email-sender__toast-inner">
            Verifieringsmeddelande skickat.
          </div>
        </div>
      </div>
    );
  }

  // ── Guest notifications view ─────────────────────────────────

  if (view === "guest-notifications" && !editing) {
    return (
      <div className="email-root">
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {GUEST_NOTIFICATION_CATEGORIES.map((cat) => (
              <div key={cat.label} className="email-cat">
                <div className="email-cat__header">{cat.label}</div>
                {cat.items.map((item, ii) => (
                  <div key={item.id}>
                    {ii > 0 && <div className="email-nav__divider" />}
                    <button
                      className="email-cat__item"
                      onClick={async () => {
                        const detail = await getEmailTemplateDetail(item.id);
                        if (detail) {
                          setPreviewing(detail);
                          setSubPath(`guest/${item.id}`);
                          onSubTitleChange?.(item.title);
                        }
                      }}
                    >
                      <div className="email-nav__text">
                        <div className="email-nav__label">{item.title}</div>
                        <div className="email-nav__desc">{item.desc}</div>
                      </div>
                      <EditorIcon name="chevron_right" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────

  if (!editing && view === "main") {
    return (
      <div className="email-root">
        {/* ── Container 1: Avsändaradress ── */}
        <div style={cardStyle}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
            Avsändaradress
          </h4>
          <p className="admin-desc" style={{ marginBottom: 12 }}>
            E-post till gäster skickas från denna adress. Ändra genom att skriva in en ny och verifiera den.
          </p>

          {senderLoaded ? (
            <div>
              {/* Input with inline action */}
              <div className="email-sender__wrap">
                <input
                  type="email"
                  className={[
                    "email-sender__input",
                    showSenderError ? "email-sender__input--error" : "",
                    (showSendBtn || showPendingBadge || sendBtnExiting) ? "email-sender__input--has-action" : "",
                  ].filter(Boolean).join(" ")}
                  value={senderEmail}
                  onChange={(e) => handleSenderEmailChange(e.target.value)}
                  onBlur={() => setSenderTouched(true)}
                  onKeyDown={(e) => e.key === "Enter" && senderIsValid && senderHasChanged && handleInitiateVerification()}
                  spellCheck={false}
                  autoComplete="off"
                />

                {/* Inline: Send button — slides in when valid + changed */}
                <div className={`email-sender__inline ${(showSendBtn || sendBtnExiting) ? "email-sender__inline--visible" : "email-sender__inline--hidden"}`}>
                  <button
                    className="email-sender__send-btn"
                    disabled={isInitiating || sendBtnExiting}
                    onClick={handleInitiateVerification}
                  >
                    <ButtonSpinner visible={isInitiating || sendBtnExiting} />
                    {!isInitiating && !sendBtnExiting && "Verifiera"}
                  </button>
                </div>

                {/* Inline: Pending badge — shows when input matches pending email */}
                <div className={`email-sender__inline ${showPendingBadge ? "email-sender__inline--visible" : "email-sender__inline--hidden"}`}>
                  <span className="email-sender__pending-badge">Ej verifierad</span>
                </div>
              </div>

              {/* Error — slides down */}
              <div className={`email-sender__slide ${showSenderError ? "email-sender__slide--visible" : "email-sender__slide--hidden"}`}>
                <div className="email-sender__error">
                  <EditorIcon name="report" size={16} style={{ flexShrink: 0 }} />
                  <span>Ange en giltig e-postadress</span>
                </div>
              </div>

              {/* Pending info — slides down when pending email is showing */}
              <div className={`email-sender__slide ${isPendingEmail ? "email-sender__slide--visible" : "email-sender__slide--hidden"}`}>
                <p className="email-sender__pending-info">
                  Bekräfta att du har åtkomst till den här e-postadressen.{" "}
                  <a onClick={handleResendVerification}>Skicka om verifiering</a>
                </p>
              </div>

            </div>
          ) : (
            <div className="skel skel--text" style={{ width: "100%", height: 42, borderRadius: 10 }} />
          )}
        </div>

        {/* ── Container 2: E-postmallar ── */}
        <div style={cardStyle}>
          <div className="email-nav">
            <button
              className="email-nav__item"
            onClick={() => { setSubPath("guest"); onSubTitleChange?.("Gästaviseringar"); }}
          >
            <EditorIcon name="person" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
            <div className="email-nav__text">
              <div className="email-nav__label">Gästaviseringar</div>
              <div className="email-nav__desc">Meddela gäster om boknings- och kontohändelser</div>
            </div>
            <EditorIcon name="chevron_right" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: "auto" }} />
          </button>
          <div className="email-nav__divider" />
          <button
            className="email-nav__item"
            onClick={() => {/* TODO: open staff notifications */}}
          >
            <EditorIcon name="group" size={20} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
            <div className="email-nav__text">
              <div className="email-nav__label">Personalaviseringar</div>
              <div className="email-nav__desc">Meddela personal om nya bokningshändelser</div>
            </div>
            <EditorIcon name="chevron_right" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0, marginLeft: "auto" }} />
            </button>
          </div>
        </div>

        {/* Toast — fixed bottom center, outside both containers */}
        <div className={`email-sender__toast ${showSentToast ? "email-sender__toast--visible" : "email-sender__toast--hidden"}`}>
          <div className="email-sender__toast-inner">
            Verifieringsmeddelande skickat.
          </div>
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────

  if (!editing) return null;
  const variables = editing.variables;

  return (
    <div>
      <button
        onClick={closeEditor}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          border: "none", background: "none", cursor: "pointer",
          fontSize: 13, color: "var(--admin-text-secondary)", padding: 0, marginBottom: 16,
        }}
      >
        <EditorIcon name="arrow_back" size={16} />
        Alla mallar
      </button>

      <div className="email-editor">
        <div className="email-editor__fields">
          {/* Subject */}
          <div className="email-field">
            <label className="email-field__label">Ämnesrad</label>
            <input ref={subjectRef} type="text" className="email-field__input" value={subject}
              onChange={(e) => setSubject(e.target.value)} placeholder={editing.defaults.subject} />
            <span className="email-field__hint">Lämna tomt för att använda standardtexten.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, subjectRef, subject, setSubject)}>{`{{${v}}}`}</button>
              ))}
            </div>
          </div>

          {/* Preview text */}
          <div className="email-field">
            <label className="email-field__label">Förhandsgranskningstext</label>
            <input ref={previewTextRef} type="text" className="email-field__input" value={previewText}
              onChange={(e) => setPreviewText(e.target.value)} placeholder={editing.defaults.previewText} />
            <span className="email-field__hint">Visas som en kortfattad text under ämnesraden i inkorgen.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, previewTextRef, previewText, setPreviewText)}>{`{{${v}}}`}</button>
              ))}
            </div>
          </div>

          {/* HTML body */}
          <div className="email-field">
            <label className="email-field__label">E-postinnehåll (HTML)</label>
            <textarea ref={htmlRef} className="email-field__textarea" value={html}
              onChange={(e) => handleHtmlChange(e.target.value)} placeholder="(Använder standardmall)" />
            <span className="email-field__hint">Ange giltig HTML. Lämna tomt för att använda standardmallen.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, htmlRef, html, setHtml)}>{`{{${v}}}`}</button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="email-actions">
            <button className="settings-btn--connect" disabled={isSaving || !hasChanges} onClick={handleSave}>
              <ButtonSpinner visible={isSaving} /> Spara ändringar
            </button>
            <button className="settings-btn--test" disabled={isSending} onClick={handleSendTest}>
              <ButtonSpinner visible={isSending} /> Skicka testmail
            </button>
            <div className="email-actions__spacer" />
            {editing.hasOverride && (
              <button className="settings-btn--outline" disabled={isResetting}
                onClick={() => setShowResetConfirm(true)} style={{ fontSize: 13 }}>
                Återställ standardmall
              </button>
            )}
          </div>

          {toast && (
            <div className={`email-toast ${toast.type === "success" ? "email-toast--success" : "email-toast--error"}`}>
              {toast.message}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="email-editor__preview">
          <div className="email-preview__label">Förhandsgranskning</div>
          <iframe className="email-preview__frame" srcDoc={previewHtml}
            title="E-postförhandsgranskning" sandbox="allow-same-origin" />
        </div>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowResetConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div style={{ position: "relative", zIndex: 1, background: "var(--admin-surface)", borderRadius: 16, width: 400,
            animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Återställ till standard?</h3>
              <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5 }}>
                Dina anpassningar för denna mall kommer att tas bort.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 20px", borderTop: "1px solid var(--admin-border)" }}>
              <button className="settings-btn--outline" style={{ border: "none" }} onClick={() => setShowResetConfirm(false)}>Avbryt</button>
              <button className="settings-btn--danger-solid" disabled={isResetting} onClick={handleReset}>
                <ButtonSpinner visible={isResetting} /> Återställ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
