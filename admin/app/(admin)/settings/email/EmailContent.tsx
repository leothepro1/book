"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getEmailTemplates,
  getEmailTemplateDetail,
  saveEmailTemplate,
  resetEmailTemplate,
  sendTestEmail,
} from "./actions";
import {
  getEmailDomain,
  addEmailDomain,
  checkDomainVerification,
  removeEmailDomain,
} from "./domain-actions";
import type { EmailTemplateRow, EmailTemplateDetail } from "./actions";
import type { EmailDomainRecord } from "./domain-actions";
import "./email.css";

// ── ButtonSpinner (same pattern as other settings panels) ───────

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

  // Domain state
  const [domainData, setDomainData] = useState<EmailDomainRecord | null>(null);
  const [domainLoaded, setDomainLoaded] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [isRemovingDomain, setIsRemovingDomain] = useState(false);
  const [showRemoveDomainConfirm, setShowRemoveDomainConfirm] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainSuccess, setDomainSuccess] = useState<string | null>(null);

  // Refs for cursor insertion
  const subjectRef = useRef<HTMLInputElement>(null);
  const previewTextRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  // Load template list and domain data
  useEffect(() => {
    getEmailTemplates().then((rows) => {
      setTemplates(rows);
      setLoaded(true);
    });
    getEmailDomain().then((d) => {
      setDomainData(d);
      setDomainLoaded(true);
    });
  }, []);

  // Open editor for a template
  async function openEditor(eventType: string) {
    const detail = await getEmailTemplateDetail(eventType);
    if (!detail) return;

    setEditing(detail);
    onSubTitleChange?.(detail.label);

    const s = detail.override.subject ?? "";
    const p = detail.override.previewText ?? "";
    const h = detail.override.html ?? "";

    setSubject(s);
    setPreviewText(p);
    setHtml(h);
    setOriginalSubject(s);
    setOriginalPreviewText(p);
    setOriginalHtml(h);
    setPreviewHtml(h || detail.defaults.html);
    setToast(null);
  }

  // Close editor → back to list
  function closeEditor() {
    setEditing(null);
    onSubTitleChange?.(null);
    setToast(null);
    // Refresh list
    getEmailTemplates().then(setTemplates);
  }

  // Debounced preview update
  const updatePreview = useCallback(
    (newHtml: string, defaultHtml: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPreviewHtml(newHtml.trim() || defaultHtml);
      }, 500);
    },
    [],
  );

  function handleHtmlChange(value: string) {
    setHtml(value);
    if (editing) {
      updatePreview(value, editing.defaults.html);
    }
  }

  // Detect changes
  const hasChanges =
    subject !== originalSubject ||
    previewText !== originalPreviewText ||
    html !== originalHtml;

  // Insert variable at cursor
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
      // Restore cursor position after the inserted tag
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + tag.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setValue(value + tag);
    }
  }

  // Save handler
  async function handleSave() {
    if (!editing || !hasChanges) return;
    setIsSaving(true);
    setToast(null);

    const data: Record<string, string | null> = {};
    if (subject !== originalSubject) data.subject = subject.trim() || null;
    if (previewText !== originalPreviewText) data.previewText = previewText.trim() || null;
    if (html !== originalHtml) data.html = html.trim() || null;

    const result = await saveEmailTemplate(editing.eventType, data);
    setIsSaving(false);

    if (result.ok) {
      setOriginalSubject(subject);
      setOriginalPreviewText(previewText);
      setOriginalHtml(html);
      setToast({ type: "success", message: "Mallen har sparats" });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte spara" });
    }
  }

  // Reset handler
  async function handleReset() {
    if (!editing) return;
    setIsResetting(true);
    const result = await resetEmailTemplate(editing.eventType);
    setIsResetting(false);
    setShowResetConfirm(false);

    if (result.ok) {
      setSubject("");
      setPreviewText("");
      setHtml("");
      setOriginalSubject("");
      setOriginalPreviewText("");
      setOriginalHtml("");
      setPreviewHtml(editing.defaults.html);
      setEditing({ ...editing, hasOverride: false, override: { subject: null, previewText: null, html: null, updatedAt: null } });
      setToast({ type: "success", message: "Mallen har återställts till standard" });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte återställa" });
    }
  }

  // Send test email
  async function handleSendTest() {
    if (!editing) return;
    setIsSending(true);
    setToast(null);

    const result = await sendTestEmail(editing.eventType);
    setIsSending(false);

    if (result.ok) {
      setToast({ type: "success", message: `Testmail skickat till ${result.to}` });
    } else {
      setToast({ type: "error", message: result.error ?? "Kunde inte skicka testmail" });
    }
  }

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Domain handlers ────────────────────────────────────────────

  async function handleAddDomain() {
    if (!domainInput.trim()) return;
    setIsAddingDomain(true);
    setDomainError(null);
    setDomainSuccess(null);

    const result = await addEmailDomain(domainInput.trim());
    setIsAddingDomain(false);

    if (result.success && result.domain) {
      setDomainData(result.domain);
      setDomainInput("");
      setDomainSuccess("Domänen har lagts till. Konfigurera DNS-posterna nedan.");
    } else {
      setDomainError(result.error ?? "Kunde inte lägga till domänen");
    }
  }

  async function handleCheckDomain() {
    if (!domainData) return;
    setIsCheckingDomain(true);
    setDomainError(null);
    setDomainSuccess(null);

    const result = await checkDomainVerification(domainData.id);
    setIsCheckingDomain(false);

    if (result.error) {
      setDomainError(result.error);
    } else if (result.status === "VERIFIED") {
      setDomainData({ ...domainData, status: "VERIFIED", verifiedAt: result.verifiedAt ?? null });
      setDomainSuccess("Domänen är verifierad! E-post skickas nu från din domän.");
    } else if (result.status === "FAILED") {
      setDomainData({ ...domainData, status: "FAILED" });
      setDomainError("Verifieringen misslyckades. Kontrollera att DNS-posterna är korrekta.");
    } else {
      setDomainData({ ...domainData, status: "PENDING" });
      setDomainSuccess("Verifiering pågår fortfarande. Försök igen om en stund.");
    }
  }

  async function handleRemoveDomain() {
    if (!domainData) return;
    setIsRemovingDomain(true);
    const result = await removeEmailDomain(domainData.id);
    setIsRemovingDomain(false);
    setShowRemoveDomainConfirm(false);

    if (result.ok) {
      setDomainData(null);
      setDomainError(null);
      setDomainSuccess("Domänen har tagits bort.");
    } else {
      setDomainError(result.error ?? "Kunde inte ta bort domänen");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  // Auto-clear domain messages
  useEffect(() => {
    if (!domainSuccess) return;
    const t = setTimeout(() => setDomainSuccess(null), 6000);
    return () => clearTimeout(t);
  }, [domainSuccess]);

  // ── List view ─────────────────────────────────────────────────

  if (!editing) {
    return (
      <div>
        {/* ── Domain section ── */}
        <div className="email-domain">
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
            Avsändardomän
          </h4>

          {!domainLoaded ? (
            <div style={{ marginTop: 10 }}>
              <div className="skel skel--text" style={{ width: 280, height: 14 }} />
              <div className="skel skel--text" style={{ width: 200, height: 36, marginTop: 8 }} />
            </div>
          ) : !domainData ? (
            /* State A — No domain */
            <>
              <p className="admin-desc" style={{ marginBottom: 10 }}>
                Konfigurera en avsändardomän för att skicka e-post från din egen adress (t.ex. noreply@ditthotell.se).
                Utan en verifierad domän skickas e-post från vår standardadress.
              </p>
              <div className="email-domain__add">
                <input
                  type="text"
                  className="email-domain__add-input"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="t.ex. ditthotell.se"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                />
                <button
                  className="settings-btn--connect"
                  disabled={isAddingDomain || !domainInput.trim()}
                  onClick={handleAddDomain}
                >
                  <ButtonSpinner visible={isAddingDomain} />
                  Lägg till
                </button>
              </div>
            </>
          ) : domainData.status === "VERIFIED" ? (
            /* State C — Verified */
            <>
              <div className="email-domain__card">
                <div className="email-domain__header">
                  <EditorIcon name="verified" size={18} style={{ color: "#1a7f37" }} />
                  <span className="email-domain__name">{domainData.domain}</span>
                  <span className="email-list__badge email-list__badge--custom" style={{ background: "#E6F4EA", color: "#1a7f37" }}>
                    Verifierad
                  </span>
                </div>
                <div className="email-domain__body">
                  <div className="email-domain__verified">
                    <EditorIcon name="mail" size={16} />
                    <span>E-post skickas från: <strong>noreply@{domainData.domain}</strong></span>
                  </div>
                  <div className="email-domain__actions">
                    <button
                      className="settings-btn--outline"
                      style={{ fontSize: 13 }}
                      onClick={() => setShowRemoveDomainConfirm(true)}
                    >
                      Ta bort domän
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* State B — Pending / Failed */
            <>
              <div className="email-domain__card">
                <div className="email-domain__header">
                  <EditorIcon
                    name={domainData.status === "FAILED" ? "error" : "schedule"}
                    size={18}
                    style={{ color: domainData.status === "FAILED" ? "#C62828" : "var(--admin-text-secondary)" }}
                  />
                  <span className="email-domain__name">{domainData.domain}</span>
                  <span className={`email-list__badge ${domainData.status === "FAILED" ? "email-toast--error" : "email-list__badge--default"}`}
                    style={domainData.status === "FAILED" ? { background: "#FDECEA", color: "#C62828" } : {}}>
                    {domainData.status === "FAILED" ? "Misslyckad" : "Väntar på verifiering"}
                  </span>
                </div>
                <div className="email-domain__body">
                  {domainData.dnsRecords.length > 0 && (
                    <>
                      <p className="admin-desc" style={{ marginBottom: 10 }}>
                        Lägg till dessa DNS-poster hos din domänleverantör. Det kan ta upp till 48 timmar. Klicka Kontrollera när du är klar.
                      </p>
                      <table className="email-dns">
                        <thead>
                          <tr>
                            <th>Typ</th>
                            <th>Namn</th>
                            <th>Värde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domainData.dnsRecords.map((r, i) => (
                            <tr key={i}>
                              <td>{r.type}</td>
                              <td>
                                <div className="email-dns__value">
                                  <span className="email-dns__text">{r.name}</span>
                                  <button className="email-dns__copy" title="Kopiera" onClick={() => copyToClipboard(r.name)}>
                                    <EditorIcon name="content_copy" size={14} />
                                  </button>
                                </div>
                              </td>
                              <td>
                                <div className="email-dns__value">
                                  <span className="email-dns__text">{r.value}</span>
                                  <button className="email-dns__copy" title="Kopiera" onClick={() => copyToClipboard(r.value)}>
                                    <EditorIcon name="content_copy" size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  <div className="email-domain__actions">
                    <button
                      className="settings-btn--connect"
                      disabled={isCheckingDomain}
                      onClick={handleCheckDomain}
                    >
                      <ButtonSpinner visible={isCheckingDomain} />
                      Kontrollera verifiering
                    </button>
                    <button
                      className="settings-btn--outline"
                      style={{ fontSize: 13 }}
                      onClick={() => setShowRemoveDomainConfirm(true)}
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Domain feedback messages */}
          {domainError && (
            <div className="email-toast email-toast--error" style={{ marginTop: 8 }}>{domainError}</div>
          )}
          {domainSuccess && (
            <div className="email-toast email-toast--success" style={{ marginTop: 8 }}>{domainSuccess}</div>
          )}
        </div>

        {/* ── Remove domain confirmation modal ── */}
        {showRemoveDomainConfirm && createPortal(
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setShowRemoveDomainConfirm(false)}
          >
            <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
            <div
              style={{ position: "relative", zIndex: 1, background: "var(--admin-surface)", borderRadius: 16, width: 400, animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Ta bort domän?</h3>
                <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5 }}>
                  Om du tar bort domänen skickas e-post från standardadressen igen.
                </p>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 20px", borderTop: "1px solid var(--admin-border)" }}>
                <button className="settings-btn--outline" style={{ border: "none" }} onClick={() => setShowRemoveDomainConfirm(false)}>Avbryt</button>
                <button className="settings-btn--danger-solid" disabled={isRemovingDomain} onClick={handleRemoveDomain}>
                  <ButtonSpinner visible={isRemovingDomain} />
                  Ta bort
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
          E-postmallar
        </h4>
        <p className="admin-desc" style={{ marginBottom: 16 }}>
          Anpassa innehållet i automatiska e-postutskick till gäster. Lämna fält tomma för att använda standardmallarna.
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
    );
  }

  // ── Editor view ───────────────────────────────────────────────

  const variables = editing.variables;

  return (
    <div>
      {/* Back button */}
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
        {/* ── Left: fields ── */}
        <div className="email-editor__fields">
          {/* Subject */}
          <div className="email-field">
            <label className="email-field__label">Ämnesrad</label>
            <input
              ref={subjectRef}
              type="text"
              className="email-field__input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={editing.defaults.subject}
            />
            <span className="email-field__hint">Lämna tomt för att använda standardtexten.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, subjectRef, subject, setSubject)}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview text */}
          <div className="email-field">
            <label className="email-field__label">Förhandsgranskningstext</label>
            <input
              ref={previewTextRef}
              type="text"
              className="email-field__input"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder={editing.defaults.previewText}
            />
            <span className="email-field__hint">Visas som en kortfattad text under ämnesraden i inkorgen.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, previewTextRef, previewText, setPreviewText)}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* HTML body */}
          <div className="email-field">
            <label className="email-field__label">E-postinnehåll (HTML)</label>
            <textarea
              ref={htmlRef}
              className="email-field__textarea"
              value={html}
              onChange={(e) => handleHtmlChange(e.target.value)}
              placeholder="(Använder standardmall)"
            />
            <span className="email-field__hint">Ange giltig HTML. Lämna tomt för att använda standardmallen.</span>
            <div className="email-vars">
              {variables.map((v) => (
                <button key={v} className="email-vars__chip" type="button"
                  onClick={() => insertVariable(v, htmlRef, html, setHtml)}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="email-actions">
            <button
              className="settings-btn--connect"
              disabled={isSaving || !hasChanges}
              onClick={handleSave}
            >
              <ButtonSpinner visible={isSaving} />
              Spara ändringar
            </button>

            <button
              className="settings-btn--test"
              disabled={isSending}
              onClick={handleSendTest}
            >
              <ButtonSpinner visible={isSending} />
              Skicka testmail
            </button>

            <div className="email-actions__spacer" />

            {editing.hasOverride && (
              <button
                className="settings-btn--outline"
                disabled={isResetting}
                onClick={() => setShowResetConfirm(true)}
                style={{ fontSize: 13 }}
              >
                Återställ standardmall
              </button>
            )}
          </div>

          {/* Toast */}
          {toast && (
            <div className={`email-toast ${toast.type === "success" ? "email-toast--success" : "email-toast--error"}`}>
              {toast.message}
            </div>
          )}
        </div>

        {/* ── Right: preview ── */}
        <div className="email-editor__preview">
          <div className="email-preview__label">Förhandsgranskning</div>
          <iframe
            className="email-preview__frame"
            srcDoc={previewHtml}
            title="E-postförhandsgranskning"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowResetConfirm(false)}
        >
          <div style={{
            position: "absolute", inset: 0,
            background: "var(--admin-overlay)",
            animation: "settings-modal-fade-in 0.15s ease",
          }} />
          <div
            style={{
              position: "relative", zIndex: 1,
              background: "var(--admin-surface)",
              borderRadius: 16, width: 400,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Återställ till standard?
              </h3>
              <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5 }}>
                Dina anpassningar för denna mall kommer att tas bort. Standardmallen används igen.
              </p>
            </div>
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 20px 20px", borderTop: "1px solid var(--admin-border)",
            }}>
              <button
                className="settings-btn--outline"
                style={{ border: "none" }}
                onClick={() => setShowResetConfirm(false)}
              >
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={isResetting}
                onClick={handleReset}
              >
                <ButtonSpinner visible={isResetting} />
                Återställ
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
