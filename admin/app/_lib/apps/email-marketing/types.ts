/**
 * Email Marketing Platform — Provider-agnostic types.
 *
 * Every email marketing provider (Mailchimp, Klaviyo, Mailerlite)
 * maps their contact format to/from EmailContact.
 * Adding a new provider = one adapter file + one app definition.
 * Zero changes to platform types or sync engine.
 */

import { z } from "zod";

// ── Contact Model ───────────────────────────────────────────────

export const EmailContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  language: z.string().optional(),
  tags: z.array(z.string()),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  subscribed: z.boolean(),
  unsubscribedAt: z.date().optional(),
  guestId: z.string().optional(),
  totalBookings: z.number().int().optional(),
  totalSpend: z.number().int().optional(),
  lastBookingDate: z.string().optional(),
  firstBookingDate: z.string().optional(),
  isVip: z.boolean().optional(),
});

export type EmailContact = z.infer<typeof EmailContactSchema>;

// ── Automation Triggers ─────────────────────────────────────────

export type EmailAutomationTrigger =
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.checked_in"
  | "booking.checked_out"
  | "order.paid"
  | "guest.created";

// ── Provider Adapter Contract ───────────────────────────────────

export type EmailList = {
  id: string;
  name: string;
  memberCount: number;
};

export interface EmailMarketingAdapter {
  readonly provider: string;
  readonly name: string;

  upsertContact(apiKey: string, listId: string, contact: EmailContact): Promise<void>;
  removeContact(apiKey: string, listId: string, email: string): Promise<void>;
  getLists(apiKey: string): Promise<EmailList[]>;
  addTags(apiKey: string, listId: string, email: string, tags: string[]): Promise<void>;
  removeTags(apiKey: string, listId: string, email: string, tags: string[]): Promise<void>;
  trackEvent(apiKey: string, listId: string, email: string, eventName: string, properties: Record<string, unknown>): Promise<void>;
  validateCredentials(apiKey: string): Promise<{ valid: boolean; accountName?: string; error?: string }>;
}

// ── Sync Result ─────────────────────────────────────────────────

export type SyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
};
