# Inngest setup

Inngest is the durable execution platform we use for the analytics
pipeline (the outbox drainer in Phase 1B), and will host other
event-driven workflows in later phases (campaign automation, PMS
reliability, email retry escalation, etc.).

This document covers the Phase 1A scaffolding only — the client, the
serve handler, environment variables, and how to develop / deploy.
Function authoring conventions land with Phase 1B.

## Architecture at a glance

```
operational tx ── COMMIT ──→ signalAnalyticsFlush() ──→ Inngest event
                                                         │
                                                         ▼
                                                 (Phase 1B) drainer
                                                         │
                                                         ▼
                                                analytics.event
```

- **Client:** `inngest/client.ts` — typed event map, `id: "bedfront"`.
- **Serve handler:** `app/api/inngest/route.ts` — runtime `nodejs`,
  registers the function list. Phase 1A registers `[]`.

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `INNGEST_EVENT_KEY` | production | Inngest Cloud writes this key when you install the Vercel integration. Identifies which Inngest environment receives `inngest.send(...)` calls. |
| `INNGEST_SIGNING_KEY` | production | Used by the serve handler to verify that incoming POSTs really come from Inngest Cloud. Set automatically by the Vercel integration. |
| `INNGEST_DEV` | development | Set to `"1"` to point the SDK at the local Inngest dev server (`http://localhost:8288`) instead of Inngest Cloud. Without it, the SDK in dev tries to talk to Cloud and `inngest.send(...)` is a no-op against an unsigned request. |

Production `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are NOT
hand-rolled. The Vercel integration writes them on install and rotates
them automatically. Do not set them manually in `vercel.json`.

## Local development

```bash
# In one terminal: run the Bedfront app
npm run dev

# In another terminal: run the Inngest dev server
npx inngest-cli@latest dev
```

The Inngest dev server listens on `http://localhost:8288` and
auto-discovers the Bedfront app at `http://localhost:3000/api/inngest`.
Open `http://localhost:8288` to see registered functions, sent events,
and triggered runs.

`INNGEST_DEV=1` in `.env` (or `.env.local`) is the switch that tells
`inngest.send(...)` calls to route to the dev server instead of Cloud.

## Vercel deploy

1. Install the Inngest Vercel integration from the Vercel marketplace.
2. Connect it to the `apelvikenbooking` project.
3. The integration writes `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
   to the project's environment variables (Production + Preview).
4. On every deploy, the integration's post-build hook calls the app's
   `/api/inngest` PUT endpoint. Inngest Cloud syncs the function list
   from there.

Preview deployments (`feature/*` branches) get their own Inngest
preview environment automatically — events sent from a preview branch
land in a separate sandbox, not in the production Inngest environment.

## Why `serve({ client, functions })` and not `inngest.createFunction`

`createFunction` defines a function's trigger + handler. `serve` is the
HTTP adapter that exposes a list of those functions to Inngest Cloud /
the dev server. The client is shared across both — every function
references the same `inngest` instance so that event types, app id, and
auth credentials stay consistent across the app.

Phase 1A: `serve({ client: inngest, functions: [] })` — the route exists
so the integration can sync, but no functions are registered yet.
Phase 1B will register the drainer.

## Out of scope for Phase 1A

- Drainer function definition
- Cron-triggered functions (Inngest's `cron` step or Vercel cron fallback)
- Sentry-Inngest middleware (`@sentry/inngest`) — defer until Phase 1B
  has actual function spans worth tracing
- Per-tenant rate limiting / concurrency keys — Phase 5+
