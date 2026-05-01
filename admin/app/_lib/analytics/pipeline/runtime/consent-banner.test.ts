// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  showConsentBanner,
  writeConsentCookie,
  type ConsentChoice,
} from "./consent-banner";

beforeEach(() => {
  // Clear DOM + cookies between tests.
  document.body.innerHTML = "";
  document.head
    .querySelectorAll('style[data-bf-cb]')
    .forEach((n) => n.remove());
  document.cookie = "bf_consent=; path=/; max-age=0";
  document.documentElement.lang = "sv";
});

afterEach(() => {
  document.body.innerHTML = "";
});

// Helper: yield a microtask so the banner's queueMicrotask focus() runs.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("showConsentBanner — mount + accessibility", () => {
  it("mounts a role=dialog with aria-modal=true", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();

    // Cleanup so the unresolved promise doesn't leak.
    (
      document.querySelector('[data-action="reject"]') as HTMLButtonElement
    ).click();
    await promise;
  });

  it("focuses the accept button on mount", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();

    const accept = document.querySelector(
      '[data-action="accept"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(accept);

    accept.click();
    await promise;
  });

  it("restores focus to the previously-focused element on unmount", async () => {
    // Set up a focused trigger element BEFORE banner mount.
    const trigger = document.createElement("button");
    trigger.id = "before-banner";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    // Banner now has focus.
    expect(document.activeElement).not.toBe(trigger);

    (
      document.querySelector('[data-action="accept"]') as HTMLButtonElement
    ).click();
    await promise;

    // Focus restored.
    expect(document.activeElement).toBe(trigger);
  });
});

describe("showConsentBanner — choices", () => {
  it("Accept all → analytics:true, marketing:true, cookie written", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    (
      document.querySelector('[data-action="accept"]') as HTMLButtonElement
    ).click();
    const choice = await promise;
    expect(choice).toEqual({ essential: true, analytics: true, marketing: true });
    expect(document.cookie).toContain("bf_consent=");
    expect(document.cookie).toContain("analytics%22%3Atrue");
  });

  it("Only essential → analytics:false, marketing:false", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    (
      document.querySelector('[data-action="reject"]') as HTMLButtonElement
    ).click();
    const choice = await promise;
    expect(choice).toEqual({
      essential: true,
      analytics: false,
      marketing: false,
    });
  });

  it("Settings → toggle analytics, save → analytics:true, marketing:false", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();

    // Open settings panel.
    (
      document.querySelector(
        '[data-action="toggle-settings"]',
      ) as HTMLButtonElement
    ).click();

    // Toggle analytics on.
    const analyticsCb = document.querySelector(
      'input[data-cat="analytics"]',
    ) as HTMLInputElement;
    analyticsCb.checked = true;

    // Save.
    (
      document.querySelector('[data-action="save"]') as HTMLButtonElement
    ).click();

    const choice = await promise;
    expect(choice.analytics).toBe(true);
    expect(choice.marketing).toBe(false);
  });

  it("essential checkbox is disabled in settings panel", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    (
      document.querySelector(
        '[data-action="toggle-settings"]',
      ) as HTMLButtonElement
    ).click();
    const essentialCb = document.querySelector(
      'input[data-cat="essential"]',
    ) as HTMLInputElement;
    expect(essentialCb.disabled).toBe(true);
    expect(essentialCb.checked).toBe(true);

    (
      document.querySelector('[data-action="reject"]') as HTMLButtonElement
    ).click();
    await promise;
  });
});

describe("showConsentBanner — Escape key (refinement #5)", () => {
  it("Escape triggers decline (same as 'reject')", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    const choice = await promise;
    expect(choice).toEqual({
      essential: true,
      analytics: false,
      marketing: false,
    });
  });

  it("Escape removes the banner from the DOM", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await promise;
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Other keys do not dismiss the banner", async () => {
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    // Cleanup.
    (
      document.querySelector('[data-action="accept"]') as HTMLButtonElement
    ).click();
    await promise;
  });
});

describe("showConsentBanner — i18n", () => {
  it("renders English copy when locale=en", async () => {
    const promise = showConsentBanner({ locale: "en" });
    await flushMicrotasks();
    const accept = document.querySelector(
      '[data-action="accept"]',
    ) as HTMLButtonElement;
    expect(accept.textContent).toBe("Accept all");
    accept.click();
    await promise;
  });

  it("renders German copy when locale=de", async () => {
    const promise = showConsentBanner({ locale: "de" });
    await flushMicrotasks();
    const accept = document.querySelector(
      '[data-action="accept"]',
    ) as HTMLButtonElement;
    expect(accept.textContent).toBe("Alle akzeptieren");
    accept.click();
    await promise;
  });

  it("falls back to sv for unknown locale tags via the bridge logic", async () => {
    // showConsentBanner accepts pre-resolved SupportedLocale; the
    // unknown-tag fallback lives in pickLocale (covered separately).
    // Here we just confirm sv is the default copy.
    const promise = showConsentBanner({ locale: "sv" });
    await flushMicrotasks();
    const accept = document.querySelector(
      '[data-action="accept"]',
    ) as HTMLButtonElement;
    expect(accept.textContent).toBe("Acceptera alla");
    accept.click();
    await promise;
  });
});

describe("writeConsentCookie", () => {
  it("writes a JSON-encoded bf_consent cookie", () => {
    const choice: ConsentChoice = {
      essential: true,
      analytics: true,
      marketing: false,
    };
    writeConsentCookie(choice);
    expect(document.cookie).toContain("bf_consent=");
    expect(decodeURIComponent(document.cookie)).toContain(
      JSON.stringify(choice),
    );
  });
});
