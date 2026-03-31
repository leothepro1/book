# Checkout UX — Step-by-Step Flow

Reference document for the checkout user experience.
Two flows exist: **Accommodation** (Elements, 4-step accordion) and **Shop** (Stripe Checkout Session redirect).

---

## Accommodation Flow (`/checkout`)

### Layout

- **Desktop**: 3 columns — back button | steps accordion | sticky order summary (320px)
- **Mobile**: Single column, summary below steps
- **Header**: Tenant logo + shopping bag icon
- **Title**: "Bekräfta och betala"

---

### Step 1: Kontaktuppgifter

**Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| E-post | email | Yes | Email validation |
| Land | select | Yes | 17 countries (SE, NO, DK, FI, DE, GB, NL, FR, ES, IT, AT, CH, PL, BE, PT, US, CA) |
| Förnamn | text | Yes | |
| Efternamn | text | Yes | |
| Adress | text + autocomplete | Yes | Google Places Autocomplete |
| Postnummer | text | Yes | |
| Stad | text | Yes | |

**Validation behavior:**
- Errors show only for "touched" fields (dirty + blurred, OR submit attempted)
- On submit attempt: all errors shown at once
- Tabbing through empty fields shows nothing initially

**Input styling:**
- Floating label (Airbnb-style) — label animates up on fill
- 53px height, 8px border-radius, 1px solid #d7d7d7
- Focus: border-color #1a1a1a, border-width 2px
- Error: border-color #c13515, outline 1px solid #c13515
- Error message slides in (max-height 0→40px, 0.25s ease-out)

**Navigation:** "Nasta" button, validates all fields before advancing.

---

### Step 2: Valj hur du vill betala

**Options:**
1. **Full betalning** — "Betala [AMOUNT] kr nu"
2. **Klarna** (if enabled) — "Betala over tid med Klarna" + "Mer information" link

**UI:** Radio button selection, full-width buttons, circle with animated dot.

**Navigation:**
- Full → advances to Step 3
- Klarna → skips Step 3, marks 2+3 complete, jumps to Step 4
- Changing payment type clears clientSecret and resets steps 3+4

---

### Step 3: Lagg till betalningsmetod

**Only shown for paymentType === "full"** (skipped for Klarna).

**Payment methods (accordion, one open at a time):**

1. **Kort (Kredit- eller betalkort)**
   - Stripe Elements: Card Number, Expiry, CVC
   - Cardholder name (optional)
   - Card brand logos: Visa, Mastercard, Amex
   - Brand icon appears on right when number detected
   - Floating labels on each field

2. **PayPal** — Redirect-based, shows info text

3. **Google Pay** — Only if `canMakePayment()` succeeds

4. **Apple Pay** — Only if `canMakePayment()` succeeds

**Loading state:** Skeleton shimmer loaders (3 placeholder cards, 1.4s animation) while clientSecret loads.

**Accordion transitions:** 0fr→1fr grid morph, opacity fade 0.18s–0.22s.

**Navigation:** "Nasta" button → Step 4.

---

### Step 4: Granska din bokning

**Content:**
- Terms text: "Genom att trycka pa knappen godkanner jag dessa bokningsvillkor."
- "Bokningsvillkor" is a link → opens Terms modal

**Confirm button text (varies by method):**
| Method | Button text |
|--------|------------|
| Card | "Bekrafta och betala" |
| PayPal | "Betala med [PayPal icon]" |
| Klarna | "Fortsatt till Klarna" |
| Google/Apple Pay | Branded Payment Request button |

**On confirm:**
1. Calls `POST /api/checkout/update-guest` (saves guest info to Order)
2. Confirms payment via Stripe (`confirmCardPayment`, `confirmPayPalPayment`, etc.)
3. Shows "Behandlar..." (Processing) during confirmation
4. On success → redirect to `/checkout/success?orderId={orderId}`

**Error state:** Red box (#dc2626) above button with error message.

---

### Step Navigation & States

**Visual per step:**
- **Active**: Shadow, expanded body, transparent border
- **Completed**: Summary text slides in below title, "Andra" (Edit) button fades in
- **Collapsed**: Border returns to #ddd, no shadow

**Morphing transition:** Old step collapses while new expands simultaneously, 200ms stagger, content fades in (opacity 0→1), grid-template-rows 0fr→1fr over 0.25s ease-out.

---

### Order Summary (right column, sticky)

1. Product image (97x80px, 10px radius) + title
2. Divider
3. Datum — formatted Swedish dates ("Ons 1 – Tors 5 juli")
4. Divider
5. Gaster — "2 vuxna" / "1 vuxen"
6. Divider
7. Price breakdown — nights x nightly price, subtotal, taxes
8. Divider
9. **Totalt** — bold, larger font, formatted with currency
10. "Prisspecifikation" link → detailed breakdown modal

**Desktop:** Sticky (top: 3rem), max-content height.
**Mobile:** Full width, static, top border instead of left.

---

## Modals

| Modal | Trigger | Content |
|-------|---------|---------|
| Prisspecifikation | "Prisspecifikation" link in summary | Nights x rate, taxes, total |
| Bokningsvillkor | Terms link in Step 4 | TenantPolicy HTML or fallback |
| Klarna info | "Mer information" in Step 2 | Klarna logo, description, legal links |

---

## Shop/Cart Flow (`/shop/checkout`)

Simpler flow — no multi-step accordion:
1. Cart validated server-side
2. Creates Order + Stripe Checkout Session in one API call (`POST /api/checkout/create`)
3. Redirects to Stripe-hosted payment page
4. On success → `/shop/checkout/success?session_id={sessionId}`

---

## Success Page (`/checkout/success`)

**Two states:**

| State | Icon | Title | Content |
|-------|------|-------|---------|
| PENDING | schedule (amber) | "Betalning bekraftas..." | "Vi verifierar din betalning. Du far en bekraftelse via e-post strax." |
| PAID | check_circle (green) | "Tack for din bokning!" | Order number, summary, dates, guests, total, email confirmation message, "Ga till mitt konto" CTA |

---

## API Routes

| Route | When | Purpose |
|-------|------|---------|
| `POST /api/checkout/payment-intent` | After Step 2 | Creates Order + PaymentIntent, returns clientSecret |
| `POST /api/checkout/update-guest` | Before Step 4 confirm | Saves guest name/email/phone to Order |
| `POST /api/checkout/create` | Shop flow | Creates Order + Checkout Session, returns redirect URL |

---

## CSS

**File:** `checkout.css` (1321 lines), namespace `.co` prefix.

Key classes:
- `.co-header` — header
- `.co__back-col`, `.co__main-col`, `.co__summary-col` — columns
- `.co__steps`, `.co__step` — accordion
- `.co__float`, `.co__float-input`, `.co__float-label` — floating inputs
- `.co__methods`, `.co__method` — payment methods accordion
- `.co__card-inputs`, `.co__stripe-wrap` — card form
- `.co__summary-*` — order summary
- `com__*` — modal styles

---

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `app/(guest)/checkout/CheckoutClient.tsx` | 1357 | Main checkout component |
| `app/(guest)/checkout/page.tsx` | — | Server route, resolves prices |
| `app/(guest)/checkout/success/page.tsx` | — | Success page |
| `app/(guest)/checkout/CheckoutModal.tsx` | — | Modal for terms/breakdown/Klarna |
| `app/(guest)/checkout/checkout.css` | 1321 | All checkout styling |
| `app/(guest)/checkout/checkout-modal.css` | — | Modal overlay styling |
