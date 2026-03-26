"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { completeStep, finalizeWizard } from "@/app/_lib/apps/wizard";
import type { WizardState } from "@/app/_lib/apps/types";
import "./mailchimp-wizard.css";

type Props = { wizardState: WizardState };

function getInitialScreen(ws: WizardState): number {
  const c = ws.completedStepIds;
  if (c.includes("automations") || c.includes("review")) return 5;
  if (c.includes("list-select")) return 4;
  if (c.includes("api-key")) return 3;
  return 1;
}

export function MailchimpSetupWizard({ wizardState }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState(() => getInitialScreen(wizardState));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [validated, setValidated] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [selectedList, setSelectedList] = useState<{ id: string; name: string; count: number } | null>(null);
  const [triggerBooking, setTriggerBooking] = useState(true);
  const [triggerCheckout, setTriggerCheckout] = useState(true);
  const [triggerLapsed, setTriggerLapsed] = useState(false);
  const [vipThreshold, setVipThreshold] = useState(10000);

  const clearError = () => setError(null);

  const advance = (data: Record<string, unknown>, stepId: string, next: number) => {
    clearError();
    startTransition(async () => {
      const result = await completeStep("mailchimp", stepId, data);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
      setScreen(next);
    });
  };

  switch (screen) {
    case 1: return <WelcomeScreen onContinue={() => setScreen(2)} />;
    case 2: return (
      <ApiKeyScreen
        apiKey={apiKey} setApiKey={setApiKey}
        validated={validated} setValidated={setValidated}
        accountName={accountName} setAccountName={setAccountName}
        onContinue={() => advance({ apiKey }, "api-key", 3)}
        isPending={isPending} error={error}
      />
    );
    case 3: return (
      <ListScreen
        selected={selectedList} onSelect={setSelectedList}
        onContinue={() => {
          if (!selectedList) return;
          advance({ selectedValue: selectedList.id, selectedLabel: selectedList.name }, "list-select", 4);
        }}
        onBack={() => setScreen(2)}
        isPending={isPending} error={error}
      />
    );
    case 4: return (
      <AutomationsScreen
        triggerBooking={triggerBooking} setTriggerBooking={setTriggerBooking}
        triggerCheckout={triggerCheckout} setTriggerCheckout={setTriggerCheckout}
        triggerLapsed={triggerLapsed} setTriggerLapsed={setTriggerLapsed}
        vipThreshold={vipThreshold} setVipThreshold={setVipThreshold}
        onFinalize={() => {
          clearError();
          startTransition(async () => {
            const stepResult = await completeStep("mailchimp", "automations", {
              triggerBookingConfirmed: triggerBooking,
              triggerCheckedOut: triggerCheckout,
              triggerLapsed,
              vipThreshold,
            });
            if (!stepResult.ok) { setError(stepResult.error); return; }
            const result = await finalizeWizard("mailchimp");
            if (!result.ok) { setError(result.error); return; }
            // Trigger initial sync (fire and forget)
            fetch("/api/apps/mailchimp/sync", { method: "POST" }).catch(() => {});
            setScreen(5);
          });
        }}
        isPending={isPending} error={error}
      />
    );
    case 5: return <SuccessScreen listName={selectedList?.name ?? "—"} />;
    default: return null;
  }
}

// ── Screen 1: Welcome ───────────────────────────────────────────

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mc-wizard">
      <div className="mc-wizard__card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-5)" }}>
          <MailchimpIcon />
        </div>
        <h1 className="mc-wizard__title" style={{ textAlign: "center" }}>Anslut Mailchimp</h1>
        <p className="mc-wizard__subtitle" style={{ textAlign: "center" }}>
          Synkronisera dina gäster och trigga automatiserade kampanjer.
        </p>
        <ul className="mc-wizard__features">
          {[
            "Synkronisera gäster automatiskt till din Mailchimp-publik",
            "Automatiska segment — VIP, återkommande, nya gäster",
            "Trigga e-postautomationer vid bokning och utcheckning",
            "Se vilka e-postmeddelanden som driver bokningar",
          ].map((f) => (
            <li key={f} className="mc-wizard__feature">
              <EditorIcon name="check_circle" size={18} className="mc-wizard__feature-icon" />
              {f}
            </li>
          ))}
        </ul>
        <button className="admin-btn admin-btn--accent" style={{ width: "100%" }} onClick={onContinue}>
          Kom igång →
        </button>
      </div>
    </div>
  );
}

