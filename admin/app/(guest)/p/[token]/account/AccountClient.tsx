"use client";

import LinkCardModal from "../../../_components/LinkCardModal";
import { useMemo, useState, useTransition } from "react";
import type { TenantConfig } from "../../../_lib/tenant/types";
import { buttonClass } from "../../../_lib/theme";
import { updateGuestAccount } from "./actions";
import { Headset, LifeBuoy, MessageSquareText, ExternalLink } from "lucide-react";

type AccountState = {
  firstName: string;
  lastName: string;
  guestEmail: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

type FieldKey = "name" | "email" | "phone" | "address";
type PanelKey = FieldKey | "support_customerService" | "support_helpCenter" | "support_feedback";

const ChevronSvg = (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m7.5 5 5 5-5 5"
    />
  </svg>
);

const ChevronLeft = (
  <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>{ChevronSvg}</span>
);

function trim(s: string) {
  return (s ?? "").trim();
}

function prettyAddress(s: AccountState) {
  const parts = [s.street, s.postalCode, s.city, s.country]
    .map((x) => trim(x))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function splitName(full: string, fallback: { firstName: string; lastName: string }) {
  const cleaned = trim(full).replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  const parts = cleaned.split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? fallback.firstName,
    lastName: parts.slice(1).join(" ") || fallback.lastName,
  };
}

function rowStyle(opts?: { withIcon?: boolean }): React.CSSProperties {
  const withIcon = !!opts?.withIcon;
  return {
    width: "100%",
    display: "grid",
    gridTemplateColumns: withIcon ? "22px 1fr auto" : "1fr auto auto",
    alignItems: "center",
    gap: 10,
    padding: "14px 14px",
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--text)",
    textAlign: "left",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    height: 48,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--text)",
    padding: "0 14px",
    outline: "none",
    fontSize: 14,
  };
}

function sectionCardStyle(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    padding: 14,
  };
}

