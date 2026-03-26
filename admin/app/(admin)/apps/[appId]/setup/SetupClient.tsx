"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  completeStep,
  skipStep,
  finalizeWizard,
  acceptTerms,
  selectPlan,
} from "@/app/_lib/apps/wizard";
import type { WizardState, SetupStep, ConfigField } from "@/app/_lib/apps/types";
import dynamic from "next/dynamic";
import "./setup.css";

// ── Lazy-loaded app-specific wizards ────────────────────────────

const GoogleAdsSetupWizard = dynamic(
  () => import("@/app/(admin)/apps/google-ads/GoogleAdsSetupWizard").then((m) => m.GoogleAdsSetupWizard),
  { loading: () => null },
);

const MetaAdsSetupWizard = dynamic(
  () => import("@/app/(admin)/apps/meta-ads/MetaAdsSetupWizard").then((m) => m.MetaAdsSetupWizard),
  { loading: () => null },
);

const MailchimpSetupWizard = dynamic(
  () => import("@/app/(admin)/apps/mailchimp/MailchimpSetupWizard").then((m) => m.MailchimpSetupWizard),
  { loading: () => null },
);

// ── Props ────────────────────────────────────────────────────────

type Props = {
  state: WizardState;
};

// ── Main Component ───────────────────────────────────────────────

export function SetupClient({ state }: Props) {
  // App-specific wizard overrides — dispatch before any hooks
  if (state.app.wizardComponent === "google-ads") {
    return <GoogleAdsSetupWizard wizardState={state} />;
  }
  if (state.app.wizardComponent === "meta-ads") {
    return <MetaAdsSetupWizard wizardState={state} />;
  }
  if (state.app.wizardComponent === "mailchimp") {
    return <MailchimpSetupWizard wizardState={state} />;
  }
  return <GenericSetupWizard state={state} />;
}

// ── Generic Wizard (no wizardComponent override) ────────────────

