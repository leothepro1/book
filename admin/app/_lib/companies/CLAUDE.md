# Companies — B2B "Företag"

Shopify Companies pattern. A `Company` has many `CompanyLocation`s
(billing addresses / cost centres). A `CompanyContact` represents a
human's membership in a company. `CompanyLocationAccess` is the
binary grant connecting a contact to a specific location.

> Public API: import only from `@/app/_lib/companies` (the barrel).

---

## 3-layer contact model (FAS 5.5 — current)

```
Company
   │
   ├─ CompanyLocation (1..n)        ← billing identity, payment terms, store credit
   │     │
   │     └─ CompanyLocationAccess   ← binary grant: contact ↔ location
   │              │
   │              ↓
   └─ CompanyContact (1..n)         ← per-company membership
            (contact may be in multiple companies)
```

**Important historical note:** the legacy `CompanyLocationContact` surface
is gone. `ContactRole`, `LocationPermission`, and `ROLE_PERMISSIONS` were
deleted with FAS 5.5 — access is binary. If you find old code referencing
those types, it is dead and needs migration.

---

## Buyer kind handoff

When a Draft Order has `buyerKind: "COMPANY"`:
- `companyLocationId` is required on createDraft
- `companyContactId` is optional (the human authorising)
- `taxesIncluded` defaults to `false` (B2B prices ex-VAT)
- `paymentTerms` resolved from `CompanyLocation.paymentTerms`

See `_lib/draft-orders/CLAUDE.md` for the draft-side contract.

---

## Catalog assignment

`catalog.ts` + `catalog-assignment.ts` — companies can have a custom
catalog (subset of products + price overrides). Resolution priority:

  Location-level catalog → Company-level catalog → Tenant default

Catalog assignments are stored as relations, not JSON. Adding a product
to a catalog is `prisma.catalogProduct.create({ catalogId, productId })`.

---

## Store credit

`store-credit.ts` — append-only ledger per `CompanyLocation`.
Every issuance, consumption, expiration, manual adjustment is a
`StoreCreditTransaction` row. The location's balance is computed by sum
— never stored as a denormalised counter (avoids drift bugs).

Reasons:
  ISSUED · CONSUMED · EXPIRED · MANUAL_ADJUSTMENT · REFUND

Issuance via `issueCredit(locationId, amount, reason, actorUserId)` is
the ONLY mutation entry point. Consumption happens automatically via
`applyStoreCredit()` at draft-order convert time.

---

## Payment terms

`payment-terms.ts` — net-N day terms per location (NET_7, NET_15, NET_30, NET_60).
Persisted on `CompanyLocation.paymentTerms`. Used by the draft-order
pipeline to compute invoice `dueAt`.

---

## Public API surface

```typescript
import {
  // Company
  createCompany, getCompany, listCompanies, updateCompany, archiveCompany,
  // Location
  createLocation, getLocation, listLocations, updateLocation, deleteLocation,
  // Contact
  // (in contact.ts)
  // Store credit
  getStoreCreditBalance, listTransactionsForLocation, issueCredit,
  // Orders
  // (in orders.ts — list orders for a company/location)
  // Payment terms
  // (in payment-terms.ts)
} from "@/app/_lib/companies";
```

Internal helpers (events, location-access, error-messages) stay private.

---

## Key files

- Public barrel: `app/_lib/companies/index.ts`
- Types: `app/_lib/companies/types.ts`
- Company CRUD: `app/_lib/companies/company.ts`
- Location CRUD: `app/_lib/companies/location.ts`
- Contact: `app/_lib/companies/contact.ts`
- Location access: `app/_lib/companies/location-access.ts`
- Store credit ledger: `app/_lib/companies/store-credit.ts`
- Payment terms: `app/_lib/companies/payment-terms.ts`
- Catalog + assignment: `app/_lib/companies/catalog.ts`, `catalog-assignment.ts`
- Orders by company: `app/_lib/companies/orders.ts`
- Events (audit): `app/_lib/companies/events.ts`
- Error messages (Swedish): `app/_lib/companies/error-messages.ts`
- Admin UI: `app/(admin)/customers/` (companies surfaces)

---

## Dependencies

- `_lib/draft-orders` — buyerKind: "COMPANY" path
- `_lib/orders` — orders.ts joins on Order.companyLocationId
- `_lib/discounts` — segment targeting can reference company catalog members
- `_lib/email` — invoice rendering uses CompanyLocation billing identity

---

## Companies invariants — never violate

1. Public API is the barrel only — never import from internal files outside the domain
2. `CompanyLocationContact` legacy table is gone — never reintroduce role-based access
3. Access is binary — `CompanyLocationAccess` row exists or it doesn't
4. Store credit balance is COMPUTED from the ledger — never stored as a column
5. `issueCredit()` is the ONLY mutation entry to store credit — direct table writes are bugs
6. Catalog resolution priority is Location → Company → Tenant — never inline custom logic
7. All amounts in BigInt ören — never floats
8. Payment terms enum is fixed (NET_7/15/30/60) — adding requires migration + schema change
9. Archive (soft delete) on Company — never hard delete; orders + drafts retain history
10. A contact can be in multiple companies — never assume `userId → company` is 1:1
