/**
 * Meta Ads — OAuth 2.0 Module
 *
 * getValidAccessToken() is the ONLY function that reads tokens.
 * Tokens are ALWAYS encrypted at rest — never stored plaintext in DB.
 * Meta uses long-lived tokens (60 days) — no separate refresh_token.
 * Short-lived token exchanged for long-lived immediately in callback.
 * If token expires: tenant must re-authorize (cannot refresh without user).
 * Proactive warning at 7 days before expiry.
 */

import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { encryptCredentials, decryptCredentials } from "@/app/_lib/integrations/crypto";
import { log } from "@/app/_lib/logger";
import type { Prisma } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────────

export type MetaTokens = {
  accessToken: string;
  expiresAt: string;        // ISO string
  tokenType: string;
};

// ── URLs ────────────────────────────────────────────────────────

const META_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const META_TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";
// ── Authorization URL ───────────────────────────────────────────

/**
 * Generate the Meta OAuth URL for this tenant.
 * State is encrypted with AES-256-GCM to prevent CSRF.
 */
export function getAuthorizationUrl(tenantId: string): string {
  const nonce = Math.random().toString(36).slice(2, 10);
  const statePayload = { tenantId, nonce, ts: Date.now() };
  const { encrypted, iv } = encryptCredentials(
    Object.fromEntries(Object.entries(statePayload).map(([k, v]) => [k, String(v)])),
  );

  const state = `${encrypted.toString("base64url")}.${iv.toString("base64url")}`;

  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.META_REDIRECT_URI,
    scope: "ads_management,ads_read,business_management",
    state,
    response_type: "code",
  });

  return `${META_AUTH_URL}?${params.toString()}`;
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

  // Validate timestamp — max 10 minutes
  const ts = parseInt(decoded.ts ?? "0", 10);
  if (Date.now() - ts > 10 * 60 * 1000) {
    throw new Error("State expired — OAuth must be completed within 10 minutes");
  }

  if (!decoded.tenantId) throw new Error("Missing tenantId in state");
  return { tenantId: decoded.tenantId, nonce: decoded.nonce ?? "" };
}

// ── Token Exchange ──────────────────────────────────────────────

/**
 * Exchange authorization code for a short-lived user token.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: env.META_REDIRECT_URI,
    code,
  });

  const res = await fetch(`${META_TOKEN_URL}?${params.toString()}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token in Meta response");
  }

  return data.access_token;
}

/**
 * Exchange short-lived token for long-lived token (60 days).
 * Must be called immediately after initial code exchange.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokens> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${META_TOKEN_URL}?${params.toString()}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Long-lived token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token in long-lived exchange response");
  }

  // Meta long-lived tokens last ~60 days
  const expiresIn = data.expires_in ?? 60 * 24 * 60 * 60; // default 60 days

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    tokenType: data.token_type ?? "bearer",
  };
}

// ── Token Encryption Helpers ────────────────────────────────────

export function encryptTokens(tokens: MetaTokens): { encryptedData: string; encryptedIv: string } {
  const { encrypted, iv } = encryptCredentials({
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
  });

  return {
    encryptedData: encrypted.toString("base64"),
    encryptedIv: iv.toString("base64"),
  };
}

export function decryptTokens(encryptedData: string, encryptedIv: string): MetaTokens {
  const encrypted = Buffer.from(encryptedData, "base64");
  const iv = Buffer.from(encryptedIv, "base64");
  const decrypted = decryptCredentials(encrypted, iv);

  return {
    accessToken: decrypted.accessToken,
    expiresAt: decrypted.expiresAt,
    tokenType: decrypted.tokenType ?? "bearer",
  };
}

// ── Get Valid Access Token ──────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get a valid access token for a tenant.
 * Meta tokens are long-lived (60 days) — no refresh mechanism.
 * If within 7 days of expiry: proactively re-exchange.
 * If expired: throws — tenant must re-authorize.
 * This is the ONLY function that should be used to get tokens.
 */
export async function getValidAccessToken(tenantId: string): Promise<string> {
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "meta-ads" } },
  });

  if (!tenantApp) throw new Error("Meta Ads app not installed");

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const oauthData = settings["connect-meta"];
  if (!oauthData?.encryptedData || !oauthData?.encryptedIv) {
    throw new Error("OAuth tokens not found — reconnect Meta account");
  }

  const tokens = decryptTokens(
    oauthData.encryptedData as string,
    oauthData.encryptedIv as string,
  );

  const expiresAt = new Date(tokens.expiresAt).getTime();
  const now = Date.now();

  // Token expired — cannot refresh, must re-authorize
  if (expiresAt <= now) {
    throw new Error("META_TOKEN_EXPIRED");
  }

  // Proactively re-exchange if within 7 days of expiry
  if (expiresAt < now + SEVEN_DAYS_MS) {
    try {
      log("info", "meta-ads.token_proactive_refresh", { tenantId });
      const refreshed = await exchangeForLongLivedToken(tokens.accessToken);
      const { encryptedData, encryptedIv } = encryptTokens(refreshed);

      const updatedSettings = {
        ...settings,
        "connect-meta": {
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
    } catch (err) {
      // Re-exchange failed — use existing token (still valid)
      log("warn", "meta-ads.proactive_refresh_failed", { tenantId, error: String(err) });
      return tokens.accessToken;
    }
  }

  return tokens.accessToken;
}

// ── Revoke Access ───────────────────────────────────────────────

/**
 * Clear Meta tokens from settings and set app to PENDING_SETUP.
 * Meta has no server-side revoke endpoint — just clear local tokens.
 * Always clears local tokens.
 */
export async function revokeAccess(tenantId: string): Promise<void> {
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "meta-ads" } },
  });

  if (!tenantApp) return;

  const settings = tenantApp.settings as Record<string, Record<string, unknown>>;
  const cleaned = { ...settings };
  delete cleaned["connect-meta"];

  await prisma.tenantApp.update({
    where: { id: tenantApp.id },
    data: {
      settings: cleaned as Prisma.InputJsonValue,
      status: "PENDING_SETUP",
    },
  });

  await prisma.tenantAppEvent.create({
    data: {
      appId: "meta-ads",
      tenantId,
      type: "SETTINGS_UPDATED",
      message: "Meta-konto frånkopplat",
    },
  });
}
