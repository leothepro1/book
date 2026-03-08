/**
 * Wallet Card Design — per-tenant visual customization for Apple/Google Wallet passes.
 *
 * Every tenant gets one design template. All passes issued by that tenant
 * inherit these visual settings. Tenants without a saved design get defaults.
 *
 * Layout (fixed, not customizable):
 *  ┌──────────────────────────────┐
 *  │ [logo]          Jun 22-25 '26│
 *  │                              │
 *  │        (background)          │
 *  │                              │
 *  └──────────────────────────────┘
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { WalletBackgroundMode, WalletCardDesign } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────

export interface CardDesignConfig {
  background: CardBackground;
  logoUrl: string | null;
  dateTextColor: string;
}

export type CardBackground =
  | { mode: "SOLID"; color: string }
  | { mode: "GRADIENT"; from: string; to: string; angle: number }
  | { mode: "IMAGE"; imageUrl: string; overlayOpacity?: number };

export interface ResolvedCardData {
  design: CardDesignConfig;
  dateLabel: string;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_BACKGROUND_COLOR = "#1a1a2e";
const DEFAULT_DATE_TEXT_COLOR = "#ffffff";

export const DEFAULT_CARD_DESIGN: CardDesignConfig = {
  background: { mode: "SOLID", color: DEFAULT_BACKGROUND_COLOR },
  logoUrl: null,
  dateTextColor: DEFAULT_DATE_TEXT_COLOR,
};

// ── Model → Config mapping ──────────────────────────────────────────

function modelToConfig(model: WalletCardDesign): CardDesignConfig {
  const background = resolveBackground(model);
  return {
    background,
    logoUrl: model.logoUrl,
    dateTextColor: model.dateTextColor,
  };
}

function resolveBackground(model: WalletCardDesign): CardBackground {
  switch (model.backgroundMode) {
    case "SOLID":
      return {
        mode: "SOLID",
        color: model.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      };
    case "GRADIENT": {
      const color = model.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
      const angle = model.gradientDirection === "up" ? 0 : 180;
      return {
        mode: "GRADIENT",
        from: color,
        to: "transparent",
        angle,
      };
    }
    case "IMAGE":
      if (!model.backgroundImageUrl) {
        return { mode: "SOLID", color: DEFAULT_BACKGROUND_COLOR };
      }
      return {
        mode: "IMAGE",
        imageUrl: model.backgroundImageUrl,
        overlayOpacity: model.overlayOpacity ?? 0.3,
      };
  }
}

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Get the card design for a tenant.
 * Returns defaults if tenant hasn't customized yet.
 */
export async function getCardDesign(tenantId: string): Promise<CardDesignConfig> {
  const model = await prisma.walletCardDesign.findUnique({
    where: { tenantId },
  });

  if (!model) return { ...DEFAULT_CARD_DESIGN };
  return modelToConfig(model);
}

/**
 * Get the full resolved card data for rendering a pass.
 * Merges tenant design with booking dates.
 */
export async function resolveCardData(
  tenantId: string,
  arrival: Date,
  departure: Date,
): Promise<ResolvedCardData> {
  const design = await getCardDesign(tenantId);
  return {
    design,
    dateLabel: formatDateRange(arrival, departure),
  };
}

// ── Mutations ────────────────────────────────────────────────────────

export interface UpsertCardDesignInput {
  tenantId: string;
  backgroundMode: WalletBackgroundMode;
  backgroundColor?: string | null;
  gradientDirection?: string | null;
  backgroundImageUrl?: string | null;
  overlayOpacity?: number | null;
  logoUrl?: string | null;
  dateTextColor?: string;
}

/**
 * Create or update the card design for a tenant.
 * Upsert guarantees idempotency — safe to call repeatedly.
 */
export async function upsertCardDesign(
  input: UpsertCardDesignInput,
): Promise<CardDesignConfig> {
  const data = {
    backgroundMode: input.backgroundMode,
    backgroundColor: input.backgroundColor ?? null,
    gradientDirection: input.gradientDirection ?? "down",
    backgroundImageUrl: input.backgroundImageUrl ?? null,
    overlayOpacity: input.overlayOpacity ?? 0.3,
    logoUrl: input.logoUrl ?? null,
    dateTextColor: input.dateTextColor ?? DEFAULT_DATE_TEXT_COLOR,
  };

  const model = await prisma.walletCardDesign.upsert({
    where: { tenantId: input.tenantId },
    create: { tenantId: input.tenantId, ...data },
    update: data,
  });

  return modelToConfig(model);
}

// ── Date formatting ──────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Format a date range for display on the wallet card.
 *
 * Same month:  "Jun 22 - 25, 2026"
 * Cross month: "Jun 28 - Jul 2, 2026"
 * Cross year:  "Dec 30, 2026 - Jan 2, 2027"
 */
export function formatDateRange(arrival: Date, departure: Date): string {
  const aMonth = MONTH_SHORT[arrival.getUTCMonth()];
  const aDay = arrival.getUTCDate();
  const aYear = arrival.getUTCFullYear();

  const dMonth = MONTH_SHORT[departure.getUTCMonth()];
  const dDay = departure.getUTCDate();
  const dYear = departure.getUTCFullYear();

  // Cross year
  if (aYear !== dYear) {
    return `${aMonth} ${aDay}, ${aYear} - ${dMonth} ${dDay}, ${dYear}`;
  }

  // Same month
  if (aMonth === dMonth) {
    return `${aMonth} ${aDay} - ${dDay}, ${aYear}`;
  }

  // Cross month, same year
  return `${aMonth} ${aDay} - ${dMonth} ${dDay}, ${aYear}`;
}
