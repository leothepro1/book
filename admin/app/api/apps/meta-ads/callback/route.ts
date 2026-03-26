/**
 * Meta Ads — OAuth Callback Route
 *
 * GET /api/apps/meta-ads/callback?code=...&state=...
 *
 * Exchanges code → short-lived token → immediately long-lived token.
 * Encrypts and stores tokens, completes wizard step, redirects to setup.
 */

import { NextResponse } from "next/server";
import { log } from "@/app/_lib/logger";
import {
  decryptState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  encryptTokens,
} from "@/app/_lib/apps/meta-ads/oauth";
import { completeStep } from "@/app/_lib/apps/wizard";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    log("warn", "meta-ads.oauth_error", { error });
    return NextResponse.redirect(
      new URL("/apps/meta-ads/setup?error=oauth_denied", url.origin),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/apps/meta-ads/setup?error=missing_params", url.origin),
    );
  }

  let tenantId: string;
  try {
    const decoded = decryptState(state);
    tenantId = decoded.tenantId;
  } catch (err) {
    log("error", "meta-ads.invalid_state", { error: String(err) });
    return NextResponse.redirect(
      new URL("/apps/meta-ads/setup?error=invalid_state", url.origin),
    );
  }

  // Exchange code → short-lived → long-lived (immediately)
  let longLivedTokens;
  try {
    const shortLivedToken = await exchangeCodeForToken(code);
    longLivedTokens = await exchangeForLongLivedToken(shortLivedToken);
  } catch (err) {
    log("error", "meta-ads.token_exchange_failed", { tenantId, error: String(err) });
    return NextResponse.redirect(
      new URL("/apps/meta-ads/setup?error=token_exchange_failed", url.origin),
    );
  }

  const { encryptedData, encryptedIv } = encryptTokens(longLivedTokens);

  await completeStep("meta-ads", "connect-meta", {
    connected: true,
    provider: "meta",
    encryptedData,
    encryptedIv,
    expiresAt: longLivedTokens.expiresAt,
  });

  log("info", "meta-ads.oauth_completed", { tenantId });

  return NextResponse.redirect(
    new URL("/apps/meta-ads/setup", url.origin),
  );
}
