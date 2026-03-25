# Stripe Connect Setup — Bedfront Payments

## Platform webhook (already configured)

Endpoint: `https://[domain]/api/webhooks/stripe`

Events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`

## Connect webhook (required for direct charges)

In Stripe Dashboard → **Connect → Webhooks**, add:

Endpoint: `https://[domain]/api/webhooks/stripe`

Events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

After adding, copy the signing secret and set:

```
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

The adapter detects Connect events via the `stripe-account` header
and uses the correct secret for signature verification.

## Application fee

Platform fee is taken automatically on every direct charge via
`application_fee_amount` on the PaymentIntent.

Fee is calculated in `_lib/payments/platform-fee.ts`.

Current rates:
| Plan  | Fee  |
|-------|------|
| BASIC | 5.0% |
| GROW  | 4.0% |
| PRO   | 3.5% |

To change default rates: update `PLAN_FEE_BPS` in `platform-fee.ts`.

To override per tenant: set `Tenant.platformFeeBps` in the database.

Fee is snapshotted on `Order.platformFeeBps` at checkout time for audit.

## Account creation

Tenants are created as **Standard** connected accounts.
They manage their own Stripe Dashboard (payouts, bank accounts, disputes).
Bedfront manages onboarding links and application fees only.
