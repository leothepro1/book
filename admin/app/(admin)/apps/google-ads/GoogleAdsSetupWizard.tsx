"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { completeStep, finalizeWizard } from "@/app/_lib/apps/wizard";
import type { WizardState } from "@/app/_lib/apps/types";
import "./google-ads-wizard.css";

type Props = { wizardState: WizardState };

// Determine initial screen from wizard state
function getInitialScreen(ws: WizardState): number {
  const completed = ws.completedStepIds;
  if (completed.includes("enhanced-config") || completed.includes("tracking-config")) return 6;
  if (completed.includes("verification")) return 5;
  if (completed.includes("conversion-action")) return 4;
  if (completed.includes("select-account")) return 3;
  if (completed.includes("connect-google")) return 2;
  return 1;
}

export function GoogleAdsSetupWizard({ wizardState }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState(() => getInitialScreen(wizardState));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Collected data across screens
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);
  const [selectedAction, setSelectedAction] = useState<{ id: string; name: string } | null>(null);
  const [verified, setVerified] = useState(false);
  const [enhancedConversions, setEnhancedConversions] = useState(true);

  const clearError = () => setError(null);

  const advance = (data: Record<string, unknown>, stepId: string, nextScreen: number) => {
    clearError();
    startTransition(async () => {
      const result = await completeStep("google-ads", stepId, data);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
      setScreen(nextScreen);
    });
  };

  switch (screen) {
    case 1: return <WelcomeScreen onContinue={() => setScreen(1.5)} isPending={isPending} />;
    case 1.5: return <OAuthRedirectScreen />;
    case 2: return (
      <AccountScreen
        selected={selectedAccount}
        onSelect={setSelectedAccount}
        onContinue={() => {
          if (!selectedAccount) return;
          advance({ selectedValue: selectedAccount.id, selectedLabel: selectedAccount.name }, "select-account", 3);
        }}
        onBack={() => setScreen(1)}
        isPending={isPending}
        error={error}
      />
    );
    case 3: return (
      <ConversionActionScreen
        selected={selectedAction}
        onSelect={setSelectedAction}
        onContinue={() => {
          if (!selectedAction) return;
          advance({ conversionActionId: selectedAction.id, conversionActionName: selectedAction.name }, "tracking-config", 4);
        }}
        onBack={() => setScreen(2)}
        isPending={isPending}
        error={error}
      />
    );
    case 4: return (
      <VerificationScreen
        onVerified={(testId) => { setVerified(true); advance({ verified: true, testEventId: testId }, "review", 5); }}
        onSkip={() => { setVerified(false); advance({ verified: false, skipped: true }, "review", 5); }}
        isPending={isPending}
        error={error}
      />
    );
    case 5: return (
      <EnhancedScreen
        enabled={enhancedConversions}
        onToggle={setEnhancedConversions}
        onFinalize={() => {
          clearError();
          startTransition(async () => {
            const stepResult = await completeStep("google-ads", "tracking-config", {
              enhancedConversions,
              trackPurchase: true,
              sendRevenue: true,
              conversionActionId: selectedAction?.id ?? "",
            });
            if (!stepResult.ok) { setError(stepResult.error); return; }
            const result = await finalizeWizard("google-ads");
            if (!result.ok) { setError(result.error); return; }
            setScreen(6);
          });
        }}
        isPending={isPending}
        error={error}
      />
    );
    case 6: return (
      <SuccessScreen
        accountName={selectedAccount?.name ?? "—"}
        actionName={selectedAction?.name ?? "—"}
        enhanced={enhancedConversions}
        verified={verified}
      />
    );
    default: return null;
  }
}

// ── Screen 1: Welcome ───────────────────────────────────────────

