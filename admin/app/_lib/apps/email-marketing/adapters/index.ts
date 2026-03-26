/**
 * Email Marketing Adapter Registry.
 *
 * getEmailAdapter(provider) is the ONLY way to get an adapter.
 * Adding Klaviyo = import adapter + add to map. Zero other changes.
 */

import type { EmailMarketingAdapter } from "../types";
import { mailchimpAdapter } from "./mailchimp";

const EMAIL_MARKETING_ADAPTERS: Record<string, EmailMarketingAdapter> = {
  mailchimp: mailchimpAdapter,
  // klaviyo: klaviyoAdapter,
  // mailerlite: mailerliteAdapter,
};

export function getEmailAdapter(provider: string): EmailMarketingAdapter {
  const adapter = EMAIL_MARKETING_ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown email marketing provider: ${provider}`);
  return adapter;
}
