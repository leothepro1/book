/**
 * Email Module — Public API
 * ═════════════════════════
 *
 * All consumers import from '@/app/_lib/email' — never from subfiles.
 */

export {
  type EmailEventType,
  type EmailEventDefinition,
  EMAIL_EVENT_REGISTRY,
  getEventDefinition,
} from "./registry";

export { resendClient } from "./client";

export { sendEmailEvent } from "./send";

export type {
  EmailTemplateOverride,
  ResolvedEmailTemplate,
} from "./types";

export {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";
