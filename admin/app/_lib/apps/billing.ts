/**
 * App Billing — Usage-based billing for installed apps.
 *
 * recordPlanChange() and recordUninstall() are the ONLY functions
 * that create BillingLineItem rows. All amounts in ören (integer).
 * billingEnabled === false means generateInvoice() is a no-op.
 * Free tier (pricePerMonth === 0) still produces amount: 0 line items
 * for the audit trail, but never invoiced.
 */

"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getApp } from "./registry";

// Import all app definitions
import "./definitions";

// ── Types ───────────────────────────────────────────────────────

export type BillingPeriodSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: number;
  currency: string;
  lineItems: BillingLineItemSummary[];
};

export type BillingLineItemSummary = {
  id: string;
  appId: string;
  appName: string;
  description: string;
  tier: string;
  amount: number;
  isProrated: boolean;
  daysInPeriod: number | null;
  daysCharged: number | null;
  createdAt: string;
};

export type CurrentBillingInfo = {
  periodId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalAmount: number;
  lineItems: BillingLineItemSummary[];
  billingEnabled: boolean;
};

// ── Period Helpers ───────────────────────────────────────────────

function getPeriodBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function daysRemaining(date: Date): number {
  const total = daysInMonth(date);
  const current = date.getUTCDate();
  return total - current + 1; // inclusive of today
}

// ── Proration ───────────────────────────────────────────────────

/**
 * Calculate prorated amount using integer arithmetic only.
 * Never returns negative — floor at 0.
 * Formula: Math.floor(monthlyAmount * daysCharged / totalDays)
 */
export async function calculateProration(
  monthlyAmountOren: number,
  daysCharged: number,
  totalDaysInPeriod: number,
): Promise<number> {
  if (totalDaysInPeriod <= 0 || daysCharged <= 0) return 0;
  if (daysCharged >= totalDaysInPeriod) return monthlyAmountOren;
  return Math.max(0, Math.floor((monthlyAmountOren * daysCharged) / totalDaysInPeriod));
}

// ── Get or Create Current Period ────────────────────────────────

async function getOrCreatePeriod(tenantId: string): Promise<{ id: string; periodStart: Date; periodEnd: Date }> {
  const now = new Date();
  const { start, end } = getPeriodBounds(now);

  const period = await prisma.tenantBillingPeriod.upsert({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
    create: { tenantId, periodStart: start, periodEnd: end },
    update: {}, // never update if exists
  });

  return { id: period.id, periodStart: period.periodStart, periodEnd: period.periodEnd };
}

// ── Record Plan Change ──────────────────────────────────────────

/**
 * Record a billing line item when an app's plan changes.
 * Called when: app installed (first tier), tier upgraded/downgraded, reinstalled.
 * Proration applied for mid-month changes.
 */
export async function recordPlanChange(
  tenantId: string,
  appId: string,
  tier: string,
): Promise<void> {
  const app = getApp(appId);
  if (!app) return;

  const pricing = app.pricing.find((p) => p.tier === tier);
  if (!pricing) return;

  const now = new Date();
  const period = await getOrCreatePeriod(tenantId);
  const totalDays = daysInMonth(now);
  const charged = daysRemaining(now);
  const isProrated = charged < totalDays;
  const amount = isProrated
    ? await calculateProration(pricing.pricePerMonth, charged, totalDays)
    : pricing.pricePerMonth;

  const description = isProrated
    ? `${app.name} — ${tier === "free" ? "Gratis" : tier.charAt(0).toUpperCase() + tier.slice(1)} (${charged}/${totalDays} dagar)`
    : `${app.name} — ${tier === "free" ? "Gratis" : tier.charAt(0).toUpperCase() + tier.slice(1)}`;

  await prisma.billingLineItem.create({
    data: {
      periodId: period.id,
      tenantId,
      appId,
      appName: app.name,
      description,
      tier,
      amount,
      isProrated,
      daysInPeriod: totalDays,
      daysCharged: charged,
    },
  });

  // Recalculate period total
  await recalculatePeriodTotal(period.id);
}

// ── Record Uninstall ────────────────────────────────────────────

/**
 * Record a billing adjustment when an app is uninstalled mid-period.
 * Creates a credit line item for the remaining days.
 * Amount is 0 (credit) — the original charge stands, this records the event.
 */
export async function recordUninstall(
  tenantId: string,
  appId: string,
  tier: string,
): Promise<void> {
  const app = getApp(appId);
  if (!app) return;

  const period = await getOrCreatePeriod(tenantId);

  await prisma.billingLineItem.create({
    data: {
      periodId: period.id,
      tenantId,
      appId,
      appName: app.name,
      description: `${app.name} — Avinstallerad`,
      tier,
      amount: 0,
      isProrated: false,
    },
  });

  await recalculatePeriodTotal(period.id);
}

// ── Recalculate Period Total ────────────────────────────────────

async function recalculatePeriodTotal(periodId: string): Promise<void> {
  const items = await prisma.billingLineItem.findMany({
    where: { periodId },
    select: { amount: true },
  });

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  await prisma.tenantBillingPeriod.update({
    where: { id: periodId },
    data: { totalAmount: Math.max(0, total) },
  });
}

// ── Get Current Period ──────────────────────────────────────────

