"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  renderEmailPreviewWithBranding,
  getEmailSettings,
  toggleEmailEvent,
} from "./actions";
import type { EmailTemplateRow, EmailTemplateDetail, TenantSenderInfo, TenantEmailBranding } from "./actions";
import {
  EmailBrandingProvider,
  useEmailBranding,
  EmailPreviewFrame,
  EmailPublishBar,
  type BrandingSnapshot,
} from "@/app/(admin)/_components/EmailPreview";
import { ColorPickerPopup } from "@/app/(admin)/_components/ColorPicker";
import dynamic from "next/dynamic";
const HtmlEditor = dynamic(() => import("./_components/HtmlEditor"), { ssr: false });
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar";
import { createPortal } from "react-dom";
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

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_LOGO_WIDTH = 120;
const VALID_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Normalize shorthand/8-char hex to standard 6-char (#F00 → #FF0000, #FF0000FF → #FF0000). */
function normalizeHex(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
    return hex.slice(0, 7);
  }
  return hex;
}

import { EMAIL_EVENT_REGISTRY, type EmailCategory } from "@/app/_lib/email/registry";

const CATEGORY_ORDER: { key: EmailCategory; label: string }[] = [
  { key: "bokningar", label: "Bokningar" },
  { key: "vistelse", label: "Vistelse" },
  { key: "ordrar", label: "Ordrar" },
  { key: "konto", label: "Konto" },
  { key: "support", label: "Support" },
  { key: "presentkort", label: "Presentkort" },
];

const GUEST_NOTIFICATION_CATEGORIES = CATEGORY_ORDER.map((cat) => ({
  label: cat.label,
  items: EMAIL_EVENT_REGISTRY
    .filter((e) => e.category === cat.key)
    .map((e) => ({ id: e.type, title: e.label, desc: e.description, canDisable: e.canDisable })),
})).filter((cat) => cat.items.length > 0);

const ALL_TEMPLATE_IDS = GUEST_NOTIFICATION_CATEGORIES.flatMap((c) => c.items);

// ── EmailCustomizeView — uses EmailBrandingContext ──────────────

type EmailCustomizeViewProps = {
  cardStyle: React.CSSProperties;
  currentTemplate: { id: string; title: string } | undefined;
  customizePreviewIdx: number;
  customizePreviewHtml: string;
  libraryOpen: boolean;
  setLibraryOpen: (v: boolean) => void;
  setCustomizePreviewIdx: (v: number) => void;
  setCustomizePreviewHtml: (v: string) => void;
  handleMediaSelect: (asset: MediaLibraryResult) => void;
  mediaSelectCallbackRef: React.MutableRefObject<((url: string) => void) | null>;
};

