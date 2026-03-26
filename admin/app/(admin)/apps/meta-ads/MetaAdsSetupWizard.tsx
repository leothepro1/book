"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { completeStep, finalizeWizard } from "@/app/_lib/apps/wizard";
import type { WizardState } from "@/app/_lib/apps/types";
import "./meta-ads-wizard.css";

type Props = { wizardState: WizardState };

function getInitialScreen(ws: WizardState): number {
  const c = ws.completedStepIds;
  if (c.includes("pixel-config")) return 5;
  if (c.includes("review") || c.includes("enhanced-matching")) return 5;
  if (c.includes("test-event")) return 4;
  if (c.includes("select-account") || c.includes("connect-meta")) return 2;
  return 1;
}

export function MetaAdsSetupWizard({ wizardState }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState(() => getInitialScreen(wizardState));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<{ id: string; name: string } | null>(null);
  const [matchEmail, setMatchEmail] = useState(true);
  const [matchPhone, setMatchPhone] = useState(false);
  const [matchName, setMatchName] = useState(false);

  const clearError = () => setError(null);

  const advance = (data: Record<string, unknown>, stepId: string, next: number) => {
    clearError();
    startTransition(async () => {
      const result = await completeStep("meta-ads", stepId, data);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
      setScreen(next);
    });
  };

  switch (screen) {
    case 1: return <WelcomeScreen onContinue={() => setScreen(1.5)} />;
    case 1.5: return <OAuthRedirect />;
    case 2: return (
      <AccountPixelScreen
        selectedAccount={selectedAccount}
        onSelectAccount={setSelectedAccount}
        selectedPixel={selectedPixel}
        onSelectPixel={setSelectedPixel}
        onContinue={() => {
          if (!selectedAccount || !selectedPixel) return;
          advance({
            selectedValue: selectedAccount.id, selectedLabel: selectedAccount.name,
            metaAdAccountId: selectedAccount.id, adAccountName: selectedAccount.name,
            pixelId: selectedPixel.id, pixelName: selectedPixel.name,
          }, "select-account", 3);
        }}
        onBack={() => setScreen(1)}
        isPending={isPending}
        error={error}
      />
    );
    case 3: return (
      <TestEventScreen
        onVerified={(testId) => advance({ verified: true, testEventId: testId }, "pixel-config", 4)}
        onSkip={() => advance({ verified: false, skipped: true }, "pixel-config", 4)}
        isPending={isPending}
        error={error}
      />
    );
    case 4: return (
      <EnhancedMatchingScreen
        matchEmail={matchEmail} setMatchEmail={setMatchEmail}
        matchPhone={matchPhone} setMatchPhone={setMatchPhone}
        matchName={matchName} setMatchName={setMatchName}
        onFinalize={() => {
          clearError();
          startTransition(async () => {
            const stepResult = await completeStep("meta-ads", "pixel-config", {
              pixelId: selectedPixel?.id ?? "",
              sendPurchaseEvents: true,
              enhancedMatching: matchEmail,
              matchPhone, matchName,
              testEventCode: "",
            });
            if (!stepResult.ok) { setError(stepResult.error); return; }
            const result = await finalizeWizard("meta-ads");
            if (!result.ok) { setError(result.error); return; }
            setScreen(5);
          });
        }}
        isPending={isPending}
        error={error}
      />
    );
    case 5: return (
      <SuccessScreen
        accountName={selectedAccount?.name ?? "—"}
        pixelName={selectedPixel?.name ?? "—"}
      />
    );
    default: return null;
  }
}

