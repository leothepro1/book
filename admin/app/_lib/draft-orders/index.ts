/**
 * DraftOrders — public barrel.
 *
 * External callers import from `@/app/_lib/draft-orders`; internal helpers
 * stay private to the domain files. Mirrors the `companies/` pattern.
 */

// ── Calculator subsystem (FAS 6.4) ──
export {
  computeDraftTotalsPure,
  computeDraftTotals,
  computeAndPersistDraftTotalsInTx,
} from "./calculator";
export type {
  DraftTotals,
  DraftTotalsInput,
  DraftTotalsLineInput,
  DraftTotalsLineBreakdown,
  DraftCalculatorOptions,
} from "./calculator";

// ── Foundation (FAS 6.5A) ──
export { nextDraftDisplayNumber } from "./sequence";
export {
  createDraftOrderEvent,
  createDraftOrderEventInTx,
} from "./events";
export type { DraftEventType, DraftEventActorSource } from "./events";
export { DRAFT_TRANSITIONS, canTransition } from "./state-machine";

// ── Shared types (FAS 6.5A) ──
export * from "./types";

// ── Services (FAS 6.5A) ──
export { createDraft } from "./create";
export { addLineItem, updateLineItem, removeLineItem } from "./lines";

// ── Services (FAS 6.5B) ──
export {
  applyDiscountCode,
  removeDiscountCode,
  previewApplyDiscountCode,
} from "./discount";
export { freezePrices } from "./lifecycle";

// ── Services (FAS 6.5C) ──
export {
  placeHoldForDraftLine,
  releaseHoldForDraftLine,
  placeHoldsForDraft,
  DEFAULT_DRAFT_HOLD_DURATION_MS,
} from "./holds";
export { HOLD_TRANSITIONS, canHoldTransition } from "./state-machine";

// ── Services (FAS 6.5D) ──
export { sendInvoice, cancelDraft } from "./lifecycle";
export { convertDraftToOrder } from "./convert";

// ── Services (FAS 6.5E) ──
export { sweepExpiredDrafts } from "./expire";
export type { SweepResult, SweepExpiredDraftsOptions } from "./expire";
