# Apps platform

Shopify-style app store. Apps are platform-installable extensions that
add channels, ad pixels, marketing automation, and operational tools.
Apps are **defined in code** (manifest in `definitions/`), the database
stores **installations** (`TenantApp`), not definitions.

---

## Architecture

```
definitions/<slug>.ts   → AppDefinition (manifest, scopes, setup steps)
                            ↓ registerApp() at module load
registry (in-memory)    → getApp(id), getAllApps(), getSalesChannelByHandle()
                            ↓
TenantApp (DB row)      → installation state: scopes, credentials, status
```

The registry Map is module-level, populated synchronously at boot. Never
access `registry` directly from outside `registry.ts` — always use
`getApp()` / `getAllApps()`.

---

## App categories

  marketing  · sales  · analytics  · channels  · crm  · operations  · finance

`SetupRequirement` flags an app as needing PMS or payments configured
before it can install. The wizard enforces this gate.

---

## Setup wizard step types

  oauth          OAuth redirect (Google, Meta)
  api_key        API key / token input
  account_select List fetched after auth — user picks an account
  webhook        Platform registers webhook at provider
  config         Toggles, selects, settings
  review         Summary before activation — ALWAYS the last step

Adding a step type requires a renderer in `app/(admin)/apps/setup/`.

---

## Permissions

`AppPermission` is the granular scope set:

  orders:read · orders:write · bookings:read · bookings:write
  guests:read · guests:write · products:read · analytics:read
  accommodations:read · accommodations:write

Apps declare required scopes in their manifest. The setup wizard shows
the buyer the scope list before install. Server-side enforcement runs in
the relevant route — never trust the manifest at runtime, always check
`TenantApp.scopes` against the action being performed.

---

## Credentials encryption

`settings-crypto.ts` — AES-256-GCM, same key (`INTEGRATION_ENCRYPTION_KEY`)
as the PMS adapter layer. Credentials never leave the server. The admin
UI shows masked values (`••••••••`) and re-prompts on edit.

---

## App webhooks

`webhooks.ts` — apps that push data outward (e.g. order channel-out)
register webhook subscriptions on install. Outgoing webhooks use
`resilientFetch()` with `service: "<app-id>-webhook"` and 10s timeout.

`channel-orders.ts` — bidirectional sync for sales-channel apps
(Booking.com, Expedia, etc.). Uses the same reliability inbox/outbox
pattern as PMS — see `_lib/integrations/reliability/CLAUDE.md`.

---

## Built-in app definitions

`definitions/` ships these manifests:

  google-ads       — conversion tracking + audience sync (oauth)
  meta-ads         — pixel + Conversions API (oauth)
  mailchimp        — list sync + automations (api_key)
  email-marketing  — generic provider abstraction (registry under `email-marketing/`)
  spot-booking     — visual map + spot-level inventory (`spot-booking/`)
  booking-com      — channel manager (sales-channel slot)
  expedia          — channel manager (sales-channel slot)
  guest-crm        — internal app (always-on, no install flow)
  revenue-analytics — internal app

Sales-channel apps have a unique `salesChannel.handle` and surface in the
storefront context as a separate fulfilment channel.

---

## Billing

`billing.ts` — pricing tier per app (`free` | `grow` | `pro`). The platform
enforces tier gating at install time and surfaces upgrade prompts when a
tenant tries to install an app above their current plan tier.

---

## Health

`health.ts` exposes per-installation health (last successful sync, error
counts, OAuth token age). Surfaces in admin "Apps → installed" UI.

---

## Key files

- Public types: `app/_lib/apps/types.ts`
- Registry: `app/_lib/apps/registry.ts`
- App definitions: `app/_lib/apps/definitions/`
- Credentials encryption: `app/_lib/apps/settings-crypto.ts`
- Channel orders sync: `app/_lib/apps/channel-orders.ts`
- Webhook subscriptions: `app/_lib/apps/webhooks.ts`
- Wizard logic: `app/_lib/apps/wizard.ts`
- Billing tier check: `app/_lib/apps/billing.ts`
- Adapter implementations: `app/_lib/apps/email-marketing/`,
  `app/_lib/apps/google-ads/`, `app/_lib/apps/meta-ads/`,
  `app/_lib/apps/spot-booking/`
- Admin UI: `app/(admin)/apps/`

---

## Apps invariants — never violate

1. App definitions live in code — DB only stores `TenantApp` installations
2. `getApp()` and `getAllApps()` are the ONLY entry points to the registry
3. Duplicate app IDs throw at boot — IDs are permanent and unique
4. Server-side scope check on every privileged action — never trust manifest
5. App credentials encrypted with `INTEGRATION_ENCRYPTION_KEY` — never logged
6. All outgoing HTTP from apps uses `resilientFetch()` (see `observability/CLAUDE.md`)
7. Channel-out apps use the reliability inbox/outbox pattern (see `integrations/reliability/CLAUDE.md`)
8. The "review" step is always last in the setup wizard
9. Adding a setup step type requires a wizard renderer — type added in isolation breaks UI
10. Sales-channel handles are globally unique across apps
