"use client";

import { useState, useEffect, useRef } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getEmailTemplates,
  getEmailTemplateDetail,
  saveEmailTemplate,
  resetEmailTemplate,
  sendTestEmail,
  getTenantSenderInfo,
} from "./actions";
import type { EmailTemplateRow, EmailTemplateDetail, TenantSenderInfo } from "./actions";
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
};

// ── Main component ──────────────────────────────────────────────

export function EmailContent({ onSubTitleChange }: EmailContentProps) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateDetail | null>(null);

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

  // Sender info
  const [senderInfo, setSenderInfo] = useState<TenantSenderInfo | null>(null);
  const [senderLoaded, setSenderLoaded] = useState(false);
  const [newEmailFrom, setNewEmailFrom] = useState("");
  const [isInitiating, setIsInitiating] = useState(false);
  const [senderToast, setSenderToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load data
  useEffect(() => {
    getEmailTemplates().then((rows) => { setTemplates(rows); setLoaded(true); });
    getTenantSenderInfo().then((info) => { setSenderInfo(info); setSenderLoaded(true); });
  }, []);

  // Auto-clear toasts
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!senderToast) return; const t = setTimeout(() => setSenderToast(null), 5000); return () => clearTimeout(t); }, [senderToast]);

  // ── Sender handler ──────────────────────────────────────────────

  async function handleInitiateVerification() {
    if (!newEmailFrom.trim()) return;
    setIsInitiating(true);
    setSenderToast(null);
    try {
      const res = await fetch("/api/email-sender/verify/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailFrom: newEmailFrom.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        setNewEmailFrom("");
        setSenderToast({ type: "success", message: `Verifieringslänk skickad till ${newEmailFrom.trim()}` });
        const info = await getTenantSenderInfo();
        setSenderInfo(info);
      } else {
        setSenderToast({ type: "error", message: data.error ?? "Kunde inte skicka verifieringslänk" });
      }
    } catch {
      setSenderToast({ type: "error", message: "Något gick fel" });
    }
    setIsInitiating(false);
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
    onSubTitleChange?.(null);
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

  const portalSlug = senderInfo?.portalSlug ?? null;

  // ── List view ─────────────────────────────────────────────────

  if (!editing) {
    return (
      <div>
        {/* ── Container 1: Avsändaradress ── */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
            Avsändaradress
          </h4>
          <p className="admin-desc" style={{ marginBottom: 12 }}>
            E-post till gäster skickas från denna adress. Verifiera en ny adress för att ändra.
          </p>

          {senderLoaded && senderInfo && (
            <>
              {/* Current active address */}
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--admin-surface-secondary, #f7f7f7)", borderRadius: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "var(--admin-text)", margin: 0, fontFamily: "monospace" }}>
                  {senderInfo.emailFrom ?? (portalSlug ? `noreply@${portalSlug}.bedfront.com` : "noreply@bedfront.com")}
                </p>
              </div>

              {/* Pending verification banner */}
              {senderInfo.pendingEmailFrom && (
                <div style={{
                  padding: "12px 14px", marginBottom: 12, borderRadius: 8,
                  background: "#FFF8E1", border: "1px solid #FFE082",
                }}>
                  <p style={{ fontSize: 14, color: "#7B6100", margin: 0, lineHeight: 1.5 }}>
                    Väntar på verifiering — bekräftelsemejl skickat till{" "}
                    <strong>{senderInfo.emailVerificationSentTo}</strong>.
                  </p>
                </div>
              )}

              {/* Change address form */}
              {!senderInfo.pendingEmailFrom && (
                <div className="email-domain__add">
                  <input
                    type="email"
                    className="email-domain__add-input"
                    value={newEmailFrom}
                    onChange={(e) => setNewEmailFrom(e.target.value)}
                    placeholder="t.ex. noreply@ditthotell.se"
                    onKeyDown={(e) => e.key === "Enter" && handleInitiateVerification()}
                  />
                  <button
                    className="settings-btn--connect"
                    disabled={isInitiating || !newEmailFrom.trim()}
                    onClick={handleInitiateVerification}
                  >
                    <ButtonSpinner visible={isInitiating} />
                    Skicka verifieringslänk
                  </button>
                </div>
              )}

              {senderToast && (
                <div className={`email-toast ${senderToast.type === "success" ? "email-toast--success" : "email-toast--error"}`} style={{ marginTop: 8 }}>
                  {senderToast.message}
                </div>
              )}
            </>
          )}

          {!senderLoaded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="skel skel--text" style={{ width: 280, height: 14 }} />
              <div className="skel skel--text" style={{ width: 200, height: 36 }} />
            </div>
          )}
        </div>

        {/* ── Container 2: E-postmallar ── */}
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
            E-postmallar
          </h4>
          <p className="admin-desc" style={{ marginBottom: 16 }}>
            Anpassa innehållet i automatiska e-postutskick till gäster.
          </p>

          {!loaded ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--admin-border)", borderRadius: 10, overflow: "hidden" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, borderTop: i > 0 ? "1px solid var(--admin-border)" : "none" }}>
                  <div className="skel" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="skel skel--text" style={{ width: 140, height: 14 }} />
                    <div className="skel skel--text" style={{ width: 200, height: 10 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="email-list">
              {templates.map((tpl) => (
                <button
                  key={tpl.eventType}
                  className="email-list__row"
                  onClick={() => openEditor(tpl.eventType)}
                >
                  <EditorIcon name="mail" size={18} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
                  <div className="email-list__info">
                    <div className="email-list__label">{tpl.label}</div>
                    <div className="email-list__desc">{tpl.description}</div>
                  </div>
                  <span className={`email-list__badge ${tpl.hasOverride ? "email-list__badge--custom" : "email-list__badge--default"}`}>
                    {tpl.hasOverride ? "Anpassad" : "Standard"}
                  </span>
                  <EditorIcon name="chevron_right" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────

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
