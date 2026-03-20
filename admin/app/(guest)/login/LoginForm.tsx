"use client";

import { useState, useRef, useCallback, useEffect, useTransition } from "react";
import "../_components/guest-header.css";
import { LOGIN_LANGUAGES, LOGIN_STRINGS, type LoginLocale } from "./locales";

// ── Props ────────────────────────────────────────────────────────

interface LoginFormProps {
  tenantName: string;
  logoUrl: string | null;
  logoWidth: number;
  privacyHtml: string | null;
}

type Step = "email" | "otp";

// ── Main component ──────────────────────────────────────────────

export default function LoginForm({ tenantName, logoUrl, logoWidth, privacyHtml }: LoginFormProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [langOpen, setLangOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [locale, setLocale] = useState<LoginLocale>("sv");
  const rootRef = useRef<HTMLDivElement>(null);

  const t = LOGIN_STRINGS[locale];

  // Live CSS variable updates from the editor
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

  const currentLangLabel = LOGIN_LANGUAGES.find((l) => l.code === locale)?.nativeName ?? "Svenska";

  const content = step === "otp" ? (
    <OtpStep
      email={email}
      tenantName={tenantName}
      locale={locale}
      onBack={() => { setStep("email"); setError(null); }}
    />
  ) : (
    <>
      <h1 className="otp-login__title">{t.emailTitle}</h1>
      <p className="otp-login__subtitle">{t.emailSubtitle}</p>
      <form
        className="otp-login__form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/guest-auth/request-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              if (res.status === 429) {
                setError(t.errorRateLimit);
                return;
              }
              if (!res.ok) {
                setError(t.errorGeneric);
                return;
              }
              setStep("otp");
            } catch {
              setError(t.errorGeneric);
            }
          });
        }}
      >
        <label htmlFor="otp-email" className="otp-login__label">
          {t.emailLabel}
        </label>
        <input
          id="otp-email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="otp-login__input"
          disabled={isPending}
        />
        <ErrorSlide message={error} />
        <button
          type="submit"
          disabled={isPending}
          className="otp-login__button"
        >
          {isPending ? t.emailSubmitting : t.emailSubmit}
        </button>
      </form>
    </>
  );

  return (
    <div ref={rootRef} className="otp-login__layout">
      <header className="otp-login__header">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={tenantName}
            className="otp-login__logo"
            style={{ width: logoWidth, maxWidth: "100%" }}
          />
        ) : (
          <span className="otp-login__header-name">{tenantName}</span>
        )}

        <button
          type="button"
          className="otp-login__lang-trigger"
          onClick={() => setLangOpen(true)}
        >
          {currentLangLabel}
        </button>
      </header>

      <main className="otp-login__content">
        {content}
      </main>

      <footer className="otp-login__footer">
        <button
          type="button"
          className="otp-login__privacy-link"
          onClick={() => setPrivacyOpen(true)}
        >
          {t.privacyPolicy}
        </button>
      </footer>

      <LanguagePanel
        open={langOpen}
        onClose={() => setLangOpen(false)}
        currentLang={locale}
        onSelect={(code) => { setLocale(code as LoginLocale); setLangOpen(false); }}
      />

      <ContentPanel
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title={t.privacyPolicy}
        html={privacyHtml}
      />
    </div>
  );
}

// ── Language panel (reuses lang-panel CSS from guest-header) ─────

function LanguagePanel({
  open,
  onClose,
  currentLang,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  currentLang: string;
  onSelect: (code: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const onDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    isDragging.current = true;
    if (panelRef.current) panelRef.current.style.transition = "none";

    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current || !panelRef.current) return;
      const y = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = Math.max(0, y - dragStartY.current);
      panelRef.current.style.transform = `translateY(${delta}px)`;
    };

    const onEnd = (e: TouchEvent | MouseEvent) => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);

      if (!panelRef.current) return;
      panelRef.current.style.transition = "";

      const y = "changedTouches" in e ? e.changedTouches[0].clientY : e.clientY;
      const delta = y - dragStartY.current;

      if (delta > 80) {
        onClose();
      } else {
        panelRef.current.style.transform = "";
      }
    };

    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  }, [onClose]);

  const sorted = [...LOGIN_LANGUAGES].sort((a, b) => {
    if (a.code === currentLang) return -1;
    if (b.code === currentLang) return 1;
    return 0;
  });

  return (
    <>
      <div
        className={`lang-panel-overlay${open ? " lang-panel-overlay--open" : ""}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`lang-panel${open ? " lang-panel--open" : ""}`}
        role="dialog"
        aria-modal={open}
        aria-label="Välj språk"
      >
        <div
          className="lang-panel__handle"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientY); }}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <div className="lang-panel__handle-bar" />
        </div>
        <ul className="lang-panel__list">
          {sorted.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                className="lang-panel__item"
                onClick={() => onSelect(lang.code)}
              >
                <span className="lang-panel__label">{lang.nativeName}</span>
                {lang.code === currentLang && (
                  <span className="material-symbols-rounded lang-panel__check" aria-hidden="true">
                    check
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ── Content panel (privacy policy — same bottom sheet as language) ──

function ContentPanel({
  open,
  onClose,
  title,
  html,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  html: string | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const onDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    isDragging.current = true;
    if (panelRef.current) panelRef.current.style.transition = "none";

    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current || !panelRef.current) return;
      const y = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = Math.max(0, y - dragStartY.current);
      panelRef.current.style.transform = `translateY(${delta}px)`;
    };

    const onEnd = (e: TouchEvent | MouseEvent) => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);

      if (!panelRef.current) return;
      panelRef.current.style.transition = "";

      const y = "changedTouches" in e ? e.changedTouches[0].clientY : e.clientY;
      const delta = y - dragStartY.current;

      if (delta > 80) {
        onClose();
      } else {
        panelRef.current.style.transform = "";
      }
    };

    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  }, [onClose]);

  return (
    <>
      <div
        className={`lang-panel-overlay${open ? " lang-panel-overlay--open" : ""}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`lang-panel${open ? " lang-panel--open" : ""}`}
        role="dialog"
        aria-modal={open}
        aria-label={title}
        style={{ maxHeight: "85vh" }}
      >
        <div
          className="lang-panel__handle"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientY); }}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <div className="lang-panel__handle-bar" />
        </div>
        <div style={{ padding: "0 16px 24px", overflowY: "auto", flex: 1 }}>
          <h2 style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--text)",
            fontFamily: "var(--font-heading), inherit",
            margin: "0 0 16px",
          }}>
            {title}
          </h2>
          {html ? (
            <div
              className="otp-login__policy-content"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.6 }}>
              Ingen policy har konfigurerats ännu.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Error slide (same pattern as check-in cards) ────────────────

