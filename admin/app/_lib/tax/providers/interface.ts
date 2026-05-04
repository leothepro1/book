/**
 * Tax provider abstraction (master plan §4 Decision 9).
 *
 * Per recon Q9 LOCKED: synchronous Promise<TaxResponse> contract,
 * matching Shopify's partner-platform shape (single HTTPS req/resp at
 * cart/checkout/order). Streaming is over-engineering for V1.
 *
 * Tax-0 ships the interface only. Tax-1 registers the `builtin`
 * provider. Tax-8 adds the Avalara adapter.
 */

import type { TaxRequest, TaxResponse } from "../types";

export interface TaxProviderContext {
  tenantId: string;
  /**
   * Decrypted credentials from `TenantTaxConfig.credentials`. Empty
   * object for the builtin provider; populated by adapters that talk
   * to external services.
   */
  credentials: Record<string, string>;
}

export interface TaxProvider {
  readonly key: string;
  readonly displayName: string;
  calculate(req: TaxRequest, ctx: TaxProviderContext): Promise<TaxResponse>;
  /**
   * Optional. Called on order finalization for liability tracking
   * (Shopify's `tax_summaries/create` webhook equivalent). Most
   * providers no-op.
   */
  notifyOrderFinalized?(
    orderId: string,
    ctx: TaxProviderContext,
  ): Promise<void>;
}