function EmailCustomizeView({
  cardStyle,
  currentTemplate,
  customizePreviewIdx,
  customizePreviewHtml,
  libraryOpen,
  setLibraryOpen,
  setCustomizePreviewIdx,
  setCustomizePreviewHtml,
  handleMediaSelect,
  mediaSelectCallbackRef,
}: EmailCustomizeViewProps) {
  const { branding, pushUndo, updateBranding } = useEmailBranding();

  // Hex input derives from branding.accentColor but allows free-text editing.
  // When branding changes externally (undo/redo), we reset the input.
  const [hexInput, setHexInput] = useState(branding.accentColor);
  const [hexSyncKey, setHexSyncKey] = useState(branding.accentColor);
  if (branding.accentColor !== hexSyncKey) {
    setHexSyncKey(branding.accentColor);
    setHexInput(branding.accentColor);
  }

  // Color picker popup state
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLDivElement>(null);

  // ── Interaction-batched undo ──────────────────────────────────
  // Push undo on the FIRST actual value change per interaction, not on
  // focus/pointerdown (which would create phantom entries if the user
  // focuses then blurs without changing anything). Reset on blur/pointerup.
  const undoPushedRef = useRef(false);

  /** Push undo exactly once per interaction. Call inside onChange. */
  const pushUndoOnce = useCallback(() => {
    if (!undoPushedRef.current) {
      pushUndo();
      undoPushedRef.current = true;
    }
  }, [pushUndo]);

  /** Mark end of a continuous interaction. */
  const commitInteraction = useCallback(() => {
    undoPushedRef.current = false;
  }, []);

  // Register media select callback so parent MediaLibrary can update branding
  useEffect(() => {
    mediaSelectCallbackRef.current = (url: string) => {
      pushUndo();
      updateBranding("logoUrl", url);
    };
    return () => { mediaSelectCallbackRef.current = null; };
  }, [pushUndo, updateBranding, mediaSelectCallbackRef]);


  // Carousel navigation with current branding
  async function navigateCarousel(direction: -1 | 1) {
    const newIdx = customizePreviewIdx + direction;
    if (newIdx < 0 || newIdx >= ALL_TEMPLATE_IDS.length) return;
    setCustomizePreviewIdx(newIdx);
    const id = ALL_TEMPLATE_IDS[newIdx].id;
    const html = await renderEmailPreviewWithBranding(id, branding);
    if (html) setCustomizePreviewHtml(html);
  }

  return (
    <div className="email-root">
      {/* Container 1: Logotyp */}
      <div style={cardStyle}>
        <h4 className="email-customize__title">Logotyp</h4>
        {branding.logoUrl ? (
          <div className="img-upload">
            <div className="img-upload-result">
              <div className="img-upload-result-thumb">
                <img src={branding.logoUrl} alt="" className="img-upload-result-img" />
              </div>
              <div className="img-upload-result-meta">
                <span className="img-upload-result-filename">
                  {branding.logoUrl.split("/").pop() || "logotyp"}
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
                onClick={() => { pushUndo(); updateBranding("logoUrl", null); }}
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
              <span className="img-upload-btn">Ladda upp logotyp</span>
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
                  el.setPointerCapture(e.pointerId);
                  pushUndoOnce();
                  const rect = el.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  updateBranding("logoWidth", Math.round(24 + ratio * (400 - 24)));
                };
                const onMove = (e: PointerEvent) => {
                  if (!el.hasPointerCapture(e.pointerId)) return;
                  const rect = el.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  updateBranding("logoWidth", Math.round(24 + ratio * (400 - 24)));
                };
                const onUp = () => { commitInteraction(); };
                el.onpointerdown = onDown;
                el.onpointermove = onMove;
                el.onpointerup = onUp;
              }}
            >
              <div className="sf-range__fill" style={{ width: `${((branding.logoWidth - 24) / (400 - 24)) * 100}%` }} />
              <div className="sf-range__thumb" style={{ left: `${((branding.logoWidth - 24) / (400 - 24)) * 100}%` }} />
            </div>
            <div className="sf-range-input-wrap">
              <input
                type="number"
                className="sf-range-input"
                value={branding.logoWidth}
                min={24}
                max={400}
                step={1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isNaN(v)) {
                    pushUndoOnce();
                    updateBranding("logoWidth", Math.min(400, Math.max(24, v)));
                  }
                }}
                onBlur={commitInteraction}
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
          <div
            ref={swatchRef}
            className="sf-color-swatch"
            style={{ background: VALID_HEX.test(branding.accentColor) ? branding.accentColor : "#1A56DB" }}
            onClick={() => setPickerOpen(!pickerOpen)}
          />
          <input
            type="text"
            className="sf-input sf-input--color-hex"
            value={hexInput}
            onChange={(e) => {
              setHexInput(e.target.value);
              if (VALID_HEX.test(e.target.value)) {
                pushUndoOnce();
                const normalized = normalizeHex(e.target.value);
                updateBranding("accentColor", normalized);
                setHexInput(normalized);
              }
            }}
            onBlur={() => {
              commitInteraction();
              if (!VALID_HEX.test(hexInput)) setHexInput(branding.accentColor);
            }}
            maxLength={9}
          />
        </div>
        {pickerOpen && createPortal(
          <ColorPickerPopup
            value={VALID_HEX.test(branding.accentColor) ? branding.accentColor : "#1A56DB"}
            onChange={(hex) => {
              pushUndoOnce();
              updateBranding("accentColor", hex);
              setHexInput(hex.toUpperCase());
            }}
            onClose={() => {
              setPickerOpen(false);
              commitInteraction();
            }}
            anchorRef={swatchRef}
          />,
          document.body,
        )}
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
                onClick={() => navigateCarousel(-1)}
                aria-label="Föregående mall"
              >
                <EditorIcon name="chevron_left" size={20} />
              </button>
              <button
                className="files-pagination__btn"
                disabled={customizePreviewIdx >= ALL_TEMPLATE_IDS.length - 1}
                onClick={() => navigateCarousel(1)}
                aria-label="Nästa mall"
              >
                <EditorIcon name="chevron_right" size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className="email-preview-card">
          <div className="email-preview-card__body">
            <EmailPreviewFrame
              html={customizePreviewHtml}
              branding={branding}
            />
          </div>
        </div>
      </div>

      {/* Publish bar — fixed toast (positioned by publish-bar.css) */}
      <EmailPublishBar />

      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onConfirm={handleMediaSelect}
        currentValue={branding.logoUrl || undefined}
        uploadFolder="email"
        accept="image"
        title="Välj logotyp"
      />
    </div>
  );
}

