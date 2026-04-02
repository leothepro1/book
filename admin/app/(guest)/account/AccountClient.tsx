"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import { CheckoutModal } from "../checkout/CheckoutModal";

// ── Types ────────────────────────────────────────────────────────

interface GuestAccount {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  verifiedEmail: boolean;
  emailMarketingState: string;
}

interface AccountClientProps {
  tenantName: string;
  guestAccount: GuestAccount;
  bookingCount: number;
  orderCount: number;
  pageStyles?: Record<string, string>;
}

// ── Main component ──────────────────────────────────────────────

export default function AccountClient({
  tenantName,
  guestAccount,
  bookingCount,
  orderCount,
  pageStyles,
}: AccountClientProps) {
  const [logoutPending, startLogoutTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Live state — updated after successful save
  const [account, setAccount] = useState(guestAccount);

  // Apply server-rendered page styles
  useEffect(() => {
    if (!rootRef.current || !pageStyles) return;
    for (const [varName, value] of Object.entries(pageStyles)) {
      rootRef.current.style.setProperty(varName, value);
    }
  }, [pageStyles]);

  // Live CSS variable updates from editor (checkin-css-update postMessage)
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "checkin-css-update" && e.data.vars && rootRef.current) {
        const fontFamilies: string[] = [];
        for (const [varName, value] of Object.entries(e.data.vars)) {
          rootRef.current.style.setProperty(varName, value as string);
          if (varName.startsWith("--font-") && typeof value === "string") {
            const family = value.split(",")[0].trim();
            if (family) fontFamilies.push(family);
          }
        }
        if (fontFamilies.length > 0) {
          const params = fontFamilies
            .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
            .join("&");
          const url = `https://fonts.googleapis.com/css2?${params}&display=swap`;
          if (fontLinkRef.current) {
            fontLinkRef.current.href = url;
          } else {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = url;
            document.head.appendChild(link);
            fontLinkRef.current = link;
          }
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (fontLinkRef.current) {
        fontLinkRef.current.remove();
        fontLinkRef.current = null;
      }
    };
  }, []);

  const displayName = [account.firstName, account.lastName]
    .filter(Boolean)
    .join(" ") || "Inget namn angivet";

  function handleLogout() {
    startLogoutTransition(async () => {
      try {
        await fetch("/api/guest-auth/logout", { method: "POST" });
      } catch { /* best-effort */ }
      window.location.href = "/login";
    });
  }

  function handleSaved(updated: Partial<GuestAccount>) {
    setAccount((prev) => ({ ...prev, ...updated }));
    setEditOpen(false);
  }

  return (
    <div ref={rootRef} className="acc">
      <div className="acc__container">
        {/* Header */}
        <div className="acc__header">
          <h1 className="acc__title">Mitt konto</h1>
        </div>

        {/* Customer info card */}
        <div className="acc__card">
          <div className="acc__card-header">
            <p className="acc__card-name">{displayName}</p>
            <button
              type="button"
              className="acc__card-edit"
              onClick={() => { setEditKey((k) => k + 1); setEditOpen(true); }}
              aria-label="Redigera profil"
            >
              <span className="material-symbols-rounded" aria-hidden="true">edit</span>
            </button>
          </div>
          <div className="acc__card-row">
            <div className="acc__card-field">
              <span className="acc__card-label">E-post</span>
              <span className="acc__card-value">{account.email}</span>
            </div>
            <div className="acc__card-field">
              <span className="acc__card-label">Telefonnummer</span>
              <span className="acc__card-value">{account.phone || "Inget telefonnummer angivet"}</span>
            </div>
          </div>
        </div>

        {/* Orders link */}
        <Link href="/account/orders" className="acc__card acc__card-link">
          <div className="acc__card-link-text">
            <span className="acc__card-link-title">Mina ordrar</span>
            <span className="acc__card-link-count">{orderCount} {orderCount === 1 ? "order" : "ordrar"}</span>
          </div>
          <span className="material-symbols-rounded acc__card-link-chevron" aria-hidden="true">chevron_right</span>
        </Link>

        {/* Logout */}
        <button
          type="button"
          className="acc__logout"
          onClick={handleLogout}
          disabled={logoutPending}
        >
          {logoutPending ? "Loggar ut..." : "Logga ut"}
        </button>
      </div>

      {/* Edit profile modal */}
      <EditProfileModal
        key={editKey}
        open={editOpen}
        account={account}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}

// ── Edit profile modal ──────────────────────────────────────────

function EditProfileModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: GuestAccount;
  onClose: () => void;
  onSaved: (updated: Partial<GuestAccount>) => void;
}) {
  const [firstName, setFirstName] = useState(account.firstName ?? "");
  const [lastName, setLastName] = useState(account.lastName ?? "");
  const [marketing, setMarketing] = useState(account.emailMarketingState === "SUBSCRIBED");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const handleSave = useCallback(() => {
    setError(false);
    startTransition(async () => {
      try {
        const payload: Record<string, string> = {
          emailMarketingState: marketing ? "SUBSCRIBED" : "NOT_SUBSCRIBED",
        };
        // Send trimmed values; send field even if empty so DB clears it
        payload.firstName = firstName.trim();
        payload.lastName = lastName.trim();

        const res = await fetch("/api/guest-auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const { account: saved } = await res.json();
          // Update parent state with server-confirmed values
          onSaved({
            firstName: saved.firstName,
            lastName: saved.lastName,
            name: saved.name,
            emailMarketingState: saved.emailMarketingState,
          });
        } else if (res.status === 429) {
          setError(true);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    });
  }, [firstName, lastName, marketing, onSaved]);

  return (
    <CheckoutModal open={open} onClose={onClose} title="Redigera profil">
      <div className="acc-modal__body">
        <div className="acc-modal__row">
          <div className="co__float" data-filled={firstName ? "" : undefined}>
            <input
              className="co__float-input"
              placeholder="Förnamn"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isPending}
            />
            <span className="co__float-label">Förnamn</span>
          </div>
          <div className="co__float" data-filled={lastName ? "" : undefined}>
            <input
              className="co__float-input"
              placeholder="Efternamn"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isPending}
            />
            <span className="co__float-label">Efternamn</span>
          </div>
        </div>

        <div className="co__float" data-filled="">
          <input
            className="co__float-input"
            placeholder="E-post"
            value={account.email}
            readOnly
            style={{ background: "#f5f5f5", color: "#717171" }}
          />
          <span className="co__float-label">E-post</span>
        </div>

        <div
          className="acc-modal__checkbox"
          role="checkbox"
          aria-checked={marketing}
          tabIndex={0}
          onClick={() => { if (!isPending) setMarketing((m) => !m); }}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!isPending) setMarketing((m) => !m); } }}
        >
          <div className={`acc-modal__check${marketing ? " acc-modal__check--active" : ""}`}>
            <span className="material-symbols-rounded acc-modal__check-icon" aria-hidden="true">check</span>
          </div>
          <span className="acc-modal__checkbox-text">Skicka mig nyheter och erbjudanden via e-post</span>
        </div>

        {error && (
          <p className="acc-modal__error">Något gick fel. Försök igen.</p>
        )}
      </div>

      <div className="acc-modal__footer">
        <button
          type="button"
          className="acc-modal__btn acc-modal__btn--cancel"
          onClick={onClose}
          disabled={isPending}
        >
          Avbryt
        </button>
        <button
          type="button"
          className="acc-modal__btn acc-modal__btn--save"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Sparar..." : "Spara"}
        </button>
      </div>
    </CheckoutModal>
  );
}
