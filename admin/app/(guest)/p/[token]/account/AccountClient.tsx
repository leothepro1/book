"use client";

import { useMemo, useState, useTransition } from "react";
import type { TenantConfig } from "../../../_lib/tenant/types";
import { buttonClass } from "../../../_lib/theme";
import { updateGuestAccount } from "./actions";

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
  <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
    {ChevronSvg}
  </span>
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

function rowStyle(): React.CSSProperties {
  return {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
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
      accountTitle: "Ditt konto",
      supportTitle: "Support",
      name: "Namn",
      email: "Epost",
      phone: "Telefon",
      address: "Adress",
      done: "Klar",
      verifyEmail: "Vi behöver verifiera din epostadress så att du kan använda vår app",
      ifWrongPrefix: "Om uppgifterna är fel, kontakta ",
      customerService: "kundserivice",
      placeholders: {
        name: "Skriv ditt namn",
        phone: "Skriv telefonnummer",
        street: "Gata",
        postalCode: "Postnummer",
        city: "Stad",
        country: "Land",
      },
      supportRow1: "Kontakta kundservice",
      supportRow2: "Vanliga frågor",
    };

    const en = {
      accountTitle: "Your account",
      supportTitle: "Support",
      name: "Name",
      email: "Email",
      phone: "Phone",
      address: "Address",
      done: "Done",
      verifyEmail: "We need to verify your email address so you can use our app",
      ifWrongPrefix: "If the details are incorrect, contact ",
      customerService: "customer service",
      placeholders: {
        name: "Enter your name",
        phone: "Enter phone number",
        street: "Street",
        postalCode: "Postal code",
        city: "City",
        country: "Country",
      },
      supportRow1: "Contact customer service",
      supportRow2: "FAQ",
    };

    return lang === "en" ? en : sv;
  }, [lang]);

  const [state, setState] = useState<AccountState>(initial);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FieldKey | null>(null);
  const [isPending, startTransition] = useTransition();

  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftStreet, setDraftStreet] = useState("");
  const [draftPostal, setDraftPostal] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftCountry, setDraftCountry] = useState("");

  function openField(k: FieldKey) {
    setField(k);

    if (k === "name") setDraftName(`${state.firstName} ${state.lastName}`.trim());
    if (k === "phone") setDraftPhone(state.phone ?? "");
    if (k === "address") {
      setDraftStreet(state.street ?? "");
      setDraftPostal(state.postalCode ?? "");
      setDraftCity(state.city ?? "");
      setDraftCountry(state.country ?? "");
    }

    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTimeout(() => setField(null), 220);
  }

  function modalTitle() {
    if (field === "name") return t.name;
    if (field === "email") return t.email;
    if (field === "phone") return t.phone;
    if (field === "address") return t.address;
    return "";
  }

  function rowValue(k: FieldKey) {
    if (k === "name") return `${state.firstName} ${state.lastName}`.trim() || "—";
    if (k === "email") return state.guestEmail || "—";
    if (k === "phone") return state.phone || "—";
    return prettyAddress(state);
  }

  async function save() {
    if (!field) return;

    startTransition(async () => {
      if (field === "email") {
        close();
        return;
      }

      if (field === "name") {
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

      if (field === "phone") {
        const phone = trim(draftPhone);
        setState((s) => ({ ...s, phone }));

        await updateGuestAccount({ token, tenantId, guestEmail, phone });
      }

      if (field === "address") {
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

  const mainX = open ? "translateX(-22%)" : "translateX(0)";
  const panelX = open ? "translateX(0)" : "translateX(100%)";

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          transform: mainX,
          transition: "transform 220ms ease",
          padding: "14px 17px 24px 17px",
        }}
      >
        <div className="g-heading">{t.accountTitle}</div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <Row label={t.name} value={rowValue("name")} onClick={() => openField("name")} />
          <Row label={t.email} value={rowValue("email")} onClick={() => openField("email")} />
          <Row label={t.phone} value={rowValue("phone")} onClick={() => openField("phone")} />
          <Row label={t.address} value={rowValue("address")} onClick={() => openField("address")} />
        </div>

        <div style={{ marginTop: 18 }} className="g-heading">
          {t.supportTitle}
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <LinkRow label={t.supportRow1} />
          <LinkRow label={t.supportRow2} />
        </div>
      </div>

      <div
        aria-hidden={!open}
        style={{
          position: "absolute",
          inset: 0,
          transform: panelX,
          transition: "transform 220ms ease",
          background: "var(--background)",
          color: "var(--text)",
          borderLeft: "1px solid var(--border)",
          display: "flex",
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
            aria-label="Back"
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

        <div style={{ padding: 16, paddingBottom: 88 }}>
          {field === "email" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, opacity: config.theme.typography.mutedOpacity }}>
                {t.verifyEmail}
              </div>

              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {t.ifWrongPrefix}
                <a href="" style={{ textDecoration: "underline" }}>
                  {t.customerService}
                </a>
              </div>

              <input value={state.guestEmail} disabled style={{ ...inputStyle(), opacity: 0.75 }} />
            </div>
          )}

          {field === "name" && (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t.placeholders.name}
              style={inputStyle()}
            />
          )}

          {field === "phone" && (
            <input
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder={t.placeholders.phone}
              style={inputStyle()}
            />
          )}

          {field === "address" && (
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
        </div>

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
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
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

function LinkRow({ label }: { label: string }) {
  return (
    <button type="button" style={rowStyle()}>
      <div style={{ fontSize: 13, opacity: 0.9 }}>{label}</div>
      <div />
      <div style={{ display: "inline-flex", opacity: 0.9 }}>{ChevronSvg}</div>
    </button>
  );
}
