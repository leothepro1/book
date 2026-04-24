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