function ErrorSlide({ message }: { message: string | null }) {
  const visible = !!message;
  return (
    <div className={`otp-login__error-slide ${visible ? "otp-login__error-slide--visible" : "otp-login__error-slide--hidden"}`}>
      <div className="otp-login__error">
        <span className="material-symbols-rounded otp-login__error-icon" aria-hidden="true">report</span>
        <span>{message}</span>
      </div>
    </div>
  );
}

// ── OTP step ────────────────────────────────────────────────────

const OTP_LENGTH = 6;

function OtpStep({
  email,
  tenantName,
  locale,
  onBack,
}: {
  email: string;
  tenantName: string;
  locale: LoginLocale;
  onBack: () => void;
}) {
  const t = LOGIN_STRINGS[locale];
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const updateDigit = useCallback((index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDigits(Array(OTP_LENGTH).fill(""));
    inputRefs.current[0]?.focus();
  }, []);

  const handleInput = useCallback(
    (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val.length > 1) {
        const pasted = val.replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (pasted.length > 0) {
          setDigits((prev) => {
            const next = [...prev];
            for (let i = 0; i < OTP_LENGTH; i++) {
              next[i] = pasted[i] ?? "";
            }
            return next;
          });
          const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
          inputRefs.current[focusIdx]?.focus();
        }
        return;
      }
      const digit = val.replace(/\D/g, "");
      updateDigit(index, digit);
      if (digit && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [updateDigit],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        updateDigit(index - 1, "");
        inputRefs.current[index - 1]?.focus();
        e.preventDefault();
      }
    },
    [digits, updateDigit],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (!pasted) return;
      setDigits((prev) => {
        const next = [...prev];
        for (let i = 0; i < OTP_LENGTH; i++) {
          next[i] = pasted[i] ?? "";
        }
        return next;
      });
      const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const code = digits.join("");
      if (code.length !== OTP_LENGTH) return;
      setError(null);
      startTransition(async () => {
        try {
          const res = await fetch("/api/guest-auth/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code }),
          });
          if (res.ok) {
            const data = await res.json();
            window.location.href = data.redirectTo ?? "/";
            return;
          }
          if (res.status === 401) {
            setError(t.errorWrongCode);
            clearAll();
            return;
          }
          setError(t.errorInvalidCode);
          clearAll();
        } catch {
          setError(t.errorGeneric);
        }
      });
    },
    [digits, email, clearAll, t],
  );

  const allFilled = digits.every((d) => d !== "");

  return (
    <>
      <h1 className="otp-login__title">{t.otpTitle}</h1>
      <p className="otp-login__subtitle">{t.otpSubtitle(email)}</p>
      <form className="otp-login__form" onSubmit={handleSubmit}>
        <div className="otp-login__code-group">
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={OTP_LENGTH}
              value={digits[i]}
              onChange={(e) => handleInput(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              disabled={isPending}
              className="otp-login__code-input"
              aria-label={`${i + 1} / ${OTP_LENGTH}`}
            />
          ))}
        </div>
        <ErrorSlide message={error} />
        <button
          type="submit"
          disabled={isPending || !allFilled}
          className="otp-login__button"
        >
          {isPending ? t.otpSubmitting : t.otpSubmit}
        </button>
        <button type="button" className="otp-login__back" onClick={onBack}>
          {t.otpBack}
        </button>
      </form>
    </>
  );
}
