/**
 * App Store — Type definitions + Zod schemas
 *
 * All types for the app registry, install lifecycle, setup requirements,
 * and wizard infrastructure.
 * Zod schemas provide runtime validation at system boundaries.
 */

import { z } from "zod";

// ── App Categories ──────────────────────────────────────────────

export const AppCategorySchema = z.enum([
  "marketing",
  "sales",
  "analytics",
  "channels",
  "crm",
  "operations",
  "finance",
]);

export type AppCategory = z.infer<typeof AppCategorySchema>;

// ── Setup Requirements ──────────────────────────────────────────

export const SetupRequirementSchema = z.enum(["pms", "payments"]);

export type SetupRequirement = z.infer<typeof SetupRequirementSchema>;

// ── Permissions ─────────────────────────────────────────────────

export const AppPermissionSchema = z.enum([
  "orders:read",
  "orders:write",
  "bookings:read",
  "bookings:write",
  "guests:read",
  "guests:write",
  "products:read",
  "analytics:read",
]);

export type AppPermission = z.infer<typeof AppPermissionSchema>;

// ── Pricing ─────────────────────────────────────────────────────

export const AppPricingTierSchema = z.enum(["free", "grow", "pro"]);

export type AppPricingTier = z.infer<typeof AppPricingTierSchema>;

export const AppPricingSchema = z.object({
  tier: AppPricingTierSchema,
  pricePerMonth: z.number().int().min(0), // in ören (0 = free)
  features: z.array(z.string()),          // Swedish feature list
});

export type AppPricing = z.infer<typeof AppPricingSchema>;

// ── Setup Step Types ────────────────────────────────────────────

export const SetupStepTypeSchema = z.enum([
  "oauth",            // OAuth redirect flow (Google, Meta)
  "api_key",          // API key / token input
  "account_select",   // Select from list fetched after auth
  "config",           // Toggles, selects, settings
  "webhook",          // Platform registers webhook at provider
  "review",           // Summary before activation — always last step
]);

export type SetupStepType = z.infer<typeof SetupStepTypeSchema>;

// ── API Key Field ───────────────────────────────────────────────

export const ApiKeyFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),             // Swedish
  placeholder: z.string().optional(),
  secret: z.boolean(),                  // if true, masked input + encrypted storage
  helpUrl: z.string().url().optional(),  // link to where user finds this key
});

export type ApiKeyField = z.infer<typeof ApiKeyFieldSchema>;

// ── Config Field ────────────────────────────────────────────────

export const ConfigFieldOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string(),
});

export const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),             // Swedish
  type: z.enum(["toggle", "select", "text", "number"]),
  default: z.unknown(),
  options: z.array(ConfigFieldOptionSchema).optional(), // for select
  hint: z.string().optional(),          // Swedish helper text
});

export type ConfigField = z.infer<typeof ConfigFieldSchema>;

// ── OAuth Config ────────────────────────────────────────────────

export const OAuthConfigSchema = z.object({
  provider: z.string().min(1),          // "google" | "meta" | etc.
  scopes: z.array(z.string()),
  callbackPath: z.string().min(1),      // e.g. "/api/apps/google-ads/callback"
});

export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

// ── Account Select Config ───────────────────────────────────────

export const AccountSelectConfigSchema = z.object({
  fetchEndpoint: z.string().min(1),     // internal API route that returns options
  labelKey: z.string().min(1),          // key in response object to use as label
  valueKey: z.string().min(1),          // key to store as selected value
});

export type AccountSelectConfig = z.infer<typeof AccountSelectConfigSchema>;

// ── Setup Step ──────────────────────────────────────────────────

export const SetupStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "Step ID must be kebab-case"),
  type: SetupStepTypeSchema,
  title: z.string().min(1),             // Swedish
  description: z.string().min(1),       // Swedish
  required: z.boolean(),
  dependsOn: z.string().optional(),     // step id that must complete first

  // Type-specific config — only the matching one should be set
  oauthConfig: OAuthConfigSchema.optional(),
  apiKeyConfig: z.object({ fields: z.array(ApiKeyFieldSchema) }).optional(),
  accountSelectConfig: AccountSelectConfigSchema.optional(),
  configFields: z.array(ConfigFieldSchema).optional(),
});

export type SetupStep = z.infer<typeof SetupStepSchema>;

// ── Health Check Config ──────────────────────────────────────────

export const HealthCheckConfigSchema = z.object({
  endpoint: z.string().min(1),          // internal API route: "/api/apps/google-ads/health"
  intervalMinutes: z.number().int().min(1), // how often to check (e.g. 15)
  timeoutMs: z.number().int().min(1000).default(10000), // request timeout
  degradedThresholdMs: z.number().int().min(100), // latency above this = DEGRADED
});

