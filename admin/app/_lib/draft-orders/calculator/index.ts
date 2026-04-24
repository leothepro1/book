/**
 * DraftCalculator barrel — public API for the calculator subsystem.
 *
 * External callers import from `@/app/_lib/draft-orders/calculator` (or
 * the parent `draft-orders` barrel); `core.ts` / `orchestrator.ts` /
 * `types.ts` are private to the module.
 */

export { computeDraftTotalsPure } from "./core";
export {
  computeDraftTotals,
  computeAndPersistDraftTotalsInTx,
} from "./orchestrator";
export {
  buildDiscountEngineInput,
  buildDraftTotalsInput,
  deriveStayWindow,
  resolveLineTaxRateBp,
} from "./context";
export type { RawDraftOrder, RawDraftLineItem } from "./context";
export type {
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineInput,
  DraftTotalsLineBreakdown,
  DraftCalculatorOptions,
} from "./types";
