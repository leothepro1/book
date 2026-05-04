# Session resume — 2026-05-04 pause

**Status vid pause:**
- HEAD `claude/tax-0-recon` = `cc3dfbd` (recon doc only)
- All open PRs synkade med origin
- No uncommitted work in any worktree
- Operator usage running low — pausing to resume next session

---

## Open PRs (awaiting operator + Terminal A action)

| PR | Title | Status | Action needed |
|---|---|---|---|
| **#40** | Tax Engine Master Plan | Open, operator approved Q1-Q7 (all defaults) | **Merge to main** when ready |
| **#41** | Tax-0 recon — foundation schema & helpers | Open, awaiting merge + 3 small follow-up updates | **Merge to main** + minor refinements (see below) |

---

## Terminal A coord response (CAPTURED HERE — chat history will be lost)

Terminal A replied with full ✅ on Tax-0 + 3 specific asks. Verbatim summary:

### A — Tax-0 schema: GO

- ✅ No wait needed
- Latest analytics migration on main: `20260504144722_analytics_phase5a_aggregator`
- No concurrent migration in flight from analytics side
- Phase 5B-equivalent (`feature/analytics-funnel-metrics`) is pure additive logic — zero schema touch
- Namespace `tax_foundation_<timestamp>` then `dual_currency_pricing_<timestamp>` is fine
- **One ask:** Keep both Tax-0 migrations in **same PR** (atomic backfill). DO NOT split into separate merges — would create a window where presentment* columns exist but are NULL on historical rows, requiring analytics tail-reads to special-case.

### B — Analytics wants presentment fields: YES

**Timeline:**
- Post-Tax-0 schema lands → no immediate analytics consumption (single-currency emitters keep working with shop-currency values)
- Post-Tax-4 (Markets) → analytics evolves. Bumping `payment_succeeded` to v0.3.0 with presentment money model + same change to `cart_started` / `cart_updated` / `checkout_started`
- Lag estimate: ~1-2 weeks per event after Tax-4 ships, plus Phase 5B/5C-equivalent on aggregator

**Naming preference (mild):**
- Prefer Shopify's MoneyBag-style nesting: `amount: { shop: { amount, currency }, presentment: { amount, currency } }`
- Vs. flat `shop_amount/shop_currency + presentment_amount/presentment_currency`
- Reason: forces dev to pick which money to sum at every aggregator call-site
- Open to flat if Bedfront convention is mostly flat (it is, in existing schema) — either OK

**Wants handoff doc covering:**
1. When presentment ≠ shop currency
2. Backfill semantics for historical rows (= shop?)
3. Which writers populate presentment vs which read shop-only
4. MoneyBag vs flat decision

### C — Conflicts to flag for Tax-3 and Tax-4

**Tax-3 (commerce wiring) — soft conflict, sequencing-only:**
- `payment_succeeded` analytics event emitted from `app/_lib/orders/process-paid-side-effects.ts`, which Tax-3 will touch
- If Tax-3 changes OrderLineItem shape (e.g. adds TaxLine[] per line, splits net vs. gross), emitter's `line_items[]` mapping needs to know which money to send
- **Ask:** In Tax-3 recon, document new line-item shape + which field is "the" amount (gross-with-tax vs gross-without-tax vs taxable-base) so emitter can update in same PR or sequence v0.3.0 alongside

**Tax-4 (Markets foundation) — bigger touch, needs explicit sequencing:**
- Every storefront event with monetary fields needs presentment-aware schemas (4-5 schemas + validators + parity tests + worker validators per CLAUDE.md analytics worker validator parity rule)
- Funnel-rates derivedMetrics treats currency as single-axis dimension — Tax-4 forces Phase-6-equivalent revisit splitting by `(shop_currency, presentment_currency)` pairs
- **Two sequencing options:**
  - **a (cleanest):** Coordinated landing: Tax-4 lands → Terminal A bumps all storefront/payment events to presentment-aware shapes (~2-3 PRs over 2 weeks) → multi-currency dashboards ship together
  - **b (lag acceptable):** Tax-4 ships first, analytics lags. Acceptable IF `Order.currency` continues to mean shop currency post-Tax-4 (presentment is purely "extra info"). Requires Tax-4 recon to specify: which currency does `Order.currency` mean post-Tax-4?