export async function getCurrentPeriod(): Promise<CurrentBillingInfo | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  const tenantId = tenantData.tenant.id;

  const billingSettings = await prisma.tenantBillingSettings.findUnique({
    where: { tenantId },
  });

  const now = new Date();
  const { start } = getPeriodBounds(now);

  const period = await prisma.tenantBillingPeriod.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
    include: { lineItems: { orderBy: { createdAt: "desc" } } },
  });

  if (!period) {
    return {
      periodId: null,
      periodStart: start.toISOString(),
      periodEnd: getPeriodBounds(now).end.toISOString(),
      totalAmount: 0,
      lineItems: [],
      billingEnabled: billingSettings?.billingEnabled ?? false,
    };
  }

  return {
    periodId: period.id,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    totalAmount: period.totalAmount,
    lineItems: period.lineItems.map((li) => ({
      id: li.id,
      appId: li.appId,
      appName: li.appName,
      description: li.description,
      tier: li.tier,
      amount: li.amount,
      isProrated: li.isProrated,
      daysInPeriod: li.daysInPeriod,
      daysCharged: li.daysCharged,
      createdAt: li.createdAt.toISOString(),
    })),
    billingEnabled: billingSettings?.billingEnabled ?? false,
  };
}

// ── Get Billing History ─────────────────────────────────────────

export async function getBillingHistory(limit: number = 12): Promise<BillingPeriodSummary[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];
  const tenantId = tenantData.tenant.id;

  const periods = await prisma.tenantBillingPeriod.findMany({
    where: { tenantId },
    orderBy: { periodStart: "desc" },
    take: limit,
    include: { lineItems: { orderBy: { createdAt: "asc" } } },
  });

  return periods.map((p) => ({
    id: p.id,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    status: p.status,
    totalAmount: p.totalAmount,
    currency: p.currency,
    lineItems: p.lineItems.map((li) => ({
      id: li.id,
      appId: li.appId,
      appName: li.appName,
      description: li.description,
      tier: li.tier,
      amount: li.amount,
      isProrated: li.isProrated,
      daysInPeriod: li.daysInPeriod,
      daysCharged: li.daysCharged,
      createdAt: li.createdAt.toISOString(),
    })),
  }));
}

// ── Close Period ────────────────────────────────────────────────

/**
 * Close a billing period. Called by cron at end of month.
 * Sets status to PENDING (ready for invoice) or VOID (if total === 0).
 */
export async function closePeriod(periodId: string): Promise<void> {
  const period = await prisma.tenantBillingPeriod.findUnique({
    where: { id: periodId },
  });

  if (!period || period.status !== "OPEN") return;

  // Optimistic lock: only close if still OPEN (prevents concurrent cron double-close)
  const updated = await prisma.tenantBillingPeriod.updateMany({
    where: { id: periodId, status: "OPEN" },
    data: {
      status: period.totalAmount === 0 ? "VOID" : "PENDING",
      closedAt: new Date(),
    },
  });

  if (updated.count === 0) return; // Already closed by another process
}

// ── Generate Invoice (stub — billingEnabled gate) ───────────────

/**
 * Generate a Stripe invoice for a PENDING period.
 * No-op if billingEnabled === false on TenantBillingSettings.
 * When billing is enabled, this will:
 * 1. Create a Stripe Invoice with line items
 * 2. Set stripeInvoiceId on TenantBillingPeriod
 * 3. Set status to INVOICED
 * 4. Set invoicedAt timestamp
 */
export async function generateInvoice(periodId: string): Promise<void> {
  const period = await prisma.tenantBillingPeriod.findUnique({
    where: { id: periodId },
  });

  if (!period || period.status !== "PENDING") return;

  const billingSettings = await prisma.tenantBillingSettings.findUnique({
    where: { tenantId: period.tenantId },
  });

  if (!billingSettings?.billingEnabled) {
    // Billing disabled — mark as VOID (no real charge)
    await prisma.tenantBillingPeriod.update({
      where: { id: periodId },
      data: { status: "VOID", closedAt: new Date() },
    });
    return;
  }

  // TODO: Real Stripe Invoice creation when billing is enabled
  // 1. Ensure stripeCustomerId exists on billingSettings
  // 2. Create Stripe Invoice with line items from BillingLineItem
  // 3. Finalize and send invoice
  // 4. Update period: stripeInvoiceId, status = INVOICED, invoicedAt

  await prisma.tenantBillingPeriod.update({
    where: { id: periodId },
    data: { status: "INVOICED", invoicedAt: new Date() },
  });
}

// ── Get Line Items for Specific App (detail page) ───────────────

export async function getAppBillingInfo(appId: string): Promise<{
  currentAmount: number;
  daysRemaining: number;
  daysInPeriod: number;
  isProrated: boolean;
} | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const now = new Date();
  const { start } = getPeriodBounds(now);

  const period = await prisma.tenantBillingPeriod.findUnique({
    where: { tenantId_periodStart: { tenantId: tenantData.tenant.id, periodStart: start } },
    include: {
      lineItems: {
        where: { appId },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!period || period.lineItems.length === 0) return null;

  const latest = period.lineItems[0];
  const totalDays = daysInMonth(now);
  const remaining = daysRemaining(now);

  return {
    currentAmount: latest.amount,
    daysRemaining: remaining,
    daysInPeriod: totalDays,
    isProrated: latest.isProrated,
  };
}
