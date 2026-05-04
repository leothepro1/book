import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { TaxRequest, TaxResponse } from "./types";
import {
  getTaxProvider,
  registerTaxProvider,
} from "./providers/registry";
import { builtinTaxProvider } from "./providers/builtin";

// Auto-register builtin on module load (Q1 default — idempotent for
// HMR safety). Catch is silent because the registry rejects duplicate
// keys; that's the expected outcome under hot-reload / re-import.
try {
  registerTaxProvider(builtinTaxProvider);
} catch {
  /* already registered */
}

/**
 * Single calculator entry-point per master plan Decision 1.
 * Cart, Checkout, DraftOrder, and Order all call this once Tax-2 +
 * Tax-3 wire callers.
 *
 * Failure-mode tier (Decision 10 — always quote, never block):
 *   1. Resolved provider succeeds → return its response
 *   2. Resolved provider throws → log + tier-3 fallback
 *   3. Tier-3: zero-rate response with `source: "fallback_zero"` and
 *      a `warnings` entry explaining why
 *
 * NEVER throws to the caller. `await calculateTax(...)` always
 * returns a valid `TaxResponse`.
 */
export async function calculateTax(
  req: TaxRequest,
): Promise<TaxResponse> {
  const fulfillmentCountry = (
    req.fulfillmentLocation?.countryCode ?? ""
  ).toUpperCase();
  const config = await resolveTaxConfig(req.tenantId, fulfillmentCountry);

  const providerKey = config?.providerKey ?? "builtin";
  const provider = getTaxProvider(providerKey);

  if (!provider) {
    log("warn", "tax.calculate.provider_not_found", {
      tenantId: req.tenantId,
      providerKey,
      fulfillmentCountry,
    });
    return tierThreeFallback(req, `provider_not_registered:${providerKey}`);
  }

  try {
    return await provider.calculate(req, {
      tenantId: req.tenantId,
      credentials: extractCredentials(config),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "tax.calculate.provider_threw", {
      tenantId: req.tenantId,
      providerKey,
      error: msg,
    });
    return tierThreeFallback(req, `provider_threw:${msg}`);
  }
}

/**
 * Q3 LOCKED: countryCode → GLOBAL → null. Region-specific (e.g. "SE")
 * wins over GLOBAL. GLOBAL wins over no config (in which case the
 * caller defaults to "builtin").
 */
async function resolveTaxConfig(
  tenantId: string,
  countryCode: string,
): Promise<{ providerKey: string; credentials: unknown } | null> {
  const regionConfig = countryCode
    ? await prisma.tenantTaxConfig.findFirst({
        where: { tenantId, regionScope: countryCode, active: true },
      })
    : null;
  const config =
    regionConfig ??
    (await prisma.tenantTaxConfig.findFirst({
      where: { tenantId, regionScope: "GLOBAL", active: true },
    }));

  if (!config) return null;
  return {
    providerKey: config.providerKey,
    credentials: config.credentials,
  };
}

function extractCredentials(
  config: { credentials: unknown } | null,
): Record<string, string> {
  if (!config?.credentials) return {};
  if (typeof config.credentials !== "object") return {};
  // TODO Tax-8 (Avalara): decrypt via INTEGRATION_ENCRYPTION_KEY.
  return config.credentials as Record<string, string>;
}

function tierThreeFallback(req: TaxRequest, reason: string): TaxResponse {
  return {
    lines: (req.lines ?? []).map((l) => ({
      lineId: l.lineId,
      taxLines: [],
    })),
    shippingLines: (req.shippingLines ?? []).map((s) => ({
      shippingLineId: s.shippingLineId,
      taxLines: [],
    })),
    source: "fallback_zero",
    estimated: true,
    warnings: [`tier3_fallback:${reason}`],
  };
}