// ── Screen 2: API key ───────────────────────────────────────────

function ApiKeyScreen({ apiKey, setApiKey, validated, setValidated, accountName, setAccountName, onContinue, isPending, error }: {
  apiKey: string; setApiKey: (v: string) => void;
  validated: boolean; setValidated: (v: boolean) => void;
  accountName: string; setAccountName: (v: string) => void;
  onContinue: () => void; isPending: boolean; error: string | null;
}) {
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleValidate = () => {
    setValidating(true);
    setValidationError(null);
    fetch("/api/apps/mailchimp/validate-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setValidated(true);
          setAccountName(data.accountName ?? "Mailchimp");
        } else {
          setValidationError(data.error ?? "Ogiltig nyckel");
        }
        setValidating(false);
      })
      .catch(() => { setValidationError("Kunde inte verifiera"); setValidating(false); });
  };

  return (
    <div className="mc-wizard">
      <div className="mc-wizard__card mc-wizard__card--wide">
        <span className="mc-wizard__step-badge">Steg 1 av 3</span>
        <h1 className="mc-wizard__title">Anslut Mailchimp</h1>
        <p className="mc-wizard__subtitle">Ange din API-nyckel från Mailchimp.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div style={{ background: "color-mix(in srgb, var(--admin-text) 3%, var(--admin-surface))", borderRadius: "var(--radius-md)", padding: "var(--space-4)", marginBottom: "var(--space-5)" }}>
          <p style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)", marginBottom: "var(--space-2)" }}>Hur hittar jag min API-nyckel?</p>
          <ol style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)", lineHeight: 1.6, margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>Logga in på Mailchimp</li>
            <li>Klicka på din profil → Account & Billing</li>
            <li>Gå till Extras → API keys</li>
            <li>Klicka &quot;Create A Key&quot;</li>
          </ol>
          <a href="https://us1.admin.mailchimp.com/account/api/" target="_blank" rel="noopener" style={{ fontSize: "var(--font-xs)", color: "var(--admin-accent)", fontWeight: 500, display: "inline-block", marginTop: "var(--space-2)" }}>
            Öppna Mailchimp API-inställningar →
          </a>
        </div>

        <div style={{ marginBottom: "var(--space-4)" }}>
          <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, display: "block", marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>API-nyckel</label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              className="admin-input--sm"
              placeholder="abc123def456...-us21"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setValidated(false); setValidationError(null); }}
              style={{ width: "100%", paddingRight: 40 }}
            />
            <button type="button" onClick={() => setShowKey(!showKey)} style={{ position: "absolute", right: "var(--space-2)", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-tertiary)", padding: "var(--space-1)" }}>
              <EditorIcon name={showKey ? "visibility_off" : "visibility"} size={16} />
            </button>
          </div>
        </div>

        {validated ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", background: "color-mix(in srgb, #16a34a 8%, var(--admin-surface))", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}>
            <EditorIcon name="check_circle" size={18} style={{ color: "#16a34a" }} />
            <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>Ansluten till {accountName}</span>
          </div>
        ) : validationError ? (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)" }}>
            <EditorIcon name="error" size={18} style={{ color: "var(--admin-danger)" }} />
            <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-danger)" }}>{validationError}</span>
          </div>
        ) : (
          <button className="admin-btn admin-btn--outline admin-btn--sm" onClick={handleValidate} disabled={validating || !apiKey.trim()} style={{ marginBottom: "var(--space-4)" }}>
            {validating ? "Verifierar..." : "Verifiera nyckel"}
          </button>
        )}

        <div className="mc-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onContinue} disabled={!validated || isPending}>
            {isPending ? "Sparar..." : "Fortsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 3: List selection ────────────────────────────────────

function ListScreen({ selected, onSelect, onContinue, onBack, isPending, error }: {
  selected: { id: string; name: string; count: number } | null;
  onSelect: (l: { id: string; name: string; count: number }) => void;
  onContinue: () => void; onBack: () => void;
  isPending: boolean; error: string | null;
}) {
  const [lists, setLists] = useState<Array<{ id: string; name: string; memberCount: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/apps/mailchimp/lists")
      .then((r) => r.json())
      .then((data) => { setLists(data.lists ?? data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="mc-wizard">
      <div className="mc-wizard__card mc-wizard__card--wide">
        <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "var(--space-4)" }}>
          <EditorIcon name="chevron_left" size={18} /> Tillbaka
        </button>
        <span className="mc-wizard__step-badge">Steg 2 av 3</span>
        <h1 className="mc-wizard__title">Välj publik</h1>
        <p className="mc-wizard__subtitle">Välj vilken Mailchimp-publik dina gäster ska synkroniseras till.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        {loading ? (
          <div className="mc-wizard__account-list">{[1, 2].map((i) => <div key={i} className="mc-wizard__skeleton" />)}</div>
        ) : lists.length === 0 ? (
          <div style={{ textAlign: "center", padding: "var(--space-6)" }}>
            <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-3)" }}>Inga publiker hittades. Skapa en publik i Mailchimp först.</p>
            <a href="https://mailchimp.com/help/create-audience/" target="_blank" rel="noopener" style={{ fontSize: "var(--font-sm)", color: "var(--admin-accent)", fontWeight: 500 }}>Skapa publik i Mailchimp →</a>
          </div>
        ) : (
          <div className="mc-wizard__account-list">
            {lists.map((l) => (
              <div key={l.id} className={`mc-wizard__account-item${selected?.id === l.id ? " mc-wizard__account-item--selected" : ""}`} onClick={() => onSelect({ id: l.id, name: l.name, count: l.memberCount })}>
                <span className="mc-wizard__account-radio">{selected?.id === l.id && <EditorIcon name="check" size={12} />}</span>
                <div>
                  <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>{l.name}</span>
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginLeft: "var(--space-2)" }}>· {l.memberCount.toLocaleString("sv-SE")} kontakter</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="mc-wizard__preview">
            <p style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)", marginBottom: "var(--space-2)" }}>Dina gäster synkroniseras med:</p>
            <div className="mc-wizard__preview-row"><span className="mc-wizard__preview-key">Publik</span><span className="mc-wizard__preview-value">{selected.name}</span></div>
            <div className="mc-wizard__preview-row"><span className="mc-wizard__preview-key">Segment</span><span className="mc-wizard__preview-value">5 automatiska</span></div>
            <div className="mc-wizard__preview-row"><span className="mc-wizard__preview-key">Synkronisering</span><span className="mc-wizard__preview-value">Direkt + vid varje bokning</span></div>
          </div>
        )}

        <div className="mc-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onContinue} disabled={!selected || isPending}>
            {isPending ? "Sparar..." : "Fortsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 4: Automations + finish ──────────────────────────────

function AutomationsScreen({ triggerBooking, setTriggerBooking, triggerCheckout, setTriggerCheckout, triggerLapsed, setTriggerLapsed, vipThreshold, setVipThreshold, onFinalize, isPending, error }: {
  triggerBooking: boolean; setTriggerBooking: (v: boolean) => void;
  triggerCheckout: boolean; setTriggerCheckout: (v: boolean) => void;
  triggerLapsed: boolean; setTriggerLapsed: (v: boolean) => void;
  vipThreshold: number; setVipThreshold: (v: number) => void;
  onFinalize: () => void; isPending: boolean; error: string | null;
}) {
  return (
    <div className="mc-wizard">
      <div className="mc-wizard__card mc-wizard__card--wide">
        <span className="mc-wizard__step-badge">Steg 3 av 3</span>
        <h1 className="mc-wizard__title">Automationer</h1>
        <p className="mc-wizard__subtitle">Välj vilka händelser som ska trigga automationer i Mailchimp.</p>

        {error && <div style={{ padding: "var(--space-3)", background: "var(--admin-danger-tint)", borderRadius: "var(--radius-md)", fontSize: "var(--font-sm)", color: "var(--admin-danger)", marginBottom: "var(--space-4)" }}>{error}</div>}

        <div style={{ marginBottom: "var(--space-5)" }}>
          <div className="mc-wizard__toggle-row">
            <div><div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Bokningsbekräftelse</div><div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>Trigga automation när en gäst bokar</div></div>
            <button type="button" className={`admin-toggle${triggerBooking ? " admin-toggle-on" : ""}`} onClick={() => setTriggerBooking(!triggerBooking)}><span className="admin-toggle-thumb" /></button>
          </div>
          <div className="mc-wizard__toggle-row">
            <div><div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Utcheckning</div><div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>Skicka uppföljning och be om recension</div></div>
            <button type="button" className={`admin-toggle${triggerCheckout ? " admin-toggle-on" : ""}`} onClick={() => setTriggerCheckout(!triggerCheckout)}><span className="admin-toggle-thumb" /></button>
          </div>
          <div className="mc-wizard__toggle-row">
            <div><div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>Inaktiva gäster</div><div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>Nå ut till gäster som inte bokat på 180 dagar</div></div>
            <button type="button" className={`admin-toggle${triggerLapsed ? " admin-toggle-on" : ""}`} onClick={() => setTriggerLapsed(!triggerLapsed)}><span className="admin-toggle-thumb" /></button>
          </div>
        </div>

        <div style={{ marginBottom: "var(--space-6)" }}>
          <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, display: "block", marginBottom: "var(--space-1)", color: "var(--admin-text)" }}>VIP-gräns</label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <input type="number" className="admin-input--sm" value={vipThreshold} onChange={(e) => setVipThreshold(Number(e.target.value))} style={{ width: 120 }} />
            <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>kr</span>
          </div>
          <p style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: "var(--space-1)" }}>Gäster som spenderat mer märks som VIP</p>
        </div>

        <div className="mc-wizard__footer">
          <button className="admin-btn admin-btn--accent" onClick={onFinalize} disabled={isPending}>
            {isPending ? "Aktiverar..." : "Aktivera Mailchimp →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen 5: Success ───────────────────────────────────────────

function SuccessScreen({ listName }: { listName: string }) {
  const [syncStatus, setSyncStatus] = useState<{ synced: number; total: number; inProgress: boolean }>({ synced: 0, total: 0, inProgress: true });

  useEffect(() => {
    const poll = setInterval(() => {
      fetch("/api/apps/mailchimp/sync-status")
        .then((r) => r.json())
        .then((data) => {
          setSyncStatus({ synced: data.synced ?? 0, total: data.total ?? 0, inProgress: data.inProgress ?? false });
          if (!data.inProgress) clearInterval(poll);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div className="mc-wizard">
      <div className="mc-wizard__card mc-wizard__card--wide" style={{ textAlign: "center" }}>
        <svg className="mc-wizard__checkmark" viewBox="0 0 52 52">
          <circle className="mc-wizard__checkmark-circle" cx="26" cy="26" r="25" />
          <path className="mc-wizard__checkmark-check" d="M14 27l8 8 16-16" />
        </svg>
        <h1 className="mc-wizard__title">Mailchimp är anslutet</h1>

        <div style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", marginBottom: "var(--space-5)" }}>
          {syncStatus.inProgress ? (
            <span>Synkroniserar dina gäster... ({syncStatus.synced} av {syncStatus.total || "?"})</span>
          ) : syncStatus.synced > 0 ? (
            <span>{syncStatus.synced} gäster synkroniserade</span>
          ) : (
            <span>Redo att synkronisera vid nästa bokning</span>
          )}
        </div>

        <table className="mc-wizard__summary-table">
          <tbody>
            <tr><td>Publik</td><td>{listName}</td></tr>
            <tr><td>Segment</td><td>5 automatiska segment</td></tr>
          </tbody>
        </table>

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center" }}>
          <Link href="/apps/mailchimp" className="admin-btn admin-btn--accent">Gå till Mailchimp</Link>
          <Link href="/apps" className="admin-btn admin-btn--ghost">Tillbaka till App Store</Link>
        </div>
      </div>
    </div>
  );
}

// ── Mailchimp icon ──────────────────────────────────────────────

function MailchimpIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="10" fill="#FFE01B" />
      <path d="M24 12C17.4 12 12 17.4 12 24s5.4 12 12 12 12-5.4 12-12S30.6 12 24 12zm0 22c-5.5 0-10-4.5-10-10s4.5-10 10-10 10 4.5 10 10-4.5 10-10 10z" fill="#241C15"/>
      <circle cx="20.5" cy="22" r="2" fill="#241C15"/>
      <circle cx="27.5" cy="22" r="2" fill="#241C15"/>
      <path d="M28.5 27.5c0 1.5-2 3-4.5 3s-4.5-1.5-4.5-3" stroke="#241C15" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
