/**
 * Gift Card Creation
 * ══════════════════
 *
 * Creates the GiftCard row when a PURCHASE order is paid.
 * Called ONLY from the Stripe webhook handler — never from routes directly.
 *
 * Code generation:
 *   Format: XXXX-XXXX-XXXX-XXXX
 *   Alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0, 1, I, O — avoid ambiguity)
 *   Collision-safe: up to 5 retries on unique constraint violation
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { GiftCard } from "@prisma/client";

// ── Code generation ─────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_GROUP_LENGTH = 4;
const CODE_GROUPS = 4;
const MAX_CODE_RETRIES = 5;

function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let group = "";
    for (let c = 0; c < CODE_GROUP_LENGTH; c++) {
      const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
      group += CODE_ALPHABET[idx];
    }
    groups.push(group);
  }
  return groups.join("-");
}

// ── Gift card creation ──────────────────────────────────────────

export type CreateGiftCardParams = {
  orderId: string;
  tenantId: string;
  designId: string | null;
  amount: number;          // ören
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  message: string;
  scheduledAt: Date;
};

/**
 * Creates a GiftCard linked to a paid order.
 *
 * - Generates a unique XXXX-XXXX-XXXX-XXXX code (5 retry attempts on collision)
 * - Sets status to ACTIVE if scheduledAt is now or in the past (within 1 min)
 * - Sets status to PENDING if scheduledAt is in the future (cron will activate it)
 * - initialAmount and balance are both set to amount — initialAmount is immutable
 *
 * Throws on failure — caller (webhook handler) catches and logs.
 */
export async function createGiftCard(params: CreateGiftCardParams): Promise<GiftCard> {
  const {
    orderId,
    tenantId,
    designId,
    amount,
    recipientEmail,
    recipientName,
    senderName,
    message,
    scheduledAt,
  } = params;

  // Determine initial status: if scheduledAt is now or past (within 1 min), activate immediately
  const isImmediate = scheduledAt.getTime() <= Date.now() + 60_000;
  const status = isImmediate ? "ACTIVE" : "PENDING";

  // Retry loop for code collision (@@unique([tenantId, code]))
  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    const code = generateCode();

    try {
      const giftCard = await prisma.giftCard.create({
        data: {
          tenantId,
          orderId,
          code,
          designId,
          initialAmount: amount,
          balance: amount,
          status,
          recipientEmail,
          recipientName,
          senderName,
          message: message || null,
          scheduledAt,
          sentAt: null,
          expiresAt: null,
        },
      });

      log("info", "gift-card.created", {
        giftCardId: giftCard.id,
        orderId,
        tenantId,
        code,
        amount,
        status,
        immediate: isImmediate,
      });

      return giftCard;
    } catch (err) {
      // Check if this is a unique constraint violation on code
      const isUniqueViolation =
        err instanceof Error &&
        err.message.includes("Unique constraint failed");

      if (isUniqueViolation && attempt < MAX_CODE_RETRIES) {
        log("warn", "gift-card.code_collision", {
          tenantId,
          orderId,
          attempt,
          code,
        });
        continue; // Retry with new code
      }

      // Not a collision or max retries exhausted — rethrow
      throw err;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error(`Failed to generate unique gift card code after ${MAX_CODE_RETRIES} attempts`);
}
