/**
 * Phase 3 PR-B Commit G — Consent banner (vanilla DOM, pre-hydration).
 *
 * Mounted by `loader.ts` when the consent decision is `prompt` (no
 * cookie + EEA + !DNT). Returns a Promise that resolves to the
 * visitor's choice; the loader writes the cookie based on that choice
 * and re-evaluates whether to spawn the worker.
 *
 * Accessibility (refinement #5):
 *   - role="dialog", aria-modal="true", aria-labelledby/aria-describedby
 *   - On mount: capture document.activeElement, focus first button
 *   - On unmount: restore focus to the captured element
 *   - Escape key triggers the same flow as "Endast nödvändiga"
 *     (decline) — standard dialog UX expectation
 *   - All interactive elements are buttons / inputs (no role="link"
 *     on clickables)
 *
 * Visual styling: inline `<style>` block scoped via a fresh class
 * prefix. Reads CSS variables from `:root` (`--background`, `--text`,
 * `--button-bg`, `--button-fg`, `--font-body`) so the banner matches
 * the active theme without needing the theme provider to hydrate.
 *
 * TODO post-Phase-3: theme-aware banner variant, exposed as a
 * theme-system block so tenants can edit copy + button labels in the
 * admin editor. Tracked in Phase 3.x — see CLAUDE.md analytics
 * pipeline notes.
 */

import {
  consentStrings,
  pickLocale,
  type SupportedLocale,
} from "./consent-banner-i18n";

