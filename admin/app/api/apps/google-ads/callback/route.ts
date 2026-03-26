/**
 * Google Ads — OAuth Callback Route
 *
 * GET /api/apps/google-ads/callback?code=...&state=...
 *
 * Exchanges authorization code for tokens, encrypts and stores them,
 * completes the wizard OAuth step, and redirects back to setup.
 */

import { NextResponse } from "next/server";
import { log } from "@/app/_lib/logger";
import {
  decryptState,
  exchangeCodeForTokens,
  encryptTokens,
} from "@/app/_lib/apps/google-ads/oauth";
import { completeStep } from "@/app/_lib/apps/wizard";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User cancelled or error from Google
  if (error) {
    log("warn", "google-ads.oauth_error", { error });
    return NextResponse.redirect(
      new URL("/apps/google-ads/setup?error=oauth_denied", url.origin),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/apps/google-ads/setup?error=missing_params", url.origin),
    );
  }

  // Decrypt and validate state
  let tenantId: string;
  try {
    const decoded = decryptState(state);
    tenantId = decoded.tenantId;
  } catch (err) {
    log("error", "google-ads.invalid_state", { error: String(err) });
    return NextResponse.redirect(
      new URL("/apps/google-ads/setup?error=invalid_state", url.origin),
    );
  }

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "google-ads.token_exchange_failed", { tenantId, error: msg });

    if (msg === "NO_REFRESH_TOKEN") {
      return NextResponse.redirect(
        new URL("/apps/google-ads/setup?error=no_refresh_token", url.origin),
      );
    }

    return NextResponse.redirect(
      new URL("/apps/google-ads/setup?error=token_exchange_failed", url.origin),
    );
  }

  // Encrypt tokens for storage
  const { encryptedData, encryptedIv } = encryptTokens(tokens);

  // Complete the wizard OAuth step
  await completeStep("google-ads", "connect-google", {
    connected: true,
    provider: "google",
    encryptedData,
    encryptedIv,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  });

  log("info", "google-ads.oauth_completed", { tenantId });

  return NextResponse.redirect(
    new URL("/apps/google-ads/setup", url.origin),
  );
}
