# Analytics pipeline — worker validator parity rule

The Phase 3 web pixel runtime worker uses hand-rolled validators
because Zod 4 cannot tree-shake under the worker bundle's 30 KB
gzipped budget (Zod's locale and JSON-Schema modules are non-tree-
shakeable namespace re-exports — Phase 3 PR-B Commit E measured the
overshoot at 2×). Each storefront event schema in
`app/_lib/analytics/pipeline/schemas/` has a paired `.validator.ts`
file:

```
schemas/page-viewed.ts            (Zod, server)
schemas/page-viewed.validator.ts  (hand-rolled, worker)
```

`schemas/validator-parity.test.ts` enforces lockstep — every test
fixture runs through BOTH the Zod schema AND the hand-rolled
validator and asserts agreement on the `ok` outcome. Drift breaks
the build.

---

## If you add a storefront event

1. Create `<event>.ts` (Zod schema) AND `<event>.validator.ts`
   (hand-rolled). Both required. The verifier in `verify-phase3.ts`
   greps for unpaired files and fails the build.
2. Add the event to `schemas/validator-parity.test.ts`'s `PARITY_CASES`
   with at least 6 fixtures (1 canonical valid + 5 invalid, one per
   required field).
3. Wire into `runtime/worker-validate.ts`'s `STOREFRONT_VALIDATORS`
   map and update `runtime/worker-types.ts` `STOREFRONT_EVENT_NAMES`.

## If you change a field's validation rule

Mirror the change on both sides in the same commit. CI will catch
drift but that's the backstop, not the workflow.

---

## Deletion condition

If a future Zod 4.x release tree-shakes cleanly to ≤25 KB gzipped,
delete every `.validator.ts` and the parity test, and switch the
worker back to importing Zod schemas directly. Verify with
`npm run build:analytics-runtime` after the upgrade.