export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;

// ── Health Status ───────────────────────────────────────────────

export const HealthStatusValues = [
  "HEALTHY",
  "DEGRADED",
  "UNHEALTHY",
  "UNCHECKED",
] as const;

export type HealthStatus = (typeof HealthStatusValues)[number];

// ── App Listing Rich Content ────────────────────────────────────

export const AppHighlightSchema = z.object({
  icon: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});

export type AppHighlight = z.infer<typeof AppHighlightSchema>;

export const AppScreenshotSchema = z.object({
  url: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
});

export type AppScreenshot = z.infer<typeof AppScreenshotSchema>;

export const AppServiceSchema = z.object({
  name: z.string().min(1),
  iconUrl: z.string().optional(),
});

export type AppService = z.infer<typeof AppServiceSchema>;

export const AppChangelogEntrySchema = z.object({
  version: z.string().min(1),
  date: z.string().min(1),
  changes: z.array(z.string()),
});

export type AppChangelogEntry = z.infer<typeof AppChangelogEntrySchema>;

// ── App Definition ──────────────────────────────────────────────

export const AppDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "App ID must be kebab-case"),
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  iconUrl: z.string().url().optional(),
  category: AppCategorySchema,
  developer: z.enum(["bedfront", "partner"]),
  pricing: z.array(AppPricingSchema),
  requiredSetup: z.array(SetupRequirementSchema),
  dependencies: z.array(z.string()),
  permissions: z.array(AppPermissionSchema),
  webhooks: z.array(z.string()),
  setupSteps: z.array(SetupStepSchema),
  termsUrl: z.string().url().optional(),
  healthCheck: HealthCheckConfigSchema.optional(),
  wizardComponent: z.enum(["google-ads", "meta-ads", "mailchimp"]).optional(),

  // Rich listing content
  highlights: z.array(AppHighlightSchema).default([]),
  screenshots: z.array(AppScreenshotSchema).default([]),
  longDescription: z.string().default(""),
  installCount: z.number().int().optional(),
  worksWithApps: z.array(z.string()).default([]),
  worksWithServices: z.array(AppServiceSchema).default([]),
  supportUrl: z.string().optional(),
  documentationUrl: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  changelog: z.array(AppChangelogEntrySchema).default([]),
});

export type AppDefinition = z.infer<typeof AppDefinitionSchema>;

// ── Setup Status ────────────────────────────────────────────────

export const SetupStatusSchema = z.object({
  pms: z.object({
    complete: z.boolean(),
    provider: z.string().optional(),
  }),
  payments: z.object({
    complete: z.boolean(),
  }),
  isReadyForApps: z.boolean(),
});

export type SetupStatus = z.infer<typeof SetupStatusSchema>;

// ── Install Result ──────────────────────────────────────────────

export type InstallResult =
  | { ok: true; tenantAppId: string }
  | { ok: false; error: string };

// ── App Status (mirrors Prisma enum) ────────────────────────────

export const AppStatusValues = [
  "PENDING_SETUP",
  "ACTIVE",
  "ERROR",
  "PAUSED",
  "UNINSTALLED",
] as const;

export type AppStatus = (typeof AppStatusValues)[number];

// ── App Event Type (mirrors Prisma enum) ────────────────────────

export const AppEventTypeValues = [
  "INSTALLED",
  "SETUP_STARTED",
  "SETUP_COMPLETED",
  "ACTIVATED",
  "PAUSED",
  "ERROR_OCCURRED",
  "ERROR_RESOLVED",
  "UNINSTALLED",
  "SETTINGS_UPDATED",
  "TIER_CHANGED",
] as const;

export type AppEventType = (typeof AppEventTypeValues)[number];

// ── Wizard State (returned by getWizardState) ───────────────────

export type WizardState = {
  wizard: {
    id: string;
    tenantId: string;
    appId: string;
    currentStepId: string;
    completedSteps: string[];
    stepData: Record<string, unknown>;
    termsAccepted: boolean;
    termsAcceptedAt: Date | null;
    planSelected: string | null;
    startedAt: Date;
    completedAt: Date | null;
    abandonedAt: Date | null;
  };
  app: AppDefinition;
  currentStep: SetupStep;
  completedStepIds: string[];
  totalSteps: number;
  currentStepIndex: number;    // 1-based for "Steg 2 av 4" display
  canFinalize: boolean;        // all required steps complete
};
