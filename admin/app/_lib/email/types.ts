/**
 * Email Module Types
 * ══════════════════
 *
 * Shared type definitions for the email notification system.
 * Re-exports registry types for convenience — all consumers
 * import from '@/app/_lib/email', never from subfiles.
 */

export type { EmailEventType, EmailEventDefinition } from "./registry";

/** Shape of the DB row as returned from Prisma */
export interface EmailTemplateOverride {
  id: string;
  tenantId: string;
  eventType: string;
  subject: string | null;
  previewText: string | null;
  html: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fully merged result ready to send — all fields resolved, never null */
export interface ResolvedEmailTemplate {
  subject: string;
  previewText: string;
  html: string;
  from: string;
}