export default function AccountClient({
  token,
  tenantId,
  guestEmail,
  lang,
  config,
  initial,
}: {
  token: string;
  tenantId: string;
  guestEmail: string;
  lang: "sv" | "en";
  config: TenantConfig;
  initial: AccountState;
}) {
  const btnClass = buttonClass(config.theme);

  const t = useMemo(() => {
    const sv = {
      headings: {
        accountTitle: "Ditt konto",
        supportTitle: "Support",
      },
      fields: {
        name: "Namn",
        email: "Epost",
        phone: "Telefon",
        address: "Adress",
      },
      actions: {
        done: "Klar",
        back: "Tillbaka",
        close: "Stäng",
        open: "Öppna",
      },
      emailLock: {
        verifyEmail: "Vi behöver verifiera din epostadress så att du kan använda vår app",
        ifWrongPrefix: "Om uppgifterna är fel, kontakta ",
        customerServiceLinkText: "kundservice",
      },
      placeholders: {
        name: "Skriv ditt namn",
        phone: "Skriv telefonnummer",
        street: "Gata",
        postalCode: "Postnummer",
        city: "Stad",
        country: "Land",
        feedback: "Skriv din feedback här…",
      },
      support: {
        customerService: "Kundservice",
        helpCenter: "Hjälpcenter",
        feedback: "Ge feedback",
      },
      supportPanels: {
        customerService: {
          title: "Kontakta oss",
          body:
            "Här kan du nå kundservice. (Placeholder – kopplas senare till riktiga kontaktvägar.)",
          links: {
            email: "Skicka e-post",
            phone: "Ring oss",
            chat: "Starta chatt",
          },
        },
        helpCenter: {
          title: "Hjälpcenter",
          body: "Här kan du hitta guider och vanliga frågor. (Placeholder – kopplas senare.)",
          links: {
            faq: "Vanliga frågor",
            guides: "Guider",
            policies: "Villkor & policy",
          },
        },
        feedback: {
          title: "Feedback",
          body: "Hjälp oss förbättra upplevelsen. (Placeholder – ingen inskickning än.)",
          cta: "Skicka feedback",
        },
      },
    };

    const en = {
      headings: {
        accountTitle: "Your account",
        supportTitle: "Support",
      },
      fields: {
        name: "Name",
        email: "Email",
        phone: "Phone",
        address: "Address",
      },
      actions: {
        done: "Done",
        back: "Back",
        close: "Close",
        open: "Open",
      },
      emailLock: {
        verifyEmail: "We need to verify your email address so you can use our app",
        ifWrongPrefix: "If the details are incorrect, contact ",
        customerServiceLinkText: "customer service",
      },
      placeholders: {
        name: "Enter your name",
        phone: "Enter phone number",
        street: "Street",
        postalCode: "Postal code",
        city: "City",
        country: "Country",
        feedback: "Write your feedback here…",
      },
      support: {
        customerService: "Customer service",
        helpCenter: "Help center",
        feedback: "Leave feedback",
      },
      supportPanels: {
        customerService: {
          title: "Contact us",
          body: "Reach customer service here. (Placeholder – will be connected later.)",
          links: {
            email: "Send email",
            phone: "Call us",
            chat: "Start chat",
          },
        },
        helpCenter: {
          title: "Help center",
          body: "Find guides and FAQs here. (Placeholder – will be connected later.)",
          links: {
            faq: "FAQ",
            guides: "Guides",
            policies: "Terms & policy",
          },
        },
        feedback: {
          title: "Feedback",
          body: "Help us improve the experience. (Placeholder – no submission yet.)",
          cta: "Submit feedback",
        },
      },
    };

    return lang === "en" ? en : sv;
  }, [lang]);

  const [state, setState] = useState<AccountState>(initial);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [isPending, startTransition] = useTransition();

  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftStreet, setDraftStreet] = useState("");
  const [draftPostal, setDraftPostal] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftCountry, setDraftCountry] = useState("");
  const [draftFeedback, setDraftFeedback] = useState("");

  const isFieldPanel =
    panel === "name" || panel === "email" || panel === "phone" || panel === "address";
  const isSupportPanel =
    panel === "support_customerService" ||
    panel === "support_helpCenter" ||
    panel === "support_feedback";

  function openPanel(k: PanelKey) {
    setPanel(k);

    if (k === "name") setDraftName(`${state.firstName} ${state.lastName}`.trim());
    if (k === "phone") setDraftPhone(state.phone ?? "");
    if (k === "address") {
      setDraftStreet(state.street ?? "");
      setDraftPostal(state.postalCode ?? "");
      setDraftCity(state.city ?? "");
      setDraftCountry(state.country ?? "");
    }
    if (k === "support_feedback") setDraftFeedback("");

    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTimeout(() => setPanel(null), 220);
  }

  function modalTitle() {
    if (panel === "name") return t.fields.name;
    if (panel === "email") return t.fields.email;
    if (panel === "phone") return t.fields.phone;
    if (panel === "address") return t.fields.address;

    if (panel === "support_customerService") return t.support.customerService;
    if (panel === "support_helpCenter") return t.support.helpCenter;
    if (panel === "support_feedback") return t.support.feedback;

    return "";
  }

  function rowValue(k: FieldKey) {
    if (k === "name") return `${state.firstName} ${state.lastName}`.trim() || "—";
    if (k === "email") return state.guestEmail || "—";
    if (k === "phone") return state.phone || "—";
    return prettyAddress(state);
  }

  async function save() {
    if (!panel || !isFieldPanel) return;

    startTransition(async () => {
      if (panel === "email") {
        close();
        return;
      }

      if (panel === "name") {
        const next = splitName(draftName, {
          firstName: state.firstName,
          lastName: state.lastName,
        });

        setState((s) => ({ ...s, ...next }));

        await updateGuestAccount({
          token,
          tenantId,
          guestEmail,
          firstName: next.firstName,
          lastName: next.lastName,
        });
      }

      if (panel === "phone") {
        const phone = trim(draftPhone);
        setState((s) => ({ ...s, phone }));
        await updateGuestAccount({ token, tenantId, guestEmail, phone });
      }

      if (panel === "address") {
        const street = trim(draftStreet);
        const postalCode = trim(draftPostal);
        const city = trim(draftCity);
        const country = trim(draftCountry);

        setState((s) => ({ ...s, street, postalCode, city, country }));

        await updateGuestAccount({
          token,
          tenantId,
          guestEmail,
          street,
          postalCode,
          city,
          country,
        });
      }

      close();
    });
  }

  // UI-only (placeholder): feedback submit does not persist yet
  function submitFeedback() {
    // future: hook up to API / notification engine
    close();
  }

  const mainX = open ? "translateX(-22%)" : "translateX(0)";
  const panelX = open ? "translateX(0)" : "translateX(100%)";

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {/* Main */}
      <div
        style={{
          transform: mainX,
          transition: "transform 220ms ease",
          padding: "14px 17px 24px 17px",
        }}
      >
        <div className="g-heading">{t.headings.accountTitle}</div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <Row label={t.fields.name} value={rowValue("name")} onClick={() => openPanel("name")} />
          <Row label={t.fields.email} value={rowValue("email")} onClick={() => openPanel("email")} />
          <Row label={t.fields.phone} value={rowValue("phone")} onClick={() => openPanel("phone")} />
          <Row
            label={t.fields.address}
            value={rowValue("address")}
            onClick={() => openPanel("address")}
          />
        </div>

        <div style={{ marginTop: 18 }} className="g-heading">
          {t.headings.supportTitle}
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <LinkRow
            label={t.support.customerService}
            icon={<Headset size={18} strokeWidth={2} />}
            onClick={() => (window.location.href = `/p/${token}/support`)}
          />
          <LinkRow
            label={t.support.helpCenter}
            icon={<LifeBuoy size={18} strokeWidth={2} />}
            onClick={() => (window.location.href = `/p/${token}/help-center`)}
          />
          <LinkRow
            label={t.support.feedback}
            icon={<MessageSquareText size={18} strokeWidth={2} />}
            onClick={() => openPanel("support_feedback")}
          />
        </div>
      </div>

      {/* Panel */}
      <div
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: "100dvh",
          transform: panelX,
          transition: "transform 220ms ease",
          background: "var(--background)",
          color: "var(--text)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
          zIndex: 60,
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 56,
            display: "grid",
            gridTemplateColumns: "56px 1fr 56px",
            alignItems: "center",
            borderBottom: "1px solid var(--border)",
            background: "rgba(0,0,0,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label={t.actions.back}
            style={{
              height: 56,
              width: 56,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text)",
            }}
          >
            {ChevronLeft}
          </button>

          <div style={{ textAlign: "center", fontWeight: 900 }}>{modalTitle()}</div>
          <div />
        </div>

        <div style={{ padding: 16, paddingBottom: isFieldPanel ? 88 : 16 }}>
          {/* Field panels */}
          {panel === "email" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, opacity: config.theme.typography.mutedOpacity }}>
                {t.emailLock.verifyEmail}
              </div>

              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {t.emailLock.ifWrongPrefix}
                <a href="" style={{ textDecoration: "underline" }}>
                  {t.emailLock.customerServiceLinkText}
                </a>
              </div>

              <input value={state.guestEmail} disabled style={{ ...inputStyle(), opacity: 0.75 }} />
            </div>
          )}

          {panel === "name" && (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t.placeholders.name}
              style={inputStyle()}
            />
          )}

          {panel === "phone" && (
            <input
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder={t.placeholders.phone}
              style={inputStyle()}
            />
          )}

          {panel === "address" && (
            <div style={{ display: "grid", gap: 10 }}>
              <input
                value={draftStreet}
                onChange={(e) => setDraftStreet(e.target.value)}
                placeholder={t.placeholders.street}
                style={inputStyle()}
              />
              <input
                value={draftPostal}
                onChange={(e) => setDraftPostal(e.target.value)}
                placeholder={t.placeholders.postalCode}
                style={inputStyle()}
              />
              <input
                value={draftCity}
                onChange={(e) => setDraftCity(e.target.value)}
                placeholder={t.placeholders.city}
                style={inputStyle()}
              />
              <input
                value={draftCountry}
                onChange={(e) => setDraftCountry(e.target.value)}
                placeholder={t.placeholders.country}
                style={inputStyle()}
              />
            </div>
          )}

          {/* Support panels (UI-only placeholders) */}
          {panel === "support_customerService" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...sectionCardStyle(), display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {t.supportPanels.customerService.title}
                </div>
                <div style={{ fontSize: 13, opacity: config.theme.typography.mutedOpacity }}>
                  {t.supportPanels.customerService.body}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <SupportActionRow
                  label={t.supportPanels.customerService.links.email}
                  onClick={() => {}}
                />
                <SupportActionRow
                  label={t.supportPanels.customerService.links.phone}
                  onClick={() => {}}
                />
                <SupportActionRow
                  label={t.supportPanels.customerService.links.chat}
                  onClick={() => {}}
                />
              </div>
            </div>
          )}

          {panel === "support_helpCenter" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...sectionCardStyle(), display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {t.supportPanels.helpCenter.title}
                </div>
                <div style={{ fontSize: 13, opacity: config.theme.typography.mutedOpacity }}>
                  {t.supportPanels.helpCenter.body}
                </div>
              </div>

            </div>
          )}

          {panel === "support_feedback" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...sectionCardStyle(), display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  {t.supportPanels.feedback.title}
                </div>
                <div style={{ fontSize: 13, opacity: config.theme.typography.mutedOpacity }}>
                  {t.supportPanels.feedback.body}
                </div>
              </div>

              <textarea
                value={draftFeedback}
                onChange={(e) => setDraftFeedback(e.target.value)}
                placeholder={t.placeholders.feedback}
                style={{
                  minHeight: 140,
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--text)",
                  padding: "12px 14px",
                  outline: "none",
                  fontSize: 14,
                  resize: "none",
                }}
              />

              <button
                type="button"
                className={btnClass}
                onClick={submitFeedback}
                style={{ justifyContent: "center" }}
              >
                {t.supportPanels.feedback.cta}
              </button>
            </div>
          )}
        </div>

        {/* Bottom action bar only for field panels */}
        {isFieldPanel && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              borderTop: "1px solid var(--border)",
              background: "rgba(0,0,0,0.12)",
              backdropFilter: "blur(10px)",
            }}
          >
            <button
              type="button"
              className={btnClass}
              onClick={save}
              disabled={isPending}
              style={{ justifyContent: "center", opacity: isPending ? 0.7 : 1 }}
            >
              {t.actions.done}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={rowStyle()}>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          opacity: 0.95,
          textAlign: "right",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value || "—"}
      </div>
      <div style={{ display: "inline-flex", opacity: 0.9 }}>{ChevronSvg}</div>
    </button>
  );
}

function LinkRow({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={rowStyle({ withIcon: true })}>
      <div style={{ display: "inline-flex", color: "var(--text)" }}>{icon}</div>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{label}</div>
      <div style={{ display: "inline-flex", opacity: 0.9 }}>{ChevronSvg}</div>
    </button>
  );
}

function SupportActionRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={rowStyle({ withIcon: true })}>
      <div style={{ display: "inline-flex", color: "var(--text)" }}>
        <ExternalLink size={18} strokeWidth={2} />
      </div>
      <div style={{ fontSize: 13, opacity: 0.92, fontWeight: 700 }}>{label}</div>
      <div style={{ display: "inline-flex", opacity: 0.9 }}>{ChevronSvg}</div>
    </button>
  );
}