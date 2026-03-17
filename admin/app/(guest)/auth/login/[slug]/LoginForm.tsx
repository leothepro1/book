"use client";

import { useState, useTransition } from "react";
import { requestMagicLink } from "@/app/_lib/magic-link/request";

export default function LoginForm({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestMagicLink(tenantId, email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error ?? "Något gick fel. Försök igen.");
      }
    });
  }

  if (sent) {
    return (
      <div className="magic-login">
        <div className="magic-login__card">
          <h1 className="magic-login__title">{tenantName}</h1>
          <div className="magic-login__success">
            <p className="magic-login__message">
              Vi har skickat en inloggningslänk till <strong>{email}</strong>.
            </p>
            <p className="magic-login__hint">Kolla din inkorg.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="magic-login">
      <div className="magic-login__card">
        <h1 className="magic-login__title">{tenantName}</h1>
        <p className="magic-login__subtitle">
          Ange din e-postadress för att logga in på gästportalen.
        </p>
        <form onSubmit={handleSubmit} className="magic-login__form">
          <label htmlFor="email" className="magic-login__label">
            E-postadress
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="din@email.se"
            className="magic-login__input"
            disabled={isPending}
          />
          {error && <p className="magic-login__error">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="magic-login__button"
          >
            {isPending ? "Skickar..." : "Skicka inloggningslänk"}
          </button>
        </form>
      </div>
    </div>
  );
}