// ── Guest Notifications View (extracted for state isolation) ─────

function GuestNotificationsView({
  cardStyle,
  goToTemplatePreview,
  setPreviewing,
}: {
  cardStyle: React.CSSProperties;
  goToTemplatePreview: (item: { id: string; title: string }) => void;
  setPreviewing: (d: EmailTemplateDetail) => void;
}) {
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getEmailSettings().then((s) => { setSettings(s); setLoaded(true); });
  }, []);

  const handleToggle = async (eventType: string, current: boolean) => {
    // Optimistic
    setSettings((prev) => ({ ...prev, [eventType]: !current }));
    const result = await toggleEmailEvent(eventType, !current);
    if (!result.success) {
      // Revert
      setSettings((prev) => ({ ...prev, [eventType]: current }));
    }
  };

  if (!loaded) return null;

  return (
    <div className="email-root">
      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {GUEST_NOTIFICATION_CATEGORIES.map((cat) => (
            <div key={cat.label} className="email-cat">
              <div className="email-cat__header">{cat.label}</div>
              {cat.items.map((item, ii) => {
                const enabled = settings[item.id] ?? true;
                return (
                  <div key={item.id}>
                    {ii > 0 && <div className="email-nav__divider" />}
                    <div className="email-cat__item" style={{ cursor: "default" }}>
                      <button
                        className="email-nav__text"
                        style={{ flex: 1, border: "none", background: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                        onClick={async () => {
                          const detail = await getEmailTemplateDetail(item.id);
                          if (detail) {
                            setPreviewing(detail);
                            goToTemplatePreview(item);
                          }
                        }}
                      >
                        <div className="email-nav__label" style={{ opacity: enabled ? 1 : 0.5 }}>{item.title}</div>
                        <div className="email-nav__desc">{item.desc}</div>
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {item.canDisable ? (
                          <button
                            className={`admin-toggle ${enabled ? "admin-toggle-on" : ""}`}
                            onClick={() => handleToggle(item.id, enabled)}
                            aria-label={enabled ? "Inaktivera" : "Aktivera"}
                          >
                            <span className="admin-toggle-thumb" />
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--admin-text-tertiary)", whiteSpace: "nowrap" }}>Alltid på</span>
                        )}
                        <button
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--admin-text-tertiary)", flexShrink: 0 }}
                          onClick={async () => {
                            const detail = await getEmailTemplateDetail(item.id);
                            if (detail) {
                              setPreviewing(detail);
                              goToTemplatePreview(item);
                            }
                          }}
                        >
                          <EditorIcon name="chevron_right" size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Props ───────────────────────────────────────────────────────

type BreadcrumbSegment = { label: string; onClick?: () => void };
type EmailContentProps = {
  onSubTitleChange?: (title: string | BreadcrumbSegment[] | null) => void;
  onHeaderExtraChange?: (node: React.ReactNode) => void;
};

// ── Main component ──────────────────────────────────────────────

type EmailView = "main" | "guest-notifications" | "template-preview" | "template-editor" | "customize-templates";

export function EmailContent({ onSubTitleChange, onHeaderExtraChange }: EmailContentProps) {
  const { subPath, setSubPath } = useSettings();
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateDetail | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplateDetail | null>(null);

  // Derive view from subPath
  const view: EmailView = subPath === "customize" ? "customize-templates"
    : subPath?.endsWith("/edit") ? "template-editor"
    : subPath?.startsWith("guest/") ? "template-preview"
    : subPath === "guest" ? "guest-notifications"
    : "main";

  // ── Breadcrumb helpers ──────────────────────────────────────────
  const goToGuest = useCallback(() => {
    setSubPath("guest");
    onSubTitleChange?.([{ label: "Gästaviseringar" }]);
  }, [setSubPath, onSubTitleChange]);

  const goToTemplatePreview = useCallback(async (item: { id: string; title: string }) => {
    setSubPath(`guest/${item.id}`);
    onSubTitleChange?.([
      { label: "Gästaviseringar", onClick: goToGuest },
      { label: item.title },
    ]);
    // Reload preview data when navigating back from editor
    const detail = await getEmailTemplateDetail(item.id);
    if (detail) setPreviewing(detail);
  }, [setSubPath, onSubTitleChange, goToGuest]);

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
  const [testToastEmail, setTestToastEmail] = useState("");

  // Editor branding (read-only, for preview iframe)
  const [editorBranding, setEditorBranding] = useState<BrandingSnapshot | null>(null);
  const [showEditorPreview, setShowEditorPreview] = useState(false);
  const [editorLinger, setEditorLinger] = useState(false);

  // Customize-templates state
  const [initialBranding, setInitialBranding] = useState<BrandingSnapshot | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customizePreviewIdx, setCustomizePreviewIdx] = useState(0);
  const [customizePreviewHtml, setCustomizePreviewHtml] = useState("");

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
        const display = info.pendingEmailFrom ?? info.emailFrom ?? info.defaultEmailFrom;
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
      onSubTitleChange?.([{ label: "Gästaviseringar" }]);
    } else if (subPath === "customize") {
      openCustomize();
    } else if (subPath.endsWith("/edit")) {
      const eventType = subPath.split("/")[1];
      openEditor(eventType);
    } else if (subPath.startsWith("guest/")) {
      const eventType = subPath.split("/")[1];
      const cat = GUEST_NOTIFICATION_CATEGORIES.flatMap((c) => c.items).find((i) => i.id === eventType);
      if (cat) {
        onSubTitleChange?.([
          { label: "Gästaviseringar", onClick: goToGuest },
          { label: cat.title },
        ]);
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

  // ── Sender handler ──────────────────────────────────────────────

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const currentAddress = senderInfo?.emailFrom ?? senderInfo?.defaultEmailFrom ?? "";
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
    if (view === "template-editor" && editing) {
      onHeaderExtraChange?.(
        <button
          className="settings-btn--muted"
          style={{ marginLeft: "auto", fontSize: 13, padding: "5px 12px" }}
          onClick={() => setShowEditorPreview(true)}
        >
          Förhandsgranska
        </button>
      );
    } else if (view === "template-preview" && previewing) {
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
  }, [view, previewing, editing]);

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
    onSubTitleChange?.([
      { label: "Gästaviseringar", onClick: goToGuest },
      { label: "Anpassa e-postmallar" },
    ]);

    // Load branding
    const b = await getTenantEmailBranding();
    const snapshot: BrandingSnapshot = {
      logoUrl: b?.logoUrl ?? null,
      logoWidth: b?.logoWidth ?? DEFAULT_LOGO_WIDTH,
      accentColor: b?.accentColor ?? "#1A56DB",
    };
    setInitialBranding(snapshot);

    // Load first template HTML with branding applied
    const firstId = ALL_TEMPLATE_IDS[0]?.id;
    if (firstId) {
      setCustomizePreviewIdx(0);
      const html = await renderEmailPreviewWithBranding(firstId, snapshot);
      if (html) setCustomizePreviewHtml(html);
    }
  }

  const handleMediaSelect = useCallback((asset: MediaLibraryResult) => {
    setLibraryOpen(false);
    // The actual branding update happens in EmailCustomizeView via context
    mediaSelectCallbackRef.current?.(asset.url);
  }, []);

  const mediaSelectCallbackRef = useRef<((url: string) => void) | null>(null);

  // ── Template editor handlers ────────────────────────────────────

  async function openEditor(eventType: string) {
    const [detail, b] = await Promise.all([
      getEmailTemplateDetail(eventType),
      getTenantEmailBranding(),
    ]);
    if (!detail) return;
    setEditing(detail);
    setSubPath(`guest/${eventType}/edit`);
    const branding: BrandingSnapshot = {
      logoUrl: b?.logoUrl ?? null,
      logoWidth: b?.logoWidth ?? 120,
      accentColor: b?.accentColor ?? "#1A56DB",
    };
    setEditorBranding(branding);
    onSubTitleChange?.([
      { label: "Gästaviseringar", onClick: goToGuest },
      { label: detail.label, onClick: () => goToTemplatePreview({ id: detail.eventType, title: detail.label }) },
      { label: `Redigera ${detail.label}` },
    ]);
    const s = detail.override.subject ?? "";
    const p = detail.override.previewText ?? "";
    const h = detail.override.html ?? "";
    setSubject(s); setPreviewText(p); setHtml(h);
    setOriginalSubject(s); setOriginalPreviewText(p); setOriginalHtml(h);
    setPreviewHtml(h || detail.defaults.html);
    setToast(null);
  }

  function closeEditor() {
    const prevEditing = editing;
    setEditing(null);
    if (prevEditing) {
      // Navigate back to template preview
      goToTemplatePreview({ id: prevEditing.eventType, title: prevEditing.label });
    } else {
      setSubPath("guest");
      onSubTitleChange?.([{ label: "Gästaviseringar" }]);
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
      setEditorLinger(true);
      setTimeout(() => setEditorLinger(false), 1500);
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

  if (view === "customize-templates" && initialBranding) {
    const currentTemplate = ALL_TEMPLATE_IDS[customizePreviewIdx];

    return (
      <EmailBrandingProvider initialBranding={initialBranding}>
        <EmailCustomizeView
          cardStyle={cardStyle}
          currentTemplate={currentTemplate}
          customizePreviewIdx={customizePreviewIdx}
          customizePreviewHtml={customizePreviewHtml}
          libraryOpen={libraryOpen}
          setLibraryOpen={setLibraryOpen}
          setCustomizePreviewIdx={setCustomizePreviewIdx}
          setCustomizePreviewHtml={setCustomizePreviewHtml}
          handleMediaSelect={handleMediaSelect}
          mediaSelectCallbackRef={mediaSelectCallbackRef}
        />
      </EmailBrandingProvider>
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

  if (view === "guest-notifications") {
    return <GuestNotificationsView
      cardStyle={cardStyle}
      goToTemplatePreview={goToTemplatePreview}
      setPreviewing={setPreviewing}
    />;
  }

  // ── List view ─────────────────────────────────────────────────

  if (view === "main") {
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
            onClick={goToGuest}
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
  const isEmailVerified = !!senderInfo?.emailFrom;

  if (view !== "template-editor" || !editing) return null;

  const resolvedEditorSubject = editing.resolved.subject
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const vars: Record<string, string> = { hotelName: "Grand Hotel Stockholm", guestName: "Anna Lindgren" };
      return vars[key] ?? `{{${key}}}`;
    });

  return (
    <div className="email-root">
      {/* Verification banner */}
      {!isEmailVerified && (
        <div style={{
          padding: 16,
          borderRadius: "0.75rem",
          background: "#fff",
          boxShadow: "rgba(0, 0, 0, 0.08) 0px 0.5rem 0.625rem -0.3125rem, rgba(0, 0, 0, 0.03) 0px 0.3125rem 0.3125rem -0.15625rem, rgba(0, 0, 0, 0.02) 0px 0.1875rem 0.1875rem -0.09375rem, rgba(0, 0, 0, 0.02) 0px 0.125rem 0.125rem -0.0625rem, rgba(0, 0, 0, 0.03) 0px 0.0625rem 0.0625rem -0.03125rem, rgba(0, 0, 0, 0.04) 0px 0.03125rem 0.03125rem 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 0.0625rem",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "#FFB800",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <EditorIcon name="info" size={17} style={{ color: "#303030" }} />
          </div>
          <p style={{ fontSize: 13, color: "var(--admin-text)", margin: 0, lineHeight: 1.4 }}>
            Innan du kan redigera aviseringar måste du{" "}
            <button
              style={{ display: "inline", fontSize: 13, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "var(--admin-text)", fontWeight: 500 }}
              onClick={() => { setSubPath(""); onSubTitleChange?.(null); }}
            >
              granska och verifiera
            </button>
            {" "}din avsändar e-postadress.
          </p>
        </div>
      )}

      {/* Container 1: Merge Tags */}
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
        <div>
          <h4 className="email-customize__title">Merge Tags</h4>
          <p className="admin-desc" style={{ marginBottom: 16 }}>
            Du kan använda Merge Tags för att anpassa dina mallar.{" "}
            <a href="#" className="admin-desc-link" style={{ display: "inline", fontSize: 13, textDecoration: "underline" }}>
              Mer information om Merge Tags
            </a>
          </p>
        </div>
        <div style={{ marginTop: "auto", background: "#fafafa", marginLeft: -16, marginRight: -16, marginBottom: -16, padding: "8px 16px 16px", borderRadius: "0 0 0.75rem 0.75rem" }}>
          <p className="admin-desc" style={{ margin: 0 }}>
            Du kan anpassa utseende och känsla för alla e-postaviseringar från sidan{" "}
            <button
              className="admin-desc-link"
              style={{ display: "inline", fontSize: 13, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => openCustomize()}
            >
              Anpassa e-postmallar
            </button>
            .
          </p>
        </div>
      </div>

      {/* Container 2: E-postämne + HTML-redigerare */}
      <div style={cardStyle}>
        <div style={{ marginBottom: 20 }}>
          <label className="admin-label">E-postämne</label>
          <input
            type="text"
            className="email-sender__input"
            value={subject || editing.defaults.subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label className="admin-label" style={{ marginBottom: 0 }}>E-postmeddelande (HTML)</label>
            {isEmailVerified && (
              <button
                className="settings-btn--muted"
                style={{ fontSize: 13, padding: "4px 10px" }}
                onClick={async () => {
                  const raw = html || editing.defaults.html;
                  try {
                    const prettier = await import("prettier/standalone");
                    const htmlPlugin = await import("prettier/plugins/html");
                    const formatted = await prettier.format(raw, {
                      parser: "html",
                      plugins: [htmlPlugin],
                      printWidth: 120,
                      tabWidth: 2,
                    });
                    handleHtmlChange(formatted);
                  } catch {
                    // Silently fail — code stays as-is
                  }
                }}
              >
                Formatera
              </button>
            )}
          </div>
          {isEmailVerified ? (
            <div style={{ marginTop: 7 }}>
              <HtmlEditor
                value={html || editing.defaults.html}
                onChange={handleHtmlChange}
                height="500px"
              />
            </div>
          ) : (
            <div style={{ marginTop: 7, position: "relative", overflow: "hidden", height: 200, pointerEvents: "none" }}>
              <HtmlEditor
                value={html || editing.defaults.html}
                onChange={() => {}}
                height="200px"
                readOnly
              />
              <div style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,1) 100%)",
                pointerEvents: "none",
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Publish bar */}
      <PublishBarUI
        hasUnsavedChanges={hasChanges}
        isPublishing={isSaving}
        isDiscarding={false}
        isLingeringAfterPublish={editorLinger}
        onPublish={handleSave}
        onDiscard={() => {
          setSubject(originalSubject);
          setPreviewText(originalPreviewText);
          setHtml(originalHtml);
          setPreviewHtml(originalHtml.trim() || editing.defaults.html);
        }}
      />

      {/* Preview modal */}
      {showEditorPreview && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowEditorPreview(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, width: 600, maxHeight: "85vh", display: "flex", flexDirection: "column",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid var(--admin-border)` }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Förhandsgranska</h3>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <div className="email-preview-card" style={{ border: "none", borderRadius: 0 }}>
                <div className="email-preview-card__subject">
                  <span className="email-preview-card__subject-label">Ämne:</span> {resolvedEditorSubject}
                </div>
                <div className="email-preview-card__body">
                  {editorBranding && (
                    <EmailPreviewFrame
                      html={previewHtml}
                      branding={editorBranding}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 20px", borderTop: `1px solid var(--admin-border)` }}>
              <button
                className="settings-btn--outline"
                style={{ fontSize: 13 }}
                onClick={() => setShowEditorPreview(false)}
              >
                Stäng
              </button>
              <button
                className="settings-btn--connect"
                style={{ fontSize: 13, padding: "5px 16px", minWidth: 100 }}
                disabled={isSendingTest}
                onClick={async () => {
                  if (!editing) return;
                  setIsSendingTest(true);
                  const result = await sendTestEmail(editing.eventType);
                  setIsSendingTest(false);
                  if (result.ok) {
                    setShowEditorPreview(false);
                    setTestToastEmail(result.to ?? "");
                    setShowTestToast(true);
                  }
                }}
              >
                <ButtonSpinner visible={isSendingTest} />
                {!isSendingTest && "Skicka test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test toast */}
      <div className={`email-sender__toast ${showTestToast ? "email-sender__toast--visible" : "email-sender__toast--hidden"}`}>
        <div className="email-sender__toast-inner">
          Testmeddelande skickat till {testToastEmail}
        </div>
      </div>
    </div>
  );
}