// ── Screen 1: Welcome ───────────────────────────────────────────

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const [showPerms, setShowPerms] = useState(false);

  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-5)" }}>
          <MetaIcon />
        </div>
        <h1 className="meta-wizard__title" style={{ textAlign: "center" }}>Anslut Meta Ads</h1>
        <p className="meta-wizard__subtitle" style={{ textAlign: "center" }}>
          Spåra konverteringar via Conversions API — fungerar även efter iOS 14.
        </p>

        <ul className="meta-wizard__features">
          {[
            "Server-side Conversions API — fungerar efter iOS 14",
            "Automatisk deduplicering mot Meta Pixel",
            "Förbättrad matchning med krypterad kunddata",
            "Kompatibel med Meta Advantage+ kampanjer",
          ].map((f) => (
            <li key={f} className="meta-wizard__feature">
              <EditorIcon name="check_circle" size={18} className="meta-wizard__feature-icon" />
              {f}
            </li>
          ))}
        </ul>

        <div className="meta-wizard__permissions">
          <button className="meta-wizard__permissions-toggle" onClick={() => setShowPerms(!showPerms)}>
            Vilka behörigheter behövs?
            <EditorIcon name={showPerms ? "expand_less" : "expand_more"} size={18} />
          </button>
          {showPerms && (
            <div className="meta-wizard__permissions-body">
              <div className="meta-wizard__perm-item">
                <EditorIcon name="lock" size={14} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <div><strong>Hantera annonskonton</strong> — krävs för att lista konton och pixlar</div>
              </div>
              <div className="meta-wizard__perm-item">
                <EditorIcon name="lock" size={14} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                <div><strong>Läsa och skriva pixelhändelser</strong> — krävs för CAPI-händelser</div>
              </div>
            </div>
          )}
        </div>

        <button className="admin-btn admin-btn--accent" style={{ width: "100%", background: "var(--meta-blue)" }} onClick={onContinue}>
          Anslut Meta Business-konto →
        </button>
      </div>
    </div>
  );
}

// ── Screen 1.5: OAuth redirect ──────────────────────────────────

function OAuthRedirect() {
  useEffect(() => {
    fetch("/api/apps/meta-ads/auth-url")
      .then((r) => r.json())
      .then((data) => { if (data.url) window.location.href = data.url; });
  }, []);

  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card" style={{ textAlign: "center" }}>
        <div style={{ margin: "var(--space-8) 0" }}>
          <div className="meta-wizard__skeleton" style={{ width: 200, height: 20, margin: "0 auto var(--space-3)" }} />
          <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>Omdirigerar till Meta...</p>
        </div>
      </div>
    </div>
  );
}

// ── Screen 2: Account + Pixel ───────────────────────────────────