function GenericSetupWizard({ state }: Props) {
  const router = useRouter();
  const { app, wizard, currentStep, completedStepIds, totalSteps, currentStepIndex } = state;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Pre-step checks
  const needsTerms = !!app.termsUrl && !wizard.termsAccepted;
  const hasPaidTiers = app.pricing.some((p) => p.pricePerMonth > 0);
  const needsPlan = hasPaidTiers && !wizard.planSelected;

  // Which "phase" are we in?
  const phase: "terms" | "plan" | "step" =
    needsTerms ? "terms" : needsPlan ? "plan" : "step";

  // Use currentStep.id directly as animation key
  const stepKey = phase === "step" ? currentStep.id : phase;

  const clearError = () => setError(null);

  // ── Actions ──────────────────────────────────────────────────

  const handleAcceptTerms = useCallback(() => {
    clearError();
    startTransition(async () => {
      const result = await acceptTerms(app.id);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleSelectPlan = useCallback((tier: string) => {
    clearError();
    startTransition(async () => {
      const result = await selectPlan(app.id, tier);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleCompleteStep = useCallback((stepId: string, data: Record<string, unknown>) => {
    clearError();
    startTransition(async () => {
      const result = await completeStep(app.id, stepId, data);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleSkipStep = useCallback((stepId: string) => {
    clearError();
    startTransition(async () => {
      const result = await skipStep(app.id, stepId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }, [app.id, router]);

  const handleFinalize = useCallback(() => {
    clearError();
    startTransition(async () => {
      const result = await finalizeWizard(app.id);
      if (!result.ok) { setError(result.error); return; }
      router.push(`/apps/${app.id}?installed=1`);
    });
  }, [app.id, router]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="setup-layout">
      {/* Top bar */}
      <div className="setup-topbar">
        <Link href="/apps" className="setup-topbar__back">
          <EditorIcon name="arrow_back" size={18} />
          App Store
        </Link>
        <div className="setup-topbar__app">
          <div className="setup-topbar__icon">
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{app.icon}</span>
          </div>
          <span className="setup-topbar__name">{app.name}</span>
        </div>
      </div>

      {/* Sidebar */}
      <div className="setup-sidebar">
        {/* Pre-requisites */}
        {(app.termsUrl || hasPaidTiers) && (
          <div className="setup-sidebar__section">
            <div className="setup-sidebar__label">Förberedelser</div>
            {app.termsUrl && (
              <div className={`setup-prereq ${wizard.termsAccepted ? "setup-prereq--done" : "setup-prereq--pending"}`}>
                <span className="setup-prereq__icon">
                  <EditorIcon name={wizard.termsAccepted ? "check" : "pending"} size={14} />
                </span>
                Villkor
              </div>
            )}
            {hasPaidTiers && (
              <div className={`setup-prereq ${wizard.planSelected ? "setup-prereq--done" : "setup-prereq--pending"}`}>
                <span className="setup-prereq__icon">
                  <EditorIcon name={wizard.planSelected ? "check" : "pending"} size={14} />
                </span>
                {wizard.planSelected ? `Plan: ${wizard.planSelected}` : "Välj plan"}
              </div>
            )}
          </div>
        )}

        {/* Steps */}
        <div className="setup-sidebar__section">
          <div className="setup-sidebar__label">Steg</div>
          <div className="setup-step-list">
            {app.setupSteps.map((step, idx) => {
              const isCompleted = completedStepIds.includes(step.id);
              const isActive = phase === "step" && step.id === currentStep.id;
              const modifier = isCompleted ? "completed" : isActive ? "active" : "upcoming";

              return (
                <div key={step.id} className={`setup-step-item setup-step-item--${modifier}`}>
                  <span className="setup-step-item__indicator">
                    {isCompleted ? (
                      <EditorIcon name="check" size={14} />
                    ) : (
                      <span style={{ fontSize: "var(--font-xs)", fontWeight: 600 }}>{idx + 1}</span>
                    )}
                  </span>
                  <span className="setup-step-item__label">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="setup-content">
        {error && (
          <div className="setup-error">
            <EditorIcon name="error" size={18} />
            {error}
          </div>
        )}

        <div key={stepKey} className="setup-step-enter" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {phase === "terms" && (
            <TermsPhase app={app} onAccept={handleAcceptTerms} isPending={isPending} />
          )}
          {phase === "plan" && (
            <PlanPhase app={app} selected={wizard.planSelected} onSelect={handleSelectPlan} isPending={isPending} />
          )}
          {phase === "step" && (
            <StepPhase
              step={currentStep}
              state={state}
              stepIndex={currentStepIndex}
              totalSteps={totalSteps}
              onComplete={handleCompleteStep}
              onSkip={handleSkipStep}
              onFinalize={handleFinalize}
              isPending={isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Terms Phase ──────────────────────────────────────────────────

function TermsPhase({ app, onAccept, isPending }: { app: WizardState["app"]; onAccept: () => void; isPending: boolean }) {
  return (
    <>
      <div className="setup-content__header">
        <h2 className="setup-content__title">Villkor</h2>
        <p className="setup-content__desc">
          Genom att installera {app.name} godkänner du{" "}
          <a href={app.termsUrl} target="_blank" rel="noopener" style={{ color: "var(--admin-accent)" }}>
            appens villkor
          </a>.
        </p>
      </div>
      <div className="setup-content__body">
        <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: "var(--line-height-relaxed)" }}>
          {app.name} av {app.developer === "bedfront" ? "Bedfront" : "Partner"} behöver åtkomst till:{" "}
          {app.permissions.join(", ")}.
        </p>
      </div>
      <div className="setup-content__footer">
        <button className="admin-btn admin-btn--accent" onClick={onAccept} disabled={isPending}>
          {isPending ? "Godkänner..." : "Godkänn och fortsätt"}
        </button>
      </div>
    </>
  );
}

// ── Plan Phase ───────────────────────────────────────────────────

function PlanPhase({ app, selected, onSelect, isPending }: { app: WizardState["app"]; selected: string | null; onSelect: (tier: string) => void; isPending: boolean }) {
  return (
    <>
      <div className="setup-content__header">
        <h2 className="setup-content__title">Välj plan</h2>
        <p className="setup-content__desc">Välj den plan som passar din verksamhet.</p>
      </div>
      <div className="setup-content__body">
        <div className="setup-plans">
          {app.pricing.map((p) => (
            <div
              key={p.tier}
              className={`setup-plan-card${selected === p.tier ? " setup-plan-card--selected" : ""}`}
              onClick={() => !isPending && onSelect(p.tier)}
            >
              <div className="setup-plan-card__tier">
                {p.tier === "free" ? "Gratis" : p.tier === "grow" ? "Grow" : "Pro"}
              </div>
              <div className="setup-plan-card__price">
                {p.pricePerMonth === 0 ? "0 kr/mån" : `${Math.round(p.pricePerMonth / 100)} kr/mån`}
              </div>
              <ul className="setup-plan-card__features">
                {p.features.map((f, i) => (
                  <li key={i} className="setup-plan-card__feature">
                    <EditorIcon name="check_circle" size={14} className="setup-plan-card__feature-icon" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Step Phase Router ────────────────────────────────────────────

function StepPhase({
  step, state, stepIndex, totalSteps, onComplete, onSkip, onFinalize, isPending,
}: {
  step: SetupStep;
  state: WizardState;
  stepIndex: number;
  totalSteps: number;
  onComplete: (stepId: string, data: Record<string, unknown>) => void;
  onSkip: (stepId: string) => void;
  onFinalize: () => void;
  isPending: boolean;
}) {
  const isLast = stepIndex === totalSteps;
  const canSkip = !step.required;

  const header = (
    <div className="setup-content__header">
      <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginBottom: "var(--space-2)" }}>
        Steg {stepIndex} av {totalSteps}
      </p>
      <h2 className="setup-content__title">{step.title}</h2>
      <p className="setup-content__desc">{step.description}</p>
    </div>
  );

  switch (step.type) {
    case "oauth":
      return <OAuthStep step={step} header={header} onComplete={onComplete} canSkip={canSkip} onSkip={onSkip} isPending={isPending} />;
    case "api_key":
      return <ApiKeyStep step={step} header={header} onComplete={onComplete} canSkip={canSkip} onSkip={onSkip} isPending={isPending} />;
    case "account_select":
      return <AccountSelectStep step={step} header={header} onComplete={onComplete} canSkip={canSkip} onSkip={onSkip} isPending={isPending} />;
    case "config":
      return <ConfigStep step={step} header={header} onComplete={onComplete} canSkip={canSkip} onSkip={onSkip} isPending={isPending} />;
    case "webhook":
      return <WebhookStep step={step} header={header} onComplete={onComplete} isPending={isPending} />;
    case "review":
      return <ReviewStep state={state} header={header} onFinalize={onFinalize} isPending={isPending} isLast={isLast} />;
    default:
      return null;
  }
}

// ── Step renderer shared props ───────────────────────────────────

type StepProps = {
  step: SetupStep;
  header: React.ReactNode;
  onComplete: (stepId: string, data: Record<string, unknown>) => void;
  canSkip: boolean;
  onSkip: (stepId: string) => void;
  isPending: boolean;
};

// ── OAuth Step ───────────────────────────────────────────────────

function OAuthStep({ step, header, onComplete, canSkip, onSkip, isPending }: StepProps) {
  const [loading, setLoading] = useState(false);
  const connected = false; // OAuth completes via callback redirect — if we're here, not connected yet
  const provider = step.oauthConfig?.provider ?? "provider";

  const handleConnect = () => {
    setLoading(true);
    const authUrlPath = step.oauthConfig?.callbackPath?.replace("/callback", "/auth-url");
    if (!authUrlPath) return;
    fetch(`/api/apps/${step.oauthConfig?.provider === "google" ? "google-ads" : step.oauthConfig?.provider === "meta" ? "meta-ads" : ""}/auth-url`)
      .then((r) => r.json())
      .then((data) => { if (data.url) window.location.href = data.url; })
      .catch(() => setLoading(false));
  };

  const handleContinue = () => {
    onComplete(step.id, { connected: true, provider });
  };

  return (
    <>
      {header}
      <div className="setup-content__body">
        {connected ? (
          <div className="setup-oauth-connected">
            <EditorIcon name="check_circle" size={22} className="setup-oauth-connected__icon" />
            <span className="setup-oauth-connected__text">
              Ansluten till {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </span>
          </div>
        ) : (
          <>
            {step.oauthConfig?.scopes && step.oauthConfig.scopes.length > 0 && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <p className="setup-field__label" style={{ marginBottom: "var(--space-2)" }}>Behörigheter som begärs:</p>
                {step.oauthConfig.scopes.map((scope) => (
                  <div key={scope} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1) 0" }}>
                    <EditorIcon name="lock" size={14} style={{ color: "var(--admin-text-tertiary)" }} />
                    <span style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)" }}>{scope}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="admin-btn admin-btn--accent" onClick={handleConnect} disabled={isPending || loading}>
              {loading ? "Omdirigerar..." : `Anslut ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
            </button>
          </>
        )}
      </div>
      <div className="setup-content__footer">
        {canSkip && (
          <button className="setup-content__skip" onClick={() => onSkip(step.id)} disabled={isPending}>Hoppa över</button>
        )}
        <button className="admin-btn admin-btn--accent" onClick={handleContinue} disabled={!connected || isPending}>
          {isPending ? "Sparar..." : "Nästa"}
        </button>
      </div>
    </>
  );
}

// ── API Key Step ─────────────────────────────────────────────────

function ApiKeyStep({ step, header, onComplete, canSkip, onSkip, isPending }: StepProps) {
  const fields = step.apiKeyConfig?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = "";
    return init;
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const allFilled = fields.every((f) => values[f.key]?.trim());

  const handleSubmit = () => {
    onComplete(step.id, values);
  };

  return (
    <>
      {header}
      <div className="setup-content__body">
        {fields.map((field) => (
          <div key={field.key} className="setup-field">
            <label className="setup-field__label">{field.label}</label>
            {field.secret ? (
              <div className="setup-password-wrap">
                <input
                  type={showSecrets[field.key] ? "text" : "password"}
                  className="admin-input--sm"
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  style={{ width: "100%" }}
                />
                <button
                  type="button"
                  className="setup-password-toggle"
                  onClick={() => setShowSecrets((s) => ({ ...s, [field.key]: !s[field.key] }))}
                >
                  <EditorIcon name={showSecrets[field.key] ? "visibility_off" : "visibility"} size={16} />
                </button>
              </div>
            ) : (
              <input
                type="text"
                className="admin-input--sm"
                placeholder={field.placeholder}
                value={values[field.key]}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                style={{ width: "100%" }}
              />
            )}
            {field.helpUrl && (
              <a href={field.helpUrl} target="_blank" rel="noopener" className="setup-field__help-link">
                Var hittar jag detta? →
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="setup-content__footer">
        {canSkip && (
          <button className="setup-content__skip" onClick={() => onSkip(step.id)} disabled={isPending}>Hoppa över</button>
        )}
        <button className="admin-btn admin-btn--accent" onClick={handleSubmit} disabled={!allFilled || isPending}>
          {isPending ? "Sparar..." : "Nästa"}
        </button>
      </div>
    </>
  );
}

// ── Account Select Step ──────────────────────────────────────────

function AccountSelectStep({ step, header, onComplete, canSkip, onSkip, isPending }: StepProps) {
  const config = step.accountSelectConfig;
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const labelKey = config?.labelKey ?? "name";
  const valueKey = config?.valueKey ?? "id";

  useEffect(() => {
    if (!config?.fetchEndpoint) return;
    let cancelled = false;
    fetch(config.fetchEndpoint)
      .then((r) => {
        if (!r.ok) throw new Error("Kunde inte hämta konton");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setAccounts(Array.isArray(data) ? data : data.accounts ?? data.items ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [config?.fetchEndpoint]);

  const handleSubmit = () => {
    if (!selected) return;
    const account = accounts.find((a) => String(a[valueKey]) === selected);
    onComplete(step.id, {
      selectedValue: selected,
      selectedLabel: account ? String(account[labelKey]) : selected,
    });
  };

  return (
    <>
      {header}
      <div className="setup-content__body">
        {loading ? (
          <div className="setup-webhook-status">
            <div className="setup-spinner" />
            <span className="setup-webhook-status__text">Hämtar konton...</span>
          </div>
        ) : fetchError ? (
          <div className="setup-error">
            <EditorIcon name="error" size={18} />
            {fetchError}
          </div>
        ) : (
          <div className="setup-account-list">
            {accounts.map((account) => {
              const val = String(account[valueKey]);
              const label = String(account[labelKey]);
              const isSelected = selected === val;
              return (
                <div
                  key={val}
                  className={`setup-account-item${isSelected ? " setup-account-item--selected" : ""}`}
                  onClick={() => setSelected(val)}
                >
                  <span className="setup-account-item__check">
                    {isSelected && <EditorIcon name="check" size={12} />}
                  </span>
                  <div>
                    <div className="setup-account-item__label">{label}</div>
                    <div className="setup-account-item__id">{val}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="setup-content__footer">
        {canSkip && (
          <button className="setup-content__skip" onClick={() => onSkip(step.id)} disabled={isPending}>Hoppa över</button>
        )}
        <button className="admin-btn admin-btn--accent" onClick={handleSubmit} disabled={!selected || isPending}>
          {isPending ? "Sparar..." : "Nästa"}
        </button>
      </div>
    </>
  );
}

// ── Config Step ──────────────────────────────────────────────────

function ConfigStep({ step, header, onComplete, canSkip, onSkip, isPending }: StepProps) {
  const fields = step.configFields ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = f.default;
    return init;
  });

  const handleSubmit = () => {
    onComplete(step.id, values);
  };

  return (
    <>
      {header}
      <div className="setup-content__body">
        {fields.map((field) => (
          <ConfigFieldRenderer
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(val) => setValues((v) => ({ ...v, [field.key]: val }))}
          />
        ))}
      </div>
      <div className="setup-content__footer">
        {canSkip && (
          <button className="setup-content__skip" onClick={() => onSkip(step.id)} disabled={isPending}>Hoppa över</button>
        )}
        <button className="admin-btn admin-btn--accent" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Sparar..." : "Nästa"}
        </button>
      </div>
    </>
  );
}

function ConfigFieldRenderer({ field, value, onChange }: { field: ConfigField; value: unknown; onChange: (val: unknown) => void }) {
  switch (field.type) {
    case "toggle": {
      const on = value === true;
      return (
        <div className="setup-toggle-row">
          <div className="setup-toggle-row__info">
            <div className="setup-field__label">{field.label}</div>
            {field.hint && <div className="setup-field__hint">{field.hint}</div>}
          </div>
          <button
            type="button"
            className={`admin-toggle${on ? " admin-toggle-on" : ""}`}
            onClick={() => onChange(!on)}
          >
            <span className="admin-toggle-thumb" />
          </button>
        </div>
      );
    }

    case "select":
      return (
        <div className="setup-field">
          <label className="setup-field__label">{field.label}</label>
          <select
            className="setup-select"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {field.hint && <div className="setup-field__hint">{field.hint}</div>}
        </div>
      );

    case "number":
      return (
        <div className="setup-field">
          <label className="setup-field__label">{field.label}</label>
          <input
            type="number"
            className="admin-input--sm"
            value={value as number ?? 0}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ width: "120px" }}
          />
          {field.hint && <div className="setup-field__hint">{field.hint}</div>}
        </div>
      );

    case "text":
    default:
      return (
        <div className="setup-field">
          <label className="setup-field__label">{field.label}</label>
          <input
            type="text"
            className="admin-input--sm"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: "100%" }}
          />
          {field.hint && <div className="setup-field__hint">{field.hint}</div>}
        </div>
      );
  }
}

// ── Webhook Step ─────────────────────────────────────────────────

function WebhookStep({ step, header, onComplete }: { step: SetupStep; header: React.ReactNode; onComplete: (stepId: string, data: Record<string, unknown>) => void; isPending: boolean }) {
  const [done, setDone] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-complete webhook step on mount
    const timeout = setTimeout(() => {
      onComplete(step.id, { registered: true });
      setDone(true);
    }, 1500);
    return () => clearTimeout(timeout);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {header}
      <div className="setup-content__body">
        <div className="setup-webhook-status">
          {webhookError ? (
            <>
              <EditorIcon name="error" size={32} style={{ color: "var(--admin-danger)" }} />
              <span className="setup-webhook-status__text">{webhookError}</span>
              <button className="admin-btn admin-btn--outline admin-btn--sm" onClick={() => { setWebhookError(null); onComplete(step.id, { registered: true }); }}>
                Försök igen
              </button>
            </>
          ) : done ? (
            <>
              <EditorIcon name="check_circle" size={32} style={{ color: "var(--admin-accent)" }} />
              <span className="setup-webhook-status__text">Webhooks registrerade</span>
            </>
          ) : (
            <>
              <div className="setup-spinner" />
              <span className="setup-webhook-status__text">Konfigurerar webhooks...</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Review Step ──────────────────────────────────────────────────

function ReviewStep({ state, header, onFinalize, isPending }: { state: WizardState; header: React.ReactNode; onFinalize: () => void; isPending: boolean; isLast: boolean }) {
  const { app, wizard } = state;
  const stepData = wizard.stepData as Record<string, Record<string, unknown>>;

  return (
    <>
      {header}
      <div className="setup-content__body">
        <div className="setup-review">
          {app.setupSteps
            .filter((s) => s.type !== "review" && state.completedStepIds.includes(s.id))
            .map((step) => {
              const data = (stepData[step.id] ?? {}) as Record<string, unknown>;
              return (
                <div key={step.id} className="setup-review__section">
                  <div className="setup-review__section-title">{step.title}</div>
                  {Object.entries(data).map(([key, val]) => {
                    // Mask secret fields
                    const isSecret = step.apiKeyConfig?.fields?.some((f) => f.key === key && f.secret);
                    const displayVal = isSecret ? "••••••••••••••••" : formatReviewValue(val);
                    const label = findFieldLabel(step, key) ?? key;
                    return (
                      <div key={key} className="setup-review__row">
                        <span className="setup-review__key">{label}</span>
                        <span className="setup-review__value">{displayVal}</span>
                      </div>
                    );
                  })}
                  {Object.keys(data).length === 0 && (
                    <div className="setup-review__row">
                      <span className="setup-review__key">Standardinställningar</span>
                      <span className="setup-review__value">Inga ändringar</span>
                    </div>
                  )}
                </div>
              );
            })}

          {wizard.planSelected && (
            <div className="setup-review__section">
              <div className="setup-review__section-title">Plan</div>
              <div className="setup-review__row">
                <span className="setup-review__key">Vald plan</span>
                <span className="setup-review__value" style={{ textTransform: "capitalize" }}>{wizard.planSelected}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="setup-content__footer">
        <button className="admin-btn admin-btn--accent" onClick={onFinalize} disabled={isPending || !state.canFinalize}>
          {isPending ? "Aktiverar..." : `Aktivera ${app.name}`}
        </button>
      </div>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatReviewValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "Ja" : "Nej";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val || "—";
  return "—";
}

function findFieldLabel(step: SetupStep, key: string): string | null {
  if (step.configFields) {
    const f = step.configFields.find((cf) => cf.key === key);
    if (f) return f.label;
  }
  if (step.apiKeyConfig?.fields) {
    const f = step.apiKeyConfig.fields.find((af) => af.key === key);
    if (f) return f.label;
  }
  // Known special keys
  if (key === "connected") return "Ansluten";
  if (key === "provider") return "Leverantör";
  if (key === "selectedLabel") return "Valt konto";
  if (key === "selectedValue") return "Konto-ID";
  if (key === "registered") return "Webhooks";
  return null;
}
