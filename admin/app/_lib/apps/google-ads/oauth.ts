/**
 * Google Ads — OAuth 2.0 Module
 *
 * getValidAccessToken() is the ONLY function that reads/refreshes tokens.
 * Tokens are ALWAYS encrypted at rest — never stored plaintext in DB.
 * refreshToken absence after OAuth → hard error, redirect to re-authorize.
 * getValidAccessToken() adds 60s buffer before expiry.
 * State param in OAuth URL encrypted with crypto.ts — never plain tenantId.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { resilientFetch } from "@/app/_lib/http/fetch";
import { log } from "@/app/_lib/logger";
import type { Prisma } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────────

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;        // ISO string
  scope: string;
};

// ── Authorization URL ───────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Generate the Google OAuth URL for this tenant.
 * State is encrypted with AES-256-GCM to prevent CSRF and verify tenantId on callback.
 */
export function getAuthorizationUrl(tenantId: string): string {
  // Encrypt state with crypto.ts
  const nonce = Math.random().toString(36).slice(2, 10);
  const statePayload = { tenantId, nonce, ts: Date.now() };
  const { encrypted, iv } = encryptCredentials(
    Object.fromEntries(Object.entries(statePayload).map(([k, v]) => [k, String(v)])),
  );

  // Base64url encode for URL safety
  const state = `${encrypted.toString("base64url")}.${iv.toString("base64url")}`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Decrypt and validate the state parameter from the callback.
 */
export function decryptState(state: string): { tenantId: string; nonce: string } {
  const [encB64, ivB64] = state.split(".");
  if (!encB64 || !ivB64) throw new Error("Invalid state format");

  const encrypted = Buffer.from(encB64, "base64url");
  const iv = Buffer.from(ivB64, "base64url");
  const decoded = decryptCredentials(encrypted, iv);

  if (!decoded.tenantId) throw new Error("Missing tenantId in state");

  // Validate timestamp — state must not be older than 10 minutes
  const ts = parseInt(decoded.ts ?? "0", 10);
  if (Date.now() - ts > 10 * 60 * 1000) {
    throw new Error("State expired — OAuth must be completed within 10 minutes");
  }

  return { tenantId: decoded.tenantId, nonce: decoded.nonce ?? "" };
}

// ── Token Exchange ──────────────────────────────────────────────

/**
 * Exchange authorization code for access + refresh tokens.
 * Throws if no refresh_token in response.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await resilientFetch(GOOGLE_TOKEN_URL, {
    service: "google-ads", timeout: 8_000,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  if (!data.refresh_token) {
    throw new Error("NO_REFRESH_TOKEN");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope ?? "",
  };
}

// ── Token Refresh ───────────────────────────────────────────────

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await resilientFetch(GOOGLE_TOKEN_URL, {
    service: "google-ads", timeout: 8_000,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    refreshToken,               // refresh token doesn't change on refresh
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope ?? "",
  };
}

// ── Token Encryption Helpers ────────────────────────────────────

export function encryptTokens(tokens: GoogleTokens): { encryptedData: string; encryptedIv: string } {
  const { encrypted, iv } = encryptCredentials({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  });

  return {
    encryptedData: encrypted.toString("base64"),
    encryptedIv: iv.toString("base64"),
  };
}

export function decryptTokens(encryptedData: string, encryptedIv: string): GoogleTokens {
  const encrypted = Buffer.from(encryptedData, "base64");
  const iv = Buffer.from(encryptedIv, "base64");
  const decrypted = decryptCredentials(encrypted, iv);

  return {
    accessToken: decrypted.accessToken,
    refreshToken: decrypted.refreshToken,
    expiresAt: decrypted.expiresAt,
    scope: decrypted.scope ?? "",
  };
}

// ── Get Valid Access Token ──────────────────────────────────────

const EXPIRY_BUFFER_MS = 60 * 1000; // 60 seconds buffer

/**
 * Get a valid access token for a tenant.
 * Auto-refreshes if expired. Encrypts and stores new tokens.
 * This is the ONLY function that should be used to get tokens.
 */
export async function getValidAccessToken(tenantId: string): Promise<string> {
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "google-ads" } },
  });

  if (!tenantApp) throw new Error("Google Ads app not installed");

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const oauthData = settings["connect-google"];
  if (!oauthData?.encryptedData || !oauthData?.encryptedIv) {
    throw new Error("OAuth tokens not found — reconnect Google account");
  }

  const tokens = decryptTokens(
    oauthData.encryptedData as string,
    oauthData.encryptedIv as string,
  );

  // Check if access token is still valid (with 60s buffer)
  const expiresAt = new Date(tokens.expiresAt).getTime();
  const now = Date.now();

  if (expiresAt > now + EXPIRY_BUFFER_MS) {
    return tokens.accessToken;
  }

  // Refresh the token
  log("info", "google-ads.token_refresh", { tenantId });

  const refreshed = await refreshAccessToken(tokens.refreshToken);
  const { encryptedData, encryptedIv } = encryptTokens(refreshed);

  // Update stored tokens
  const updatedSettings = {
    ...settings,
    "connect-google": {
      ...oauthData,
      encryptedData,
      encryptedIv,
      expiresAt: refreshed.expiresAt,
    },
  };

  await prisma.tenantApp.update({
    where: { id: tenantApp.id },
    data: { settings: updatedSettings as Prisma.InputJsonValue },
  });

  return refreshed.accessToken;
}

// ── Revoke Access ───────────────────────────────────────────────

/**
 * Revoke Google OAuth access and clear tokens from settings.
 * Always clears local tokens even if Google revoke call fails.
 */
export async function revokeAccess(tenantId: string): Promise<void> {
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "google-ads" } },
  });

  if (!tenantApp) return;

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const oauthData = settings["connect-google"];

  // Try to revoke at Google (best effort)
  if (oauthData?.encryptedData && oauthData?.encryptedIv) {
    try {
      const tokens = decryptTokens(
        oauthData.encryptedData as string,
        oauthData.encryptedIv as string,
      );
      await resilientFetch(`${GOOGLE_REVOKE_URL}?token=${tokens.refreshToken}`, {
        service: "google-ads", timeout: 8_000,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
    } catch (err) {
      log("warn", "google-ads.revoke_failed", { tenantId, error: String(err) });
    }
  }

  // Always clear local tokens (keep other settings like tracking config)
  const cleaned = { ...settings };
  delete cleaned["connect-google"];
  delete cleaned["select-account"];

  await prisma.tenantApp.update({
    where: { id: tenantApp.id },
    data: {
      settings: cleaned as Prisma.InputJsonValue,
      status: "PENDING_SETUP",
    },
  });

  await prisma.tenantAppEvent.create({
    data: {
      appId: "google-ads",
      tenantId,
      type: "SETTINGS_UPDATED",
      message: "Google-konto frånkopplat",
    },
  });
}
