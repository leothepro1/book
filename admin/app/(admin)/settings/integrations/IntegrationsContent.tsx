"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getIntegrationStatus,
  getCredentialsForEdit,
  testNewConnection,
  connectIntegration,
  disconnectIntegration,
  testExistingConnection,
  getSyncHistory,
} from "./actions";
import type { IntegrationStatusResponse, SyncHistoryItem } from "./actions";
import { PROVIDER_FORMS, PROVIDER_DISPLAY } from "./forms";
import type { FormFieldDefinition } from "./forms";
import { getMewsDemoCredentials } from "@/app/_lib/integrations/adapters/mews/demo-credentials";

const IS_DEV = process.env.NODE_ENV === "development";
const DEMO_MODE_ENABLED = IS_DEV || process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";

const AVAILABLE_PROVIDERS = [
  "mews",
  ...(IS_DEV ? ["fake"] : []),
] as const;

function ProviderLogo({ info, size = 22 }: { info: { logo?: string; icon?: string; name: string }; size?: number }) {
  if (info.logo) {
    return <img src={info.logo} alt={info.name} style={{ width: size, height: size, borderRadius: 10, objectFit: "contain", flexShrink: 0 }} />;
  }
  return <EditorIcon name={info.icon ?? "link"} size={size} style={{ color: "var(--admin-text-secondary)" }} />;
}

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") {
      setMounted(false);
      setAnimState("idle");
    } else if (animState === "enter") {
      setAnimState("idle");
    }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 21 21"
      fill="none"
      style={{ marginTop: 1 }}
      onAnimationEnd={handleAnimationEnd}
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just nu";
  if (mins < 60) return `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days > 1 ? "ar" : ""} sedan`;
}

const EVENT_LABELS: Record<string, string> = {
  "sync.started": "Synk startad",
  "sync.completed": "Synk klar",
  "sync.failed": "Synk misslyckades",
  "booking.created": "Bokning skapad",
  "booking.updated": "Bokning uppdaterad",
  "booking.cancelled": "Bokning avbokad",
  "connection.tested": "Anslutning testad",
  "connection.failed": "Anslutning misslyckades",
};

type UIState = "loading" | "not-connected" | "form" | "connected" | "connected-detail";

type BreadcrumbSegment = { label: string; onClick?: () => void };
type IntegrationsContentProps = {
  onSubTitleChange?: (title: string | BreadcrumbSegment[] | null) => void;
};

