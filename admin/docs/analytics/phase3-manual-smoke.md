# Phase 3 PR-B — Manual smoke checklist

The verify-phase3.ts verifier covers static checks + worker contract via direct
module import. The actual `new Worker()` spawn, browser `sendBeacon` fallback,
DNT/EEA decision matrix, and CSS-variable-themed banner rendering all live in
the browser. This doc is the manual-smoke gate that has to pass on the Vercel
preview before PR-B can merge.

The PR description must include a copy of the checklist below with each box
ticked. Each ticked box corresponds to a screenshot, cURL paste, or DevTools
panel dump filed in the PR comment thread.

---

## Setup (do once)

1. Find the Vercel preview URL on the PR. Note both:
   - the `*.vercel.app` preview URL
   - the `<slug>.<base>.com` custom-domain URL (if attached to this preview)
2. Open in a fresh incognito window — guarantees no `bf_consent` cookie from a
   prior session.
3. Open DevTools → Network panel, set "Preserve log".
4. Open DevTools → Application → Cookies for the storefront origin.

---

## Checklist (20 items)

### A. Initial paint and consent banner

- [ ] **1.** Banner renders within 1 second of first paint on a stay page
      (`/stay/<slug>`). Screenshot the dialog.
- [ ] **2.** Banner uses `var(--text)` and `var(--background)` from the
      tenant's theme. Confirm by toggling the theme in another tab and
      reloading — banner colors follow.
- [ ] **3.** No POST to `/api/analytics/collect` is in the Network panel
      before the visitor clicks any banner button.
- [ ] **4.** `bf_consent` cookie is **absent** in Application → Cookies before
      the banner is dismissed.

### B. Consent decision tree

- [ ] **5.** Click "Acceptera alla". Cookie now reads
      `{"essential":true,"analytics":true,"marketing":true}`. Banner dismissed.
- [ ] **6.** A `POST /api/analytics/collect` fires. Response is `204 No Content`.
      Paste the cURL of the request body — must match `RequestEnvelopeSchema`
      (event_id is a 26-char ULID, schema_version is `0.1.0`, occurred_at is
      ISO 8601 with offset).
- [ ] **7.** Open a new incognito window. Click "Endast nödvändiga". Cookie
      reads `analytics:false`. Confirm NO POST fires after clicking — including
      across a navigation to another page.
- [ ] **8.** Open another incognito window. Press **Escape** in the banner.
      Cookie reads `analytics:false` (escape = decline). Banner removed.
      Focus returns to the previously-focused element (or `<body>` if none).
- [ ] **9.** With DNT enabled in the browser (Firefox: about:config →
      `privacy.donottrackheader.enabled = true`; Brave: shields → ANL on):
      reload, accept consent, navigate. **No** POSTs fire — DNT trumps consent.

### C. Storefront events

- [ ] **10.** Navigate to a stay page. `accommodation_viewed` POST fires with
      a 204. Inspect payload — `accommodation_id` is the slug, `accommodation_type`
      is one of `hotel|cabin|camping|apartment|pitch`.
- [ ] **11.** Use the search widget. `availability_searched` POST fires with
      a 204. `check_in_date` and `check_out_date` are `YYYY-MM-DD`,
      `number_of_guests` ≥ 1, `filters_applied` is an array.
- [ ] **12.** Add accommodation to cart. `cart_started` POST fires (first add)
      with `cart_id`, `accommodation_id`, `cart_total`. Confirm `cart_total.amount`
      is in ören (integer; e.g. 12900 for 129 SEK).
- [ ] **13.** Add a second item. `cart_updated` POST fires with
      `action:"added"`, correct `items_count`.
- [ ] **14.** Click "Till kassa". `checkout_started` POST fires with
      `items_count` ≥ 1 and matching `cart_total`.

### D. Reliability path

- [ ] **15.** During a fast double-click in the cart, multiple `cart_updated`
      POSTs fire. Each has a unique `event_id` (ULID). Run
      `gh api ...` (or visit the orders DB) to confirm only one outbox row
      per `event_id` (UNIQUE constraint).
- [ ] **16.** Close the tab during an in-flight event (e.g. mid-search).
      Reopen DevTools → Network → "Pending" filter shows the dispatch
      attempt completed via `sendBeacon` (Initiator column = "beacon").
- [ ] **17.** Slow the connection to "Slow 3G" in DevTools. Trigger a
      `page_viewed`. Worker round-trip + dispatch completes within a few
      seconds. No console errors.

### E. Cache + asset delivery

- [ ] **18.** Reload the page. Network panel for `runtime.<hash>.js`:
      `Cache-Control: public, max-age=31536000, immutable` and
      `Cross-Origin-Resource-Policy: same-origin`.
- [ ] **19.** Request `runtime-manifest.json` directly (open the URL).
      `Cache-Control: public, max-age=60, must-revalidate` and
      `Cross-Origin-Resource-Policy: same-origin`.
- [ ] **20.** A second build cycle (push a no-op commit, let Vercel rebuild)
      produces a different hashed runtime URL in `__bedfront_runtime`.
      Browsers fetching the old hashed URL get a 404 (cache-bust works
      because the URL changed).

---

## Cross-tenant isolation spot check

After completing the 20 items above, repeat **#5–#7** on a *different*
tenant's storefront. Confirm:

- The session_id is different from the first tenant's session_id (different
  sessionStorage namespace per tab/origin).
- The `Origin` header on `POST /api/analytics/collect` matches the new
  tenant's slug — no leak.
- The `bf_consent` cookie is NOT shared across origins (Apelviken's accept
  doesn't auto-accept on a second tenant).

---

## Legacy analytics coexistence verification

Open DevTools → Network. The PR-B pixel is intentionally running in parallel
with the legacy `AnalyticsProvider` (server-side `track()` to v1 endpoint).
Both should fire on every page navigation:

- [ ] **PR-B path:** `POST /api/analytics/collect` returning 204
- [ ] **Legacy path:** `POST /api/...` (the v1 endpoint) returning 2xx

Both present = coexistence holds. If the legacy path is missing, that is
**not** a PR-B failure — it means legacy was already broken pre-PR. File
separately.

Cutover removes legacy in Phase 5. Do not delete `AnalyticsProvider` in PR-B.

---

## Failure protocol

Any unticked box blocks PR-B merge. Treat each failure as one of:

- **Bug in PR-B** — fix on the PR branch, push, retest.
- **Pre-existing infrastructure issue** — file as separate ticket, NOT a
  PR-B blocker (with reproduction steps and a link from this checklist).
- **Vercel preview specifically** — try the second preview deploy (Vercel
  occasionally gets a deploy in a half-broken state). If it persists, escalate.

The PR description must include the completed list with checkboxes filled.
Untickable items get a note explaining why.