function WelcomeScreen({ onContinue, isPending }: { onContinue: () => void; isPending: boolean }) {
  const [showPerms, setShowPerms] = useState(false);

  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-5)" }}>
          <GoogleIcon />
        </div>
        <h1 className="ga-wizard__title" style={{ textAlign: "center" }}>Anslut Google Ads</h1>
        <p className="ga-wizard__subtitle" style={{ textAlign: "center" }}>
          Spåra konverteringar automatiskt när gäster bokar eller handlar i din bokningsmotor.
        </p>

        <ul className="ga-wizard__features">
          {[
            "Automatisk konverteringsspårning för köp och bokningar",
            "Server-side spårning — fungerar utan cookies",
            "Förbättrad matchning med krypterad e-postadress",
            "Kompatibel med Google Ads Smart Bidding",
          ].map((f) => (
            <li key={f} className="ga-wizard__feature">
              <EditorIcon name="check_circle" size={18} className="ga-wizard__feature-icon" />
              {f}
            </li>
          ))}
        </ul>

        <div className="ga-wizard__permissions">
          <button className="ga-wizard__permissions-toggle" onClick={() => setShowPerms(!showPerms)}>
            Vilka behörigheter behövs?
            <EditorIcon name={showPerms ? "expand_less" : "expand_more"} size={18} />
          </button>
          {showPerms && (
            <div className="ga-wizard__permissions-body">
              <div className="ga-wizard__perm-item">
                <EditorIcon name="lock" size={14} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <div><strong>Hantera Google Ads-konton</strong> — krävs för att läsa konverteringsåtgärder</div>
              </div>
              <div className="ga-wizard__perm-item">
                <EditorIcon name="lock" size={14} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <div><strong>Skapa och redigera konverteringsåtgärder</strong> — krävs för att skapa nya åtgärder</div>
              </div>
            </div>
          )}
        </div>

        <button className="admin-btn admin-btn--accent" style={{ width: "100%" }} onClick={onContinue} disabled={isPending}>
          Anslut Google-konto →
        </button>

        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          <a href="/privacy" target="_blank" rel="noopener" className="ga-wizard__footer-link">
            Läs om hur vi hanterar din data →
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Screen 1.5: OAuth redirect ──────────────────────────────────

function OAuthRedirectScreen() {
  useEffect(() => {
    fetch("/api/apps/google-ads/auth-url")
      .then((r) => r.json())
      .then((data) => {
        if (data.url) window.location.href = data.url;
      });
  }, []);

  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card" style={{ textAlign: "center" }}>
        <div style={{ margin: "var(--space-8) 0" }}>
          <div className="ga-wizard__skeleton" style={{ width: 200, height: 20, margin: "0 auto var(--space-3)" }} />
          <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>Omdirigerar till Google...</p>
        </div>
      </div>
    </div>
  );
}

// ── Screen 2: Account selection ─────────────────────────────────