export function IntegrationsContent({ onSubTitleChange }: IntegrationsContentProps) {
  const [uiState, setUiState] = useState<UIState>("loading");
  const [integration, setIntegration] = useState<IntegrationStatusResponse>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<{ label: string; text: string } | null>(null);
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isConnected = (uiState === "connected" || uiState === "connected-detail") && !isEditing;

  // Helper: set breadcrumb with clickable parent
  function setBreadcrumb(name: string) {
    onSubTitleChange?.([
      { label: "Integrationer", onClick: () => { setUiState("connected"); setSelectedProvider(null); setIsEditing(false); onSubTitleChange?.(null); } },
      { label: name },
    ]);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    const status = await getIntegrationStatus();
    setIntegration(status);
    setIsEditing(false);
    if (status && status.status !== "disconnected") {
      setUiState("connected");
      setSelectedProvider(status.provider);
      setFormValues(status.maskedCredentials);
      const history = await getSyncHistory();
      setSyncHistory(history);
    } else {
      setUiState("not-connected");
    }
  }

  function selectProvider(provider: string) {
    setSelectedProvider(provider);
    setTestResult(null);
    const form = PROVIDER_FORMS[provider as keyof typeof PROVIDER_FORMS];
    const defaults: Record<string, string> = {};
    form?.fields.forEach((f) => {
      if (f.default !== undefined) {
        defaults[f.key] = String(f.default);
      }
    });
    setFormValues(defaults);
    setShowPickerModal(false);
    setUiState("form");
    const providerInfo = PROVIDER_DISPLAY[provider];
    setBreadcrumb(providerInfo?.name ?? provider);
  }

  // ── Not connected — landing ─────────────────────────────

  function renderNotConnected() {
    return (
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          PMS-integration
        </h3>
        <p className="admin-desc" style={{ marginBottom: 16 }}>
          Koppla in ditt PMS för att synkronisera bokningar automatiskt.
        </p>
        <button
          className="settings-btn--select-pms"
          onClick={() => { setShowPickerModal(true); }}
        >
          Välj PMS
        </button>
      </div>
    );
  }

  // ── Connected overview (single row) ────────────────────

  function renderConnectedOverview() {
    if (!integration) return null;
    const providerInfo = PROVIDER_DISPLAY[integration.provider] ?? {
      name: integration.provider, description: "", icon: "link",
    };

    return (
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          PMS-integration
        </h3>
        <p className="admin-desc" style={{ marginBottom: 16 }}>
          Koppla in ditt PMS för att synkronisera bokningar automatiskt.
        </p>

        <button
          onClick={() => {
            setSelectedProvider(integration.provider);
            setUiState("connected-detail");
            setBreadcrumb(providerInfo.name);
          }}
          className="admin-option-card"
          style={{ padding: "0.5rem", border: "1px solid #F0EFED", borderRadius: 12 }}
        >
          <div className="admin-option-card-left">
            <ProviderLogo info={providerInfo} size={42} />
            <div className="admin-option-card-title">{providerInfo.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              padding: "3px 8px", borderRadius: 10,
              fontSize: 12, fontWeight: 500,
              color: integration.status === "active" ? "#195f3c" : "#C62828",
              background: integration.status === "active" ? "#22c55e33" : "#C6282814",
            }}>
              {integration.status === "active" ? "Ansluten" : "Åtgärd krävs"}
            </span>
            <EditorIcon name="chevron_forward" size={20} style={{ color: "var(--admin-text-tertiary)" }} />
          </div>
        </button>
      </div>
    );
  }

  // ── Picker modal ────────────────────────────────────────

  function renderPickerModal() {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onClick={() => setShowPickerModal(false)}
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
            borderRadius: 16, padding: 0, width: 440,
            boxShadow: "none",
            animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
            padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Välj ert PMS</h3>
            <button
              onClick={() => setShowPickerModal(false)}
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
          <div style={{ display: "grid", gap: 8, padding: 20 }}>
            {AVAILABLE_PROVIDERS.map((provider) => {
              const info = PROVIDER_DISPLAY[provider];
              if (!info) return null;
              return (
                <button
                  key={provider}
                  onClick={() => selectProvider(provider)}
                  className="admin-option-card"
                  style={{ padding: "0.5rem", border: "1px solid #F0EFED", borderRadius: 12 }}
                >
                  <div className="admin-option-card-left">
                    <ProviderLogo info={info} size={42} />
                    <div className="admin-option-card-title">{info.name}</div>
                  </div>
                  <EditorIcon name="chevron_forward" size={20} style={{ color: "var(--admin-text-tertiary)" }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Config form (shared between form + connected states) ─

  function renderConfigForm() {
    if (!selectedProvider) return null;
    const formDef = PROVIDER_FORMS[selectedProvider as keyof typeof PROVIDER_FORMS];
    const providerInfo = PROVIDER_DISPLAY[selectedProvider];
    if (!formDef || !providerInfo) return null;

    const allRequiredFilled = formDef.fields
      .filter((f) => f.required)
      .every((f) => formValues[f.key]?.trim());

    return (
      <div>
        {/* Connected status header */}
        {isConnected && integration && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <ProviderLogo info={providerInfo} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{providerInfo.name}</div>
                <div style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>
                  {providerInfo.description}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {integration.isDemoEnvironment && (
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 8px", borderRadius: 12,
                    fontSize: 12, fontWeight: 500,
                    color: "#1565C0", background: "#E3F2FD",
                  }}>Demo</span>
                )}
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "3px 8px", borderRadius: 10,
                  fontSize: 12, fontWeight: 500,
                  color: integration.status === "active" ? "#195f3c" : integration.status === "error" ? "#C62828" : "#757575",
                  background: integration.status === "active" ? "#22c55e33" : integration.status === "error" ? "#C6282814" : "#75757514",
                }}>
                  {integration.status === "active" ? "Ansluten" : integration.status === "error" ? "Åtgärd krävs" : "Frånkopplad"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Not connected: title + help text */}
        {!isConnected && (
          <>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Koppla in {providerInfo.name}
            </h3>
            <p className="admin-desc" style={{ marginBottom: 20 }}>
              {formDef.helpText}
              {formDef.docsUrl && (
                <>
                  {" "}
                  <a href={formDef.docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                    {formDef.docsLabel ?? "Dokumentation →"}
                  </a>
                </>
              )}
            </p>
          </>
        )}

        {/* Demo fill button — only before connection */}
        {!isConnected && selectedProvider === "mews" && DEMO_MODE_ENABLED && (
          <button
            className="settings-btn--outline"
            style={{ marginBottom: 16 }}
            onClick={() => {
              const demo = getMewsDemoCredentials();
              setFormValues({
                clientToken: demo.clientToken,
                accessToken: demo.accessToken,
                clientName: demo.clientName,
                webhookSecret: demo.webhookSecret,
                enterpriseId: demo.enterpriseId,
                initialSyncDays: String(demo.initialSyncDays),
                useDemoEnvironment: "true",
              });
              setTestResult(null);
            }}
          >
            <EditorIcon name="science" size={16} />
            Använd Mews demo-credentials
          </button>
        )}

        {/* Form fields */}
        <div className="admin-form">
          {formDef.fields.map((field) => renderFormField(field, isConnected))}
        </div>

        {/* Demo info banner */}
        {formValues.useDemoEnvironment === "true" && selectedProvider === "mews" && !isConnected && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 10,
            background: "#E3F2FD", color: "#1565C0",
            fontSize: 13, fontWeight: 500, lineHeight: 1.45,
          }}>
            Du ansluter till Mews demo-miljö (api.mews-demo.com). Ingen riktig hotelldata används.
          </div>
        )}

        {/* Error state — connected only */}
        {isConnected && integration?.status === "error" && integration.lastError && (
          <div style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 10,
            background: "#FBE9E7", color: "#C62828",
            fontSize: 13, fontWeight: 500,
          }}>
            <div style={{ marginBottom: 6 }}>{integration.lastError}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {integration.consecutiveFailures} misslyckade försök i rad
            </div>
            <button
              className="settings-btn--outline"
              style={{ marginTop: 10 }}
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await testExistingConnection();
                  if (result.ok) await loadStatus();
                });
              }}
            >
              <ButtonSpinner visible={isPending} />
              Försök igen
            </button>
          </div>
        )}

        {/* Test result — form only */}
        {!isConnected && testResult && (
          <div style={{
            marginTop: 16, padding: "10px 14px", borderRadius: 10,
            background: testResult.ok ? "#E8F5E9" : "#FBE9E7",
            color: testResult.ok ? "#2E7D32" : "#C62828",
            fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <EditorIcon name={testResult.ok ? "check_circle" : "error"} size={18} />
            {testResult.ok ? "Anslutningen fungerar" : testResult.error}
          </div>
        )}

        {/* Action buttons — form only */}
        {!isConnected && (
          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
            <button
              className="settings-btn--test"
              disabled={!allRequiredFilled || isTesting || isConnecting}
              onClick={async () => {
                setIsTesting(true);
                setTestResult(null);
                try {
                  const result = await testNewConnection(selectedProvider!, formValues);
                  setTestResult(result);
                } catch {
                  setTestResult({ ok: false, error: "Anslutningen misslyckades" });
                } finally {
                  setIsTesting(false);
                }
              }}
            >
              <ButtonSpinner visible={isTesting} />
              Testa anslutning
            </button>
            <button
              className="settings-btn--connect"
              disabled={!testResult?.ok || isConnecting || isTesting}
              onClick={async () => {
                setIsConnecting(true);
                try {
                  const result = await connectIntegration(selectedProvider!, formValues);
                  if (result.ok) {
                    await loadStatus();
                  } else {
                    setTestResult({ ok: false, error: result.error });
                  }
                } finally {
                  setIsConnecting(false);
                }
              }}
            >
              <ButtonSpinner visible={isConnecting} />
              {isEditing ? "Spara" : "Koppla in"}
            </button>
            {isEditing && (
              <button
                className="settings-btn--outline"
                onClick={async () => {
                  setIsEditing(false);
                  setTestResult(null);
                  await loadStatus();
                }}
              >
                Avbryt
              </button>
            )}
          </div>
        )}

        {/* Sync history — connected only */}
        {isConnected && (
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                color: "var(--admin-text-secondary)", fontSize: 13, fontWeight: 600, padding: 0,
              }}
            >
              <EditorIcon name={showHistory ? "expand_less" : "expand_more"} size={18} />
              Synkhistorik
            </button>
            {showHistory && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {syncHistory.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--admin-text-tertiary)" }}>Ingen historik ännu</div>
                ) : (
                  syncHistory.map((event, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                      borderBottom: i < syncHistory.length - 1 ? "1px solid var(--admin-border)" : "none",
                      fontSize: 13,
                    }}>
                      <EditorIcon
                        name={event.eventType.includes("failed") ? "error" : event.eventType.includes("completed") ? "check_circle" : "sync"}
                        size={16}
                        style={{
                          color: event.eventType.includes("failed") ? "var(--admin-danger)" :
                            event.eventType.includes("completed") ? "#2E7D32" : "var(--admin-text-tertiary)",
                        }}
                      />
                      <span style={{ flex: 1, color: "var(--admin-text)" }}>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                      <span style={{ color: "var(--admin-text-tertiary)", fontSize: 12 }}>{relativeTime(event.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions — connected only */}
        {isConnected && (
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--admin-border)" }}>
            {!confirmDisconnect ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  className="settings-btn--outline"
                  onClick={async () => {
                    setIsLoadingEdit(true);
                    const creds = await getCredentialsForEdit();
                    if (creds) {
                      setFormValues(creds);
                    }
                    setIsEditing(true);
                    setIsLoadingEdit(false);
                    setTestResult(null);
                  }}
                >
                  <ButtonSpinner visible={isLoadingEdit} />
                  Redigera
                </button>
                <button
                  className="settings-btn--danger"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Koppla från
                </button>
              </div>
            ) : (
              <div style={{
                padding: "14px 16px", borderRadius: 10,
                border: "1px solid var(--admin-danger)", background: "var(--admin-danger-tint)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "var(--admin-text)" }}>
                  Bokningar påverkas inte. Vill du fortsätta?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="settings-btn--danger-solid"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await disconnectIntegration();
                        if (result.ok) {
                          setConfirmDisconnect(false);
                          setSelectedProvider(null);
                          onSubTitleChange?.(null);
                          await loadStatus();
                        }
                      });
                    }}
                  >
                    <ButtonSpinner visible={isPending} />
                    Ja, koppla från
                  </button>
                  <button
                    className="settings-btn--outline"
                    onClick={() => setConfirmDisconnect(false)}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderFieldLabel(field: FormFieldDefinition) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <label className="admin-label" style={{ marginBottom: 0 }}>{field.label}</label>
        {field.tooltip && (
          <button
            type="button"
            onClick={() => setActiveTooltip({ label: field.label, text: field.tooltip! })}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "none", cursor: "pointer",
              color: "var(--admin-text-tertiary)", padding: 0,
            }}
          >
            <EditorIcon name="help" size={16} />
          </button>
        )}
      </div>
    );
  }

  function handleCopy(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function renderFormField(field: FormFieldDefinition, disabled: boolean) {
    const value = formValues[field.key] ?? "";
    const hasValue = value.length > 0;

    if (field.type === "checkbox") {
      return (
        <div key={field.key} className="admin-field admin-field--toggle">
          <div className="admin-toggle-row">
            <button
              type="button"
              disabled={disabled}
              className={`admin-toggle admin-toggle--sm ${value === "true" ? "admin-toggle-on" : ""}`}
              onClick={() => setFormValues((v) => ({ ...v, [field.key]: v[field.key] === "true" ? "false" : "true" }))}
              style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}}
            >
              <span className="admin-toggle-thumb" />
            </button>
            <label className="admin-label--sm admin-label--inline">{field.label}</label>
          </div>
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key} className="admin-field">
          {renderFieldLabel(field)}
          <select
            value={value || String(field.default ?? "")}
            onChange={(e) => { if (!disabled) setFormValues((v) => ({ ...v, [field.key]: e.target.value })); }}
            disabled={disabled}
            className="admin-input--compact"
            style={{
              width: "100%", padding: "8px 11px",
              border: "1.5px solid var(--admin-border)",
              borderRadius: 8, fontSize: 14,
              background: disabled ? "var(--admin-surface-muted)" : "var(--admin-surface)",
              color: "var(--admin-text)",
              cursor: disabled ? "default" : undefined,
            }}
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    const isPassword = field.type === "password";
    const showPasswordIcons = isPassword && !disabled;
    const isVisible = visibleFields.has(field.key);
    const isCopied = copiedField === field.key;

    return (
      <div key={field.key} className="admin-field">
        {renderFieldLabel(field)}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            type={isPassword && !isVisible && !disabled ? "password" : "text"}
            value={value}
            readOnly={disabled}
            onChange={(e) => { if (!disabled) setFormValues((v) => ({ ...v, [field.key]: e.target.value })); }}
            className="admin-float-input"
            style={{
              padding: showPasswordIcons ? "10px 72px 10px 12px" : "10px 12px",
              background: disabled ? "var(--admin-surface-muted)" : undefined,
              cursor: disabled ? "default" : undefined,
              width: "100%",
            }}
          />
          {showPasswordIcons && (
            <div style={{
              position: "absolute", right: 8, display: "flex", gap: 2,
            }}>
              <button
                type="button"
                onClick={() => setVisibleFields((s) => {
                  const next = new Set(s);
                  if (next.has(field.key)) next.delete(field.key);
                  else next.add(field.key);
                  return next;
                })}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, border: "none", background: "none",
                  borderRadius: 6, cursor: hasValue ? "pointer" : "default",
                  color: hasValue ? "#303030" : "var(--admin-text-tertiary)",
                  opacity: hasValue ? 1 : 0,
                  pointerEvents: hasValue ? "auto" : "none",
                }}
                tabIndex={-1}
              >
                <EditorIcon name={isVisible ? "visibility_off" : "visibility"} size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleCopy(field.key, value)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, border: "none", background: "none",
                  borderRadius: 6, cursor: hasValue ? "pointer" : "default",
                  color: isCopied ? "#2E7D32" : hasValue ? "#303030" : "var(--admin-text-tertiary)",
                  opacity: hasValue ? 1 : 0,
                  pointerEvents: hasValue ? "auto" : "none",
                }}
                tabIndex={-1}
              >
                <EditorIcon name={isCopied ? "check" : "content_copy"} size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────

  if (uiState === "loading") {
    return (
      <>
        {/* PMS skeleton */}
        <div>
          <div className="skel skel--text" style={{ width: 140, height: 16, marginBottom: 8 }} />
          <div className="skel skel--text" style={{ width: 280, height: 13, marginBottom: 16 }} />
          <div className="skel skel--card" style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "0.5rem", borderRadius: 12, height: 58,
          }}>
            <div className="skel skel--circle" style={{ width: 42, height: 42, borderRadius: 10 }} />
            <div className="skel skel--text" style={{ width: 60, height: 14 }} />
            <div style={{ flex: 1 }} />
            <div className="skel skel--text" style={{ width: 64, height: 22, borderRadius: 10 }} />
            <div className="skel skel--text" style={{ width: 20, height: 20, borderRadius: 4 }} />
          </div>
        </div>

        {/* Digitala nycklar skeleton */}
        <div style={{ marginTop: 24 }}>
          <div className="skel skel--text" style={{ width: 130, height: 16, marginBottom: 8 }} />
          <div className="skel skel--text" style={{ width: 320, height: 13, marginBottom: 16 }} />
          <div className="skel skel--card" style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "0.5rem", borderRadius: 12, height: 58,
          }}>
            <div className="skel skel--circle" style={{ width: 42, height: 42, borderRadius: 10 }} />
            <div className="skel skel--text" style={{ width: 80, height: 14 }} />
            <div style={{ flex: 1 }} />
            <div className="skel skel--text" style={{ width: 64, height: 22, borderRadius: 10 }} />
            <div className="skel skel--text" style={{ width: 20, height: 20, borderRadius: 4 }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        {uiState === "not-connected" && renderNotConnected()}
        {uiState === "connected" && renderConnectedOverview()}
        {(uiState === "form" || uiState === "connected-detail") && renderConfigForm()}
      </div>

      {showPickerModal && createPortal(renderPickerModal(), document.body)}
      {activeTooltip && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setActiveTooltip(null)}
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
              borderRadius: 16, padding: 0, width: 440,
              boxShadow: "none",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
              padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
            }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>{activeTooltip.label}</h3>
              <button
                onClick={() => setActiveTooltip(null)}
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
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--admin-text-secondary)", margin: 0 }}>
                {activeTooltip.text}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  className="settings-btn--connect"
                  onClick={() => setActiveTooltip(null)}
                >
                  Uppfattat
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
