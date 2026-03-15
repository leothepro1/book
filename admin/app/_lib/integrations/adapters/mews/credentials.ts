/**
 * Mews Credential Schema
 *
 * Defines the shape of encrypted credentials stored per-tenant.
 * Validated with Zod at decrypt time — never trust stored data blindly.
 */

import { z } from "zod";

export const MewsCredentialsSchema = z.object({
  clientToken: z.string().min(1),
  accessToken: z.string().min(1),
  clientName: z.string().min(1),
  webhookSecret: z.string().min(1),
  enterpriseId: z.string(),
  useDemoEnvironment: z.preprocess(
    (v) => v === "true" || v === true,
    z.boolean(),
  ),
});

export type MewsCredentials = z.infer<typeof MewsCredentialsSchema>;

export const MEWS_PROD_URL = "https://api.mews.com";
export const MEWS_DEMO_URL = "https://api.mews-demo.com";

export function getMewsBaseUrl(credentials: MewsCredentials): string {
  return credentials.useDemoEnvironment ? MEWS_DEMO_URL : MEWS_PROD_URL;
}
