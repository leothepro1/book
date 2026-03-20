/**
 * Environment Variable Validation
 * ════════════════════════════════
 *
 * Single source of truth for all server-side env vars.
 * Validated at import time via Zod — app fails fast at boot
 * if any critical variable is missing.
 *
 * Service-specific vars (Cloudinary, Clerk, etc.) are typed but
 * validated lazily — they throw on first access if missing, not at boot.
 * This allows the dev server to start even when only DATABASE_URL is set.
 *
 * NEXT_PUBLIC_* and NODE_ENV are NOT included here — they are
 * build-time constants inlined by Next.js and must remain as
 * process.env references in client code.
 */

import { z } from "zod";

// ── Schema ─────────────────────────────────────────────────────

const envSchema = z.object({
  // Always required — app cannot start without these
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32, "INTEGRATION_ENCRYPTION_KEY must be at least 32 characters"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  // Service vars — optional at boot, validated on first use via accessor
  RESEND_API_KEY: z.string().optional(),
  UNSUBSCRIBE_SECRET: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  GUEST_SESSION_SECRET: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  ACCESS_PASS_PEPPER: z.string().optional(),
  MEDIA_CLEANUP_SECRET: z.string().optional(),

  /** Clerk org ID for dev mode mock auth. Must NOT be set in production. */
  DEV_ORG_ID: z.string().optional(),

  /** Real Clerk user ID of the org owner — used as acting user for Clerk API
   *  calls in dev mode where the session user is mocked as "dev_user".
   *  Must NOT be set in production. */
  DEV_OWNER_USER_ID: z.string().optional(),

  /** Portal slug for guest auth testing on localhost (no subdomain routing).
   *  Must NOT be set in production. */
  DEV_GUEST_PORTAL_SLUG: z.string().optional(),
});

// ── Validation ─────────────────────────────────────────────────

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `\n[env] Missing or invalid environment variables:\n${formatted}\n`,
    );
  }

  const parsed = result.data;

  // Guard: DEV_* vars must never be set in production
  if (process.env.NODE_ENV === "production" && parsed.DEV_ORG_ID) {
    throw new Error(
      "[env] DEV_ORG_ID is set in production — this is a security risk. Remove it from the production environment.",
    );
  }
  if (process.env.NODE_ENV === "production" && parsed.DEV_OWNER_USER_ID) {
    throw new Error(
      "[env] DEV_OWNER_USER_ID is set in production — this is a security risk. Remove it from the production environment.",
    );
  }
  if (process.env.NODE_ENV === "production" && parsed.DEV_GUEST_PORTAL_SLUG) {
    throw new Error(
      "[env] DEV_GUEST_PORTAL_SLUG is set in production — this is a security risk. Remove it from the production environment.",
    );
  }

  // Guard: DEV_* vars must be set in development
  if (process.env.NODE_ENV === "development" && !parsed.DEV_ORG_ID) {
    throw new Error(
      "[env] DEV_ORG_ID is required in development mode. Add it to .env.local.",
    );
  }
  if (process.env.NODE_ENV === "development" && !parsed.DEV_OWNER_USER_ID) {
    throw new Error(
      "[env] DEV_OWNER_USER_ID is required in development mode. Add it to .env.local.",
    );
  }

  return parsed;
}

const parsed = validateEnv();

// ── Lazy accessors for service vars ────────────────────────────
// These throw with a clear message on first access if the var is missing.
// This is better than throwing at boot for vars only used by specific routes.

function required(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[env] ${key} is required but not set. Add it to your .env file.`);
  }
  return value;
}

function requiredMin(key: string, value: string | undefined, min: number): string {
  const val = required(key, value);
  if (val.length < min) {
    throw new Error(`[env] ${key} must be at least ${min} characters.`);
  }
  return val;
}

export const env = {
  // Always available (validated at boot)
  DATABASE_URL: parsed.DATABASE_URL,
  INTEGRATION_ENCRYPTION_KEY: parsed.INTEGRATION_ENCRYPTION_KEY,
  CRON_SECRET: parsed.CRON_SECRET,

  // Lazy — throw on first access if missing
  get RESEND_API_KEY() {
    return required("RESEND_API_KEY", parsed.RESEND_API_KEY);
  },
  get UNSUBSCRIBE_SECRET() {
    if (process.env.NODE_ENV === "development" && !parsed.UNSUBSCRIBE_SECRET) {
      return "dev_unsubscribe_secret_placeholder_32ch";
    }
    return requiredMin("UNSUBSCRIBE_SECRET", parsed.UNSUBSCRIBE_SECRET, 32);
  },
  get RESEND_WEBHOOK_SECRET() {
    return required("RESEND_WEBHOOK_SECRET", parsed.RESEND_WEBHOOK_SECRET);
  },
  get CLERK_SECRET_KEY() {
    return required("CLERK_SECRET_KEY", parsed.CLERK_SECRET_KEY);
  },
  get CLERK_WEBHOOK_SECRET() {
    return required("CLERK_WEBHOOK_SECRET", parsed.CLERK_WEBHOOK_SECRET);
  },
  get CLOUDINARY_CLOUD_NAME() {
    return required("CLOUDINARY_CLOUD_NAME", parsed.CLOUDINARY_CLOUD_NAME);
  },
  get CLOUDINARY_API_KEY() {
    return required("CLOUDINARY_API_KEY", parsed.CLOUDINARY_API_KEY);
  },
  get CLOUDINARY_API_SECRET() {
    return required("CLOUDINARY_API_SECRET", parsed.CLOUDINARY_API_SECRET);
  },
  get ACCESS_PASS_PEPPER() {
    return requiredMin("ACCESS_PASS_PEPPER", parsed.ACCESS_PASS_PEPPER, 16);
  },
  get GUEST_SESSION_SECRET() {
    if (process.env.NODE_ENV === "development" && !parsed.GUEST_SESSION_SECRET) {
      return "dev_guest_session_secret_placeholder_32";
    }
    return requiredMin("GUEST_SESSION_SECRET", parsed.GUEST_SESSION_SECRET, 32);
  },

  // Truly optional
  MEDIA_CLEANUP_SECRET: parsed.MEDIA_CLEANUP_SECRET,
  DEV_ORG_ID: parsed.DEV_ORG_ID,
  DEV_OWNER_USER_ID: parsed.DEV_OWNER_USER_ID,
} as const;
