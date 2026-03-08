/**
 * AccessPass module — public API.
 *
 * Usage:
 *   import { issuePass, revokePass, validatePassToken, computeEffectiveStatus } from "@/app/_lib/access-pass";
 *   import { listPasses, findPassByIdWithEvents } from "@/app/_lib/access-pass/repo";
 *   import { getRenderer } from "@/app/_lib/access-pass/renderers";
 */

// Core operations
export {
  issuePass,
  revokePass,
  revokePassesByBooking,
  validatePassToken,
  computeEffectiveStatus,
  onPassStateChanged,
} from "./core";

// Types
export type {
  IssuePassInput,
  IssuePassResult,
  RevokePassInput,
  RevokePassResult,
  ValidateTokenInput,
  ValidateTokenResult,
  EffectiveStatus,
  EventContext,
  WalletRenderer,
  PlatformRef,
  ListPassesFilter,
  PassWithEvents,
} from "./types";

export { type AccessPassType, type AccessPassStatus, type AccessPassEventType } from "./types";

// Card design
export {
  getCardDesign,
  upsertCardDesign,
  resolveCardData,
  formatDateRange,
  DEFAULT_CARD_DESIGN,
} from "./card-design";

export type {
  CardDesignConfig,
  CardBackground,
  ResolvedCardData,
  UpsertCardDesignInput,
} from "./card-design";
