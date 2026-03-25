/**
 * Stripe Payout Integration
 * ═════════════════════════
 *
 * Wrappers for Stripe Connect payout-related APIs.
 * All calls use Connect params ({ stripeAccount }).
 */

import { getStripe } from "./client";

// ── Types ───────────────────────────────────────────────────────

export type PayoutBankAccount = {
  last4: string;
  bankName: string | null;
  currency: string;
  country: string;
};

export type PayoutSchedule = {
  interval: "daily" | "weekly" | "monthly" | "manual";
  weeklyAnchor?: string;   // e.g. "monday"
  monthlyAnchor?: number;  // e.g. 1 = 1st of month
  delayDays: number;
};

export type PayoutInfo = {
  bankAccount: PayoutBankAccount | null;
  schedule: PayoutSchedule;
};

export type PayoutItem = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;   // Unix timestamp
  created: number;       // Unix timestamp
  description: string | null;
};

export type PayoutScheduleInput = {
  interval: "daily" | "weekly" | "monthly" | "manual";
  weeklyAnchor?: string;
  monthlyAnchor?: number;
};

// ── Payout Info ─────────────────────────────────────────────────

/**
 * Fetches bank account and payout schedule for a connected account.
 */
export async function fetchPayoutInfo(
  stripeAccountId: string,
): Promise<PayoutInfo> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);

  // Extract first external account (bank account)
  let bankAccount: PayoutBankAccount | null = null;

  const extAccounts = account.external_accounts;
  if (extAccounts && "data" in extAccounts && extAccounts.data.length > 0) {
    const first = extAccounts.data[0];
    if (first.object === "bank_account") {
      bankAccount = {
        last4: first.last4 ?? "****",
        bankName: first.bank_name ?? null,
        currency: (first.currency ?? "sek").toUpperCase(),
        country: first.country ?? "SE",
      };
    }
  }

  // Extract payout schedule
  const scheduleData = account.settings?.payouts?.schedule;
  const schedule: PayoutSchedule = {
    interval: (scheduleData?.interval as PayoutSchedule["interval"]) ?? "daily",
    delayDays: scheduleData?.delay_days ?? 2,
    ...(scheduleData?.weekly_anchor
      ? { weeklyAnchor: scheduleData.weekly_anchor }
      : {}),
    ...(scheduleData?.monthly_anchor
      ? { monthlyAnchor: scheduleData.monthly_anchor }
      : {}),
  };

  return { bankAccount, schedule };
}

// ── Recent Payouts ──────────────────────────────────────────────

/**
 * Fetches recent payouts for a connected account.
 */
export async function fetchRecentPayouts(
  stripeAccountId: string,
  limit = 5,
): Promise<PayoutItem[]> {
  const stripe = getStripe();
  const payouts = await stripe.payouts.list(
    { limit },
    { stripeAccount: stripeAccountId },
  );

  return payouts.data.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency.toUpperCase(),
    status: p.status,
    arrivalDate: p.arrival_date,
    created: p.created,
    description: p.description ?? null,
  }));
}

// ── Update Payout Schedule ──────────────────────────────────────

/**
 * Updates the payout schedule for a connected account.
 */
export async function updatePayoutScheduleOnStripe(
  stripeAccountId: string,
  schedule: PayoutScheduleInput,
): Promise<void> {
  const stripe = getStripe();
  await stripe.accounts.update(stripeAccountId, {
    settings: {
      payouts: {
        schedule: {
          interval: schedule.interval,
          ...(schedule.interval === "weekly" && schedule.weeklyAnchor
            ? { weekly_anchor: schedule.weeklyAnchor as "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday" }
            : {}),
          ...(schedule.interval === "monthly" && schedule.monthlyAnchor
            ? { monthly_anchor: schedule.monthlyAnchor }
            : {}),
        },
      },
    },
  });
}
