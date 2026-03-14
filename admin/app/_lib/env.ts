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

  // Service vars — optional at boot, validated on first use via accessor
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  ACCESS_PASS_PEPPER: z.string().optional(),
  MEDIA_CLEANUP_SECRET: z.string().optional(),

  /** Clerk org ID for dev mode mock auth. Must NOT be set in production. */
  DEV_ORG_ID: z.string().optional(),
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

  // Guard: DEV_ORG_ID must never be set in production
  if (process.env.NODE_ENV === "production" && parsed.DEV_ORG_ID) {
    throw new Error(
      "[env] DEV_ORG_ID is set in production — this is a security risk. Remove it from the production environment.",
    );
  }

  // Guard: DEV_ORG_ID must be set in development
  if (process.env.NODE_ENV === "development" && !parsed.DEV_ORG_ID) {
    throw new Error(
      "[env] DEV_ORG_ID is required in development mode. Add it to .env.local.",
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

  // Lazy — throw on first access if missing
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

  // Truly optional
  MEDIA_CLEANUP_SECRET: parsed.MEDIA_CLEANUP_SECRET,
  DEV_ORG_ID: parsed.DEV_ORG_ID,
} as const;