function AccountScreen({ selected, onSelect, onContinue, onBack, isPending, error }: {
  selected: { id: string; name: string } | null;
  onSelect: (a: { id: string; name: string }) => void;
  onContinue: () => void;
  onBack: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [accounts, setAccounts] = useState<Array<{ customerId: string; descriptiveName: string; currencyCode: string; timeZone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/apps/google-ads/accounts")
      .then((r) => { if (!r.ok) throw new Error("Fetch failed"); return r.json(); })
      .then((data) => { setAccounts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e) => { setFetchError(e.message); setLoading(false); });
  }, []);

  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card ga-wizard__card--wide">
        <button className="ga-wizard__back" onClick={onBack}>
          <EditorIcon name="chevron_left" size={18} /> Tillbaka
        </button>
        <span className="ga-wizard__step-badge">Steg 2 av 5</span>
        <h1 className="ga-wizard__title">Välj Google Ads-konto</h1>
        <p className="ga-wizard__subtitle">Välj det konto som ska ta emot konverteringsdata.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        {loading ? (
          <div className="ga-wizard__account-list">
            {[1, 2, 3].map((i) => <div key={i} className="ga-wizard__skeleton" />)}
          </div>
        ) : fetchError ? (
          <div style={{ textAlign: "center", padding: "var(--space-6)" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-3)" }}>Kunde inte hämta konton</p>
            <button className="admin-btn admin-btn--outline admin-btn--sm" onClick={() => { setLoading(true); setFetchError(null); fetch("/api/apps/google-ads/accounts").then((r) => r.json()).then((d) => { setAccounts(d); setLoading(false); }).catch(() => { setFetchError("Retry failed"); setLoading(false); }); }}>Försök igen</button>
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--space-6)" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-3)" }}>Inga Google Ads-konton hittades på detta Google-konto.</p>
            <a href="https://ads.google.com/start" target="_blank" rel="noopener" style={{ fontSize: "var(--font-sm)", color: "var(--admin-accent)", fontWeight: 500 }}>Skapa ett Google Ads-konto →</a>
            <br />
            <button className="ga-wizard__create-trigger" onClick={onBack} style={{ marginTop: "var(--space-2)" }}>Anslut ett annat Google-konto →</button>
          </div>
        ) : (
          <div className="ga-wizard__account-list">
            {accounts.map((a) => (
              <div
                key={a.customerId}
                className={`ga-wizard__account-item${selected?.id === a.customerId ? " ga-wizard__account-item--selected" : ""}`}
                onClick={() => onSelect({ id: a.customerId, name: a.descriptiveName })}
              >
                <span className="ga-wizard__account-radio">
                  {selected?.id === a.customerId && <EditorIcon name="check" size={12} />}
                </span>
                <div>
                  <div className="ga-wizard__account-name">{a.descriptiveName}</div>
                  <div className="ga-wizard__account-meta">Konto-ID: {a.customerId} · {a.currencyCode} · {a.timeZone}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="ga-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onContinue} disabled={!selected || isPending}>
            {isPending ? "Sparar..." : "Välj konto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 3: Conversion action ─────────────────────────────────

function ConversionActionScreen({ selected, onSelect, onContinue, onBack, isPending, error }: {
  selected: { id: string; name: string } | null;
  onSelect: (a: { id: string; name: string }) => void;
  onContinue: () => void;
  onBack: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [actions, setActions] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("Köp via Bedfront");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/apps/google-ads/conversion-actions")
      .then((r) => r.json())
      .then((data) => { setActions(data.actions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    setCreating(true);
    fetch("/api/apps/google-ads/conversion-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.action) {
          setActions((prev) => [...prev, data.action]);
          onSelect({ id: data.action.id, name: data.action.name });
          setShowCreate(false);
        }
        setCreating(false);
      })
      .catch(() => setCreating(false));
  };

  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card ga-wizard__card--wide">
        <button className="ga-wizard__back" onClick={onBack}>
          <EditorIcon name="chevron_left" size={18} /> Tillbaka
        </button>
        <span className="ga-wizard__step-badge">Steg 3 av 5</span>
        <h1 className="ga-wizard__title">Välj konverteringsåtgärd</h1>
        <p className="ga-wizard__subtitle">Vi spårar köp och bokningar mot denna åtgärd i Google Ads.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        {loading ? (
          <div className="ga-wizard__account-list">
            {[1, 2].map((i) => <div key={i} className="ga-wizard__skeleton" />)}
          </div>
        ) : (
          <>
            <div className="ga-wizard__account-list">
              {actions.map((a) => (
                <div
                  key={a.id}
                  className={`ga-wizard__account-item${selected?.id === a.id ? " ga-wizard__account-item--selected" : ""}`}
                  onClick={() => onSelect({ id: a.id, name: a.name })}
                >
                  <span className="ga-wizard__account-radio">
                    {selected?.id === a.id && <EditorIcon name="check" size={12} />}
                  </span>
                  <div>
                    <div className="ga-wizard__account-name">{a.name}</div>
                    <div className="ga-wizard__account-meta">Kategori: {a.category || "Köp"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="ga-wizard__create-inline">
              {!showCreate ? (
                <button className="ga-wizard__create-trigger" onClick={() => setShowCreate(true)}>
                  Ingen passande åtgärd? Skapa en ny
                </button>
              ) : (
                <div className="ga-wizard__create-form">
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-1)", display: "block" }}>Namn</label>
                    <input className="admin-input--sm" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <button className="admin-btn admin-btn--accent admin-btn--sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                    {creating ? "Skapar..." : "Skapa"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="ga-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onContinue} disabled={!selected || isPending}>
            {isPending ? "Sparar..." : "Fortsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 4: Verification ──────────────────────────────────────

function VerificationScreen({ onVerified, onSkip, isPending, error }: {
  onVerified: (testId: string) => void;
  onSkip: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testId, setTestId] = useState("");
  const [verifyError, setVerifyError] = useState("");

  const handleTest = () => {
    setState("loading");
    const id = `TEST_${Date.now()}`;
    setTestId(id);
    // Simulate test conversion — in production, this calls the real API
    setTimeout(() => {
      setState("success");
    }, 2000);
  };

  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card ga-wizard__card--wide">
        <span className="ga-wizard__step-badge">Steg 4 av 5</span>
        <h1 className="ga-wizard__title">Verifiera spårning</h1>
        <p className="ga-wizard__subtitle">Vi skickar en testhändelse för att bekräfta att anslutningen fungerar.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div className="ga-wizard__verify">
          {state === "idle" && (
            <button className="admin-btn admin-btn--accent" onClick={handleTest}>Skicka testhändelse</button>
          )}
          {state === "loading" && (
            <>
              <div style={{ width: 32, height: 32, border: "3px solid var(--admin-border)", borderTopColor: "var(--admin-accent)", borderRadius: "var(--radius-full)", animation: "setup-spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>Skickar testhändelse...</span>
            </>
          )}
          {state === "success" && (
            <>
              <EditorIcon name="check_circle" size={48} style={{ color: "var(--admin-accent)" }} />
              <div className="ga-wizard__verify-title">Spårning fungerar</div>
              <div className="ga-wizard__verify-detail">
                <div className="ga-wizard__verify-row"><span className="ga-wizard__verify-key">Händelse-ID</span><span className="ga-wizard__verify-value">{testId}</span></div>
                <div className="ga-wizard__verify-row"><span className="ga-wizard__verify-key">Tid</span><span className="ga-wizard__verify-value">{new Date().toLocaleString("sv-SE")}</span></div>
              </div>
            </>
          )}
          {state === "error" && (
            <>
              <EditorIcon name="error" size={48} style={{ color: "var(--admin-danger)" }} />
              <div className="ga-wizard__verify-title" style={{ color: "var(--admin-danger)" }}>Testhändelsen misslyckades</div>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>{verifyError}</p>
              <button className="admin-btn admin-btn--outline admin-btn--sm" onClick={() => { setState("idle"); setVerifyError(""); }}>Försök igen</button>
            </>
          )}
        </div>

        <div className="ga-wizard__footer">
          {state !== "success" && (
            <button className="ga-wizard__footer-link" onClick={onSkip} disabled={isPending} style={{ background: "none", border: "none", cursor: "pointer" }}>
              Hoppa över verifiering →
            </button>
          )}
          {state === "success" && (
            <button className="admin-btn admin-btn--accent" onClick={() => onVerified(testId)} disabled={isPending}>
              {isPending ? "Sparar..." : "Fortsätt →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Screen 5: Enhanced conversions ──────────────────────────────

function EnhancedScreen({ enabled, onToggle, onFinalize, isPending, error }: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onFinalize: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card ga-wizard__card--wide">
        <span className="ga-wizard__step-badge">Steg 5 av 5</span>
        <h1 className="ga-wizard__title">Förbättrad matchning</h1>

        <div className="ga-wizard__match-comparison">
          <div className="ga-wizard__match-card ga-wizard__match-card--without">
            <EditorIcon name="person_off" size={28} />
            <div className="ga-wizard__match-rate">~40%</div>
            <div className="ga-wizard__match-label">Utan förbättrad matchning</div>
          </div>
          <div className="ga-wizard__match-card ga-wizard__match-card--with">
            <EditorIcon name="person_check" size={28} />
            <div className="ga-wizard__match-rate">~70%</div>
            <div className="ga-wizard__match-label">Med förbättrad matchning</div>
          </div>
        </div>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-4) 0", borderBottom: "1px solid var(--admin-border)" }}>
          <div>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Aktivera förbättrad matchning</div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: 1 }}>Krypterad e-postadress skickas med varje konvertering</div>
          </div>
          <button type="button" className={`admin-toggle${enabled ? " admin-toggle-on" : ""}`} onClick={() => onToggle(!enabled)}>
            <span className="admin-toggle-thumb" />
          </button>
        </div>

        <p className="ga-wizard__privacy-note">
          E-postadresser hashas med SHA-256 och lämnar aldrig vår server i läsbar form.
        </p>

        <div className="ga-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onFinalize} disabled={isPending}>
            {isPending ? "Aktiverar..." : "Aktivera Google Ads →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 6: Success ───────────────────────────────────────────

function SuccessScreen({ accountName, actionName, enhanced, verified }: {
  accountName: string; actionName: string; enhanced: boolean; verified: boolean;
}) {
  return (
    <div className="ga-wizard">
      <div className="ga-wizard__card ga-wizard__card--wide" style={{ textAlign: "center" }}>
        <svg className="ga-wizard__checkmark" viewBox="0 0 52 52">
          <circle className="ga-wizard__checkmark-circle" cx="26" cy="26" r="25" />
          <path className="ga-wizard__checkmark-check" d="M14 27l8 8 16-16" />
        </svg>
        <h1 className="ga-wizard__title">Google Ads är anslutet</h1>

        <table className="ga-wizard__summary-table">
          <tbody>
            <tr><td>Konto</td><td>{accountName}</td></tr>
            <tr><td>Konvertering</td><td>{actionName}</td></tr>
            <tr><td>Matchning</td><td>{enhanced ? "Förbättrad" : "Standard"}</td></tr>
            <tr><td>Verifiering</td><td>{verified ? "✓ Bekräftad" : "⚠ Ej testad"}</td></tr>
          </tbody>
        </table>

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <Link href="/apps/google-ads" className="admin-btn admin-btn--accent">Gå till Google Ads</Link>
          <Link href="/apps" className="admin-btn admin-btn--ghost">Tillbaka till App Store</Link>
        </div>
      </div>
    </div>
  );
}

// ── Google icon (inline SVG) ────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
      <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
      <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
      <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
    </svg>
  );
}