- **Ask:** When Tax-4 recon lands, ping Terminal A before merging so they can review `Order.currency` semantic decision

---

## What needs to happen next session (in order)

### Step 1 — 3 small doc-updates before #40/#41 merge

Operator asked for "kör A" (alla 3 updates) but session paused before execution. Next session, do these:

**(1) PR #41 (Tax-0 recon) — minimal commit:**
- Q1 status: OPEN (advisory, "2 small migrations") → **LOCKED ("same PR, atomic backfill" per Terminal A ask)**
- §G coord-checklist: add ✅ Terminal A confirmed + their constraints

**(2) PR #40 (master plan) — coord-section refinements:**
- §6 coord-punkt #2 (Tax-3): add explicit line-item-shape spec ask
- §6 coord-punkt #3 (Tax-4): add explicit `Order.currency` semantic decision ask + 2-option sequencing

**(3) New file `_audit/presentment-money-handoff.md`:**
- ~1 page covering Terminal A's 4 questions
- Decision recommendation: **flat at Prisma schema level** (matches existing convention) + **nested at TypeScript service-API level** (matches Shopify, forces dev to pick) + helpers in `_lib/money/` for mapping
- This doc is the cross-team contract — Terminal A consumes it before bumping `payment_succeeded` to v0.3.0

### Step 2 — Merge PR #40 (master plan)

After Step 1 commits land. Master plan becomes canonical reference.

### Step 3 — Merge PR #41 (Tax-0 recon)

After #40 + Step 1 commits. Tax-0 recon becomes the executable spec.

### Step 4 — Tax-0 implementation

Web Claude writes Terminal Claude prompt for Tax-0 implementation. Per recon §B:
- 7 commits, ~600-1000 LOC
- 4 new tax-domain Prisma models
- **One PR with both migrations** (atomic per Terminal A ask)
- Banker's rounding helper + uttömmande tests
- Tax types + enums + provider interface skeleton
- Roadmap update

Estimat: 1-2 dagar Terminal Claude time.

### Step 5 — Tax-1 begins

After Tax-0 mergad. Pure calculator core implementation. Per master plan §5.

---

## Branches at pause

```
main                                    1f5b9cf  (synced; has #35, #37, #38, #36 merged)
claude/initial-setup-JVMgE             stale     (work merged via #35; can be deleted)
claude/draft-orders-7-6-lite           stale     (work merged via #37; can be deleted)
claude/tax-engine-master-plan          7a4812d   (PR #40, awaiting merge)
claude/tax-0-recon                     cc3dfbd   (PR #41, awaiting merge + 3 follow-up updates)
```

Cleanup work (optional, low priority): operator can `git branch -d` the merged stale branches in their book-C worktree.

---

## Quick-resume prompt for next session

When operator returns, paste this to Web Claude:

```
Resuming Tax Engine work. Read _audit/session-2026-05-04-resume.md
for full state. Specifically:
- Terminal A confirmed GO for Tax-0 with 3 specific asks (captured)
- 3 small doc-updates pending before #40/#41 merge:
  1. Lock Q1 in PR #41 to "same PR, atomic backfill"
  2. Add Tax-3 + Tax-4 coord refinements to PR #40 master plan
  3. Write _audit/presentment-money-handoff.md for Terminal A
- Then merge #40 → #41 → write Tax-0 implementation prompt for
  Terminal Claude

Status: HEAD claude/tax-0-recon = cc3dfbd. Branches synced.
No uncommitted work. Ready to resume from Step 1.
```

---

**Session-end note:** All work from today's session is committed and pushed. No uncommitted changes anywhere in the worktree. Operator can close their machine with confidence — picking up next session is one paste away.