function AccountPixelScreen({ selectedAccount, onSelectAccount, selectedPixel, onSelectPixel, onContinue, onBack, isPending, error }: {
  selectedAccount: { id: string; name: string } | null;
  onSelectAccount: (a: { id: string; name: string }) => void;
  selectedPixel: { id: string; name: string } | null;
  onSelectPixel: (p: { id: string; name: string }) => void;
  onContinue: () => void;
  onBack: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const [pixels, setPixels] = useState<Array<{ id: string; name: string; lastFiredAt: string | null }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [pixelFetchKey, setPixelFetchKey] = useState(0);
  const [manualPixelId, setManualPixelId] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    fetch("/api/apps/meta-ads/accounts")
      .then((r) => r.json())
      .then((data) => { setAccounts(Array.isArray(data) ? data : []); setLoadingAccounts(false); })
      .catch(() => setLoadingAccounts(false));
  }, []);

  // Trigger pixel fetch when account changes
  const handleSelectAccount = (a: { id: string; name: string }) => {
    onSelectAccount(a);
    setLoadingPixels(true);
    setPixels([]);
    setPixelFetchKey((k) => k + 1);
  };

  useEffect(() => {
    if (!selectedAccount || pixelFetchKey === 0) return;
    let cancelled = false;
    fetch(`/api/apps/meta-ads/pixels?accountId=${selectedAccount.id}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setPixels(data.pixels ?? []); setLoadingPixels(false); } })
      .catch(() => { if (!cancelled) setLoadingPixels(false); });
    return () => { cancelled = true; };
  }, [selectedAccount, pixelFetchKey]);

  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card meta-wizard__card--wide">
        <button className="meta-wizard__back" onClick={onBack}>
          <EditorIcon name="chevron_left" size={18} /> Tillbaka
        </button>
        <span className="meta-wizard__step-badge">Steg 2 av 5</span>
        <h1 className="meta-wizard__title">Välj konto och pixel</h1>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div className="meta-wizard__section-label">Annonskonto</div>
        {loadingAccounts ? (
          <div className="meta-wizard__account-list">{[1, 2].map((i) => <div key={i} className="meta-wizard__skeleton" />)}</div>
        ) : (
          <div className="meta-wizard__account-list">
            {accounts.map((a) => (
              <div key={a.id} className={`meta-wizard__account-item${selectedAccount?.id === a.id ? " meta-wizard__account-item--selected" : ""}`} onClick={() => handleSelectAccount({ id: a.id, name: a.name })}>
                <span className="meta-wizard__account-radio">{selectedAccount?.id === a.id && <EditorIcon name="check" size={12} />}</span>
                <div>
                  <div className="meta-wizard__account-name">{a.name}</div>
                  <div className="meta-wizard__account-meta">ID: {a.id} · {a.currency}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedAccount && (
          <>
            <div className="meta-wizard__section-label">Meta Pixel</div>
            {loadingPixels ? (
              <div className="meta-wizard__account-list">{[1].map((i) => <div key={i} className="meta-wizard__skeleton" />)}</div>
            ) : (
              <>
                <div className="meta-wizard__account-list">
                  {pixels.map((p) => (
                    <div key={p.id} className={`meta-wizard__account-item${selectedPixel?.id === p.id ? " meta-wizard__account-item--selected" : ""}`} onClick={() => { onSelectPixel({ id: p.id, name: p.name }); setShowManual(false); }}>
                      <span className="meta-wizard__account-radio">{selectedPixel?.id === p.id && <EditorIcon name="check" size={12} />}</span>
                      <div>
                        <div className="meta-wizard__account-name">{p.name}</div>
                        <div className="meta-wizard__account-meta">ID: {p.id}{p.lastFiredAt ? ` · Senast: ${p.lastFiredAt}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {!showManual ? (
                  <button onClick={() => setShowManual(true)} style={{ fontSize: "var(--font-sm)", color: "var(--admin-accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Ange Pixel-ID manuellt</button>
                ) : (
                  <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
                    <input className="admin-input--sm" placeholder="Pixel-ID" value={manualPixelId} onChange={(e) => setManualPixelId(e.target.value)} style={{ flex: 1 }} />
                    <button className="admin-btn admin-btn--sm admin-btn--accent" disabled={!manualPixelId.trim()} onClick={() => { onSelectPixel({ id: manualPixelId, name: `Pixel ${manualPixelId}` }); }}>Använd</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="meta-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onContinue} disabled={!selectedAccount || !selectedPixel || isPending}>
            {isPending ? "Sparar..." : "Fortsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 3: Test event ────────────────────────────────────────

function TestEventScreen({ onVerified, onSkip, isPending, error }: {
  onVerified: (testId: string) => void;
  onSkip: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testId, setTestId] = useState("");

  const handleTest = () => {
    setState("loading");
    const id = `TEST_${Date.now()}`;
    setTestId(id);
    setTimeout(() => setState("success"), 2000);
  };

  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card meta-wizard__card--wide">
        <span className="meta-wizard__step-badge">Steg 3 av 5</span>
        <h1 className="meta-wizard__title">Verifiera Meta Pixel</h1>
        <p className="meta-wizard__subtitle">Vi skickar en testhändelse för att bekräfta att CAPI-anslutningen fungerar.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div className="meta-wizard__verify">
          {state === "idle" && <button className="admin-btn admin-btn--accent" onClick={handleTest}>Skicka testhändelse</button>}
          {state === "loading" && (
            <>
              <div style={{ width: 32, height: 32, border: "3px solid var(--admin-border)", borderTopColor: "var(--meta-blue)", borderRadius: "var(--radius-full)", animation: "setup-spin 0.8s linear infinite" }} />
              <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>Skickar testhändelse...</span>
            </>
          )}
          {state === "success" && (
            <>
              <EditorIcon name="check_circle" size={48} style={{ color: "var(--meta-blue)" }} />
              <div style={{ fontSize: "var(--font-lg)", fontWeight: 600, color: "var(--admin-text)" }}>Pixel-anslutning fungerar</div>
              <div style={{ background: "color-mix(in srgb, var(--admin-text) 3%, var(--admin-surface))", borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)", width: "100%", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-1) 0", fontSize: "var(--font-sm)" }}><span style={{ color: "var(--admin-text-secondary)" }}>Händelse-ID</span><span style={{ color: "var(--admin-text)", fontWeight: 500 }}>{testId}</span></div>
              </div>
              <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener" style={{ fontSize: "var(--font-xs)", color: "var(--meta-blue)", fontWeight: 500 }}>Öppna Events Manager för att bekräfta →</a>
            </>
          )}
        </div>

        <div className="meta-wizard__footer">
          {state !== "success" && <button onClick={onSkip} disabled={isPending} style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", background: "none", border: "none", cursor: "pointer", marginRight: "auto" }}>Hoppa över verifiering →</button>}
          {state === "success" && <button className="admin-btn admin-btn--accent" onClick={() => onVerified(testId)} disabled={isPending}>{isPending ? "Sparar..." : "Fortsätt →"}</button>}
        </div>
      </div>
    </div>
  );
}

// ── Screen 4: Enhanced matching ─────────────────────────────────

function EnhancedMatchingScreen({ matchEmail, setMatchEmail, matchPhone, setMatchPhone, matchName, setMatchName, onFinalize, isPending, error }: {
  matchEmail: boolean; setMatchEmail: (v: boolean) => void;
  matchPhone: boolean; setMatchPhone: (v: boolean) => void;
  matchName: boolean; setMatchName: (v: boolean) => void;
  onFinalize: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card meta-wizard__card--wide">
        <span className="meta-wizard__step-badge">Steg 4 av 5</span>
        <h1 className="meta-wizard__title">Förbättrad matchning</h1>
        <p className="meta-wizard__subtitle">Välj vilka kundfält som ska användas för bättre matchning.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div style={{ marginBottom: "var(--space-5)" }}>
          <div className="meta-wizard__checkbox-row" onClick={() => setMatchEmail(!matchEmail)}>
            <span className={`meta-wizard__checkbox${matchEmail ? " meta-wizard__checkbox--checked" : ""}`}>
              {matchEmail && <EditorIcon name="check" size={12} />}
            </span>
            <div>
              <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>E-postadress <span style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", fontWeight: 400 }}>rekommenderas</span></div>
            </div>
          </div>
          <div className="meta-wizard__checkbox-row" onClick={() => setMatchPhone(!matchPhone)}>
            <span className={`meta-wizard__checkbox${matchPhone ? " meta-wizard__checkbox--checked" : ""}`}>
              {matchPhone && <EditorIcon name="check" size={12} />}
            </span>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Telefonnummer</div>
          </div>
          <div className="meta-wizard__checkbox-row" onClick={() => setMatchName(!matchName)}>
            <span className={`meta-wizard__checkbox${matchName ? " meta-wizard__checkbox--checked" : ""}`}>
              {matchName && <EditorIcon name="check" size={12} />}
            </span>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Förnamn + efternamn</div>
          </div>
        </div>

        <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", lineHeight: 1.5, marginBottom: "var(--space-3)" }}>
          Aktivera fler fält förbättrar matchningen men kräver att kunden lämnat dessa uppgifter vid köp.
        </p>
        <p className="meta-wizard__privacy-note">
          Alla kundfält hashas med SHA-256 och lämnar aldrig vår server i läsbar form.
        </p>

        <div className="meta-wizard__footer">
          <button className="admin-btn admin-btn--accent" style={{ background: "var(--meta-blue)" }} onClick={onFinalize} disabled={isPending}>
            {isPending ? "Aktiverar..." : "Aktivera Meta Ads →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 5: Success ───────────────────────────────────────────

function SuccessScreen({ accountName, pixelName }: { accountName: string; pixelName: string }) {
  return (
    <div className="meta-wizard">
      <div className="meta-wizard__card meta-wizard__card--wide" style={{ textAlign: "center" }}>
        <svg className="meta-wizard__checkmark" viewBox="0 0 52 52">
          <circle className="meta-wizard__checkmark-circle" cx="26" cy="26" r="25" />
          <path className="meta-wizard__checkmark-check" d="M14 27l8 8 16-16" />
        </svg>
        <h1 className="meta-wizard__title">Meta Ads är anslutet</h1>

        <table className="meta-wizard__summary-table">
          <tbody>
            <tr><td>Annonskonto</td><td>{accountName}</td></tr>
            <tr><td>Pixel</td><td>{pixelName}</td></tr>
          </tbody>
        </table>

        <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginBottom: "var(--space-5)" }}>
          Din anslutning är giltig i 60 dagar. Vi påminner dig innan den löper ut.
        </p>

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <Link href="/apps/meta-ads" className="admin-btn admin-btn--accent" style={{ background: "var(--meta-blue)" }}>Gå till Meta Ads</Link>
          <Link href="/apps" className="admin-btn admin-btn--ghost">Tillbaka till App Store</Link>
        </div>
      </div>
    </div>
  );
}

// ── Meta icon (inline SVG) ──────────────────────────────────────

function MetaIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="10" fill="#1877F2" />
      <path d="M33.6 30.5l1.1-7.1h-6.8V19c0-1.9.9-3.8 4-3.8h3.1v-6.1S32.4 8.5 30 8.5c-5.1 0-8.4 3.1-8.4 8.7v5.4h-5.7v7.1h5.7V47c1.1.2 2.3.3 3.5.3s2.4-.1 3.5-.3V30.5h5z" fill="white" />
    </svg>
  );
}