export interface ConsentChoice {
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

const CSS_PREFIX = "bf-cb"; // bedfront consent banner
const CONSENT_COOKIE = "bf_consent";
const COOKIE_MAX_AGE_DAYS = 180;

// ── Style ───────────────────────────────────────────────────────────

const STYLE = `
.${CSS_PREFIX}-overlay {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 2147483646;
  display: flex;
  justify-content: center;
  pointer-events: none;
  font-family: var(--font-body, system-ui, -apple-system, Segoe UI, Roboto, Arial);
}
.${CSS_PREFIX}-card {
  pointer-events: auto;
  background: var(--background, #fff);
  color: var(--text, #171717);
  border: 1px solid color-mix(in srgb, var(--text, #171717) 12%, transparent);
  border-radius: 12px;
  box-shadow: 0 12px 32px color-mix(in srgb, var(--text, #171717) 18%, transparent);
  margin: 16px;
  padding: 20px;
  max-width: 520px;
  width: 100%;
  font-size: 14px;
  line-height: 1.45;
}
.${CSS_PREFIX}-title { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
.${CSS_PREFIX}-body  { margin: 0 0 14px; opacity: 0.85; }
.${CSS_PREFIX}-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.${CSS_PREFIX}-btn {
  font: inherit; font-weight: 500; cursor: pointer; padding: 9px 14px;
  border-radius: 8px; border: 1px solid color-mix(in srgb, var(--text, #171717) 18%, transparent);
  background: transparent; color: var(--text, #171717);
}
.${CSS_PREFIX}-btn--primary {
  background: var(--button-bg, #111827);
  color: var(--button-fg, #ffffff);
  border-color: transparent;
}
.${CSS_PREFIX}-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.${CSS_PREFIX}-settings {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--text, #171717) 10%, transparent);
}
.${CSS_PREFIX}-row {
  display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px;
}
.${CSS_PREFIX}-row label { font-weight: 500; font-size: 13px; cursor: pointer; }
.${CSS_PREFIX}-row p { font-size: 12px; opacity: 0.7; margin: 2px 0 0; }
.${CSS_PREFIX}-row input[type="checkbox"] { margin-top: 4px; }
`;

// ── Cookie helper ───────────────────────────────────────────────────

export function writeConsentCookie(choice: ConsentChoice): void {
  const value = encodeURIComponent(JSON.stringify(choice));
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// ── DOM helpers ─────────────────────────────────────────────────────

function el<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── Banner mount ────────────────────────────────────────────────────

export interface ShowConsentBannerOptions {
  /** Override locale detection. Useful in tests. */
  locale?: SupportedLocale;
  /** Override DOM root. Defaults to `document.body`. */
  mountInto?: HTMLElement;
}

/**
 * Mounts the consent banner and returns a Promise that resolves with
 * the visitor's choice. Caller is responsible for writing the cookie
 * (or letting `writeConsentCookie` do it — `showConsentBanner` writes
 * automatically before resolving).
 */
export function showConsentBanner(
  opts: ShowConsentBannerOptions = {},
): Promise<ConsentChoice> {
  const locale =
    opts.locale ?? pickLocale(document.documentElement.lang || "sv");
  const t = consentStrings(locale);
  const root = opts.mountInto ?? document.body;

  return new Promise<ConsentChoice>((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const styleTag = el("style");
    styleTag.textContent = STYLE;
    styleTag.dataset.bfCb = "1";
    document.head.appendChild(styleTag);

    const overlay = el("div", `${CSS_PREFIX}-overlay`);
    const card = el("div", `${CSS_PREFIX}-card`);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", `${CSS_PREFIX}-title`);
    card.setAttribute("aria-describedby", `${CSS_PREFIX}-body`);

    const title = el("h2", `${CSS_PREFIX}-title`, t.title);
    title.id = `${CSS_PREFIX}-title`;
    const body = el("p", `${CSS_PREFIX}-body`, t.body);
    body.id = `${CSS_PREFIX}-body`;

    const actions = el("div", `${CSS_PREFIX}-actions`);
    const acceptBtn = el(
      "button",
      `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn--primary`,
      t.acceptAll,
    );
    acceptBtn.type = "button";
    acceptBtn.dataset.action = "accept";
    const rejectBtn = el("button", `${CSS_PREFIX}-btn`, t.rejectAll);
    rejectBtn.type = "button";
    rejectBtn.dataset.action = "reject";
    const settingsBtn = el("button", `${CSS_PREFIX}-btn`, t.settings);
    settingsBtn.type = "button";
    settingsBtn.dataset.action = "toggle-settings";

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    actions.appendChild(settingsBtn);

    // Settings panel — hidden until expanded.
    const settingsPanel = el("div", `${CSS_PREFIX}-settings`);
    settingsPanel.style.display = "none";
    settingsPanel.appendChild(buildToggleRow("essential", t.essentialLabel, t.essentialDescription, true, true));
    settingsPanel.appendChild(buildToggleRow("analytics", t.analyticsLabel, t.analyticsDescription, false, false));
    settingsPanel.appendChild(buildToggleRow("marketing", t.marketingLabel, t.marketingDescription, false, false));
    const saveBtn = el(
      "button",
      `${CSS_PREFIX}-btn ${CSS_PREFIX}-btn--primary`,
      t.save,
    );
    saveBtn.type = "button";
    saveBtn.dataset.action = "save";
    settingsPanel.appendChild(saveBtn);

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    card.appendChild(settingsPanel);
    overlay.appendChild(card);
    root.appendChild(overlay);

    function unmount(choice: ConsentChoice): void {
      writeConsentCookie(choice);
      overlay.remove();
      styleTag.remove();
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the previously-focused element (if it's still
      // in the DOM; storefront pages don't typically tear down between
      // banner mount and dismissal, but guard against the edge).
      try {
        if (previouslyFocused && document.contains(previouslyFocused)) {
          previouslyFocused.focus();
        }
      } catch {
        /* tolerable — banner is the priority, focus restore is best-effort */
      }
      resolve(choice);
    }

    function readToggles(): ConsentChoice {
      const analytics = (settingsPanel.querySelector(
        `input[data-cat="analytics"]`,
      ) as HTMLInputElement | null)?.checked ?? false;
      const marketing = (settingsPanel.querySelector(
        `input[data-cat="marketing"]`,
      ) as HTMLInputElement | null)?.checked ?? false;
      return { essential: true, analytics, marketing };
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        unmount({ essential: true, analytics: false, marketing: false });
      }
    }
    document.addEventListener("keydown", onKeyDown);

    acceptBtn.addEventListener("click", () => {
      unmount({ essential: true, analytics: true, marketing: true });
    });
    rejectBtn.addEventListener("click", () => {
      unmount({ essential: true, analytics: false, marketing: false });
    });
    settingsBtn.addEventListener("click", () => {
      const visible = settingsPanel.style.display !== "none";
      settingsPanel.style.display = visible ? "none" : "block";
      settingsBtn.setAttribute("aria-expanded", String(!visible));
    });
    saveBtn.addEventListener("click", () => {
      unmount(readToggles());
    });

    // Focus first button (accept) — primary action gets initial focus.
    // queueMicrotask defer keeps tests deterministic by letting the
    // mount complete before the focus call runs.
    queueMicrotask(() => acceptBtn.focus());
  });
}

function buildToggleRow(
  cat: "essential" | "analytics" | "marketing",
  label: string,
  description: string,
  defaultChecked: boolean,
  locked: boolean,
): HTMLDivElement {
  const row = el("div", `${CSS_PREFIX}-row`);
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = defaultChecked;
  cb.disabled = locked;
  cb.dataset.cat = cat;
  cb.id = `${CSS_PREFIX}-cat-${cat}`;
  const labelWrap = el("div");
  const lbl = el("label", undefined, label);
  lbl.setAttribute("for", cb.id);
  const desc = el("p", undefined, description);
  labelWrap.appendChild(lbl);
  labelWrap.appendChild(desc);
  row.appendChild(cb);
  row.appendChild(labelWrap);
  return row;
}
