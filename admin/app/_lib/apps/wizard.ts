/**
 * App Store — Wizard server actions.
 *
 * Manifest-driven install wizard state machine.
 * Each app declares setupSteps in its definition.
 * The platform renders them generically, the app owns the config shape.
 *
 * startWizard() is idempotent — returns existing wizard if already started.
 * finalizeWizard() is the ONLY function that sets status ACTIVE.
 * TenantAppEvent is append-only — never UPDATE, never DELETE.
 */

"use server";

import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getApp } from "./registry";
import type { WizardState, SetupStep } from "./types";

// Import all app definitions
import "./definitions";

// ── Helpers ─────────────────────────────────────────────────────

async function resolveTenantId(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  return tenantData?.tenant.id ?? null;
}

function getFirstStepId(steps: SetupStep[]): string {
  if (steps.length === 0) return "__none__";
  // First step is one that has no dependsOn
  const first = steps.find((s) => !s.dependsOn);
  return first?.id ?? steps[0].id;
}

function getNextStepId(steps: SetupStep[], completedIds: string[], currentId: string): string | null {
  // Find steps whose dependency is now satisfied and not yet completed
  const remaining = steps.filter((s) => !completedIds.includes(s.id) && s.id !== currentId);
  // Among remaining, find one whose dependsOn is in completed set (or has no dependency)
  const next = remaining.find((s) => !s.dependsOn || completedIds.includes(s.dependsOn));
  return next?.id ?? null;
}

function allRequiredComplete(steps: SetupStep[], completedIds: string[]): boolean {
  return steps
    .filter((s) => s.required)
    .every((s) => completedIds.includes(s.id));
}

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

// ── Start Wizard ────────────────────────────────────────────────

export async function startWizard(appId: string): Promise<ActionResult<{ wizardId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  // Verify app is installed
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!tenantApp || tenantApp.status === "UNINSTALLED") {
    return { ok: false, error: "Appen är inte installerad" };
  }

  // If app has no setup steps, finalize immediately
  if (app.setupSteps.length === 0) {
    await prisma.tenantApp.update({
      where: { id: tenantApp.id },
      data: { status: "ACTIVE", activatedAt: new Date() },
    });
    await prisma.tenantAppEvent.create({
      data: { appId, tenantId, type: "ACTIVATED", message: "App aktiverad (inga installationssteg)" },
    });
    return { ok: true, data: { wizardId: "__auto_activated__" } };
  }

  // Idempotent — return existing active wizard without resetting
  const existing = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });

  if (existing && !existing.completedAt && !existing.abandonedAt) {
    return { ok: true, data: { wizardId: existing.id } };
  }

  // Create new wizard (or reset a completed/abandoned one)
  const firstStepId = getFirstStepId(app.setupSteps);

  const wizard = await prisma.tenantAppWizard.upsert({
    where: { tenantId_appId: { tenantId, appId } },
    create: {
      tenantId,
      appId,
      currentStepId: firstStepId,
    },
    update: existing?.completedAt || existing?.abandonedAt
      ? {
          // Only reset if wizard was previously completed or abandoned
          currentStepId: firstStepId,
          completedSteps: [],
          stepData: {},
          termsAccepted: false,
          termsAcceptedAt: null,
          planSelected: null,
          completedAt: null,
          abandonedAt: null,
          startedAt: new Date(),
        }
      : {}, // Active wizard — never reset (concurrent call protection)
  });

  // Log event only for new wizards
  if (!existing || existing.completedAt || existing.abandonedAt) {
    await prisma.tenantAppEvent.create({
      data: { appId, tenantId, type: "SETUP_STARTED", message: "Installationsguide startad" },
    });
  }

  return { ok: true, data: { wizardId: wizard.id } };
}

// ── Accept Terms ────────────────────────────────────────────────

export async function acceptTerms(appId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard || wizard.completedAt) return { ok: false, error: "Ingen aktiv installationsguide" };

  await prisma.tenantAppWizard.update({
    where: { id: wizard.id },
    data: { termsAccepted: true, termsAcceptedAt: new Date() },
  });

  return { ok: true, data: undefined };
}

// ── Select Plan ─────────────────────────────────────────────────

export async function selectPlan(appId: string, tier: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  // Validate tier exists in app pricing
  const validTier = app.pricing.find((p) => p.tier === tier);
  if (!validTier) return { ok: false, error: `Ogiltigt prisplan: "${tier}"` };

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard || wizard.completedAt) return { ok: false, error: "Ingen aktiv installationsguide" };

  await prisma.tenantAppWizard.update({
    where: { id: wizard.id },
    data: { planSelected: tier },
  });

  // Also update the TenantApp pricing tier
  await prisma.tenantApp.update({
    where: { tenantId_appId: { tenantId, appId } },
    data: { pricingTier: tier },
  });

  await prisma.tenantAppEvent.create({
    data: { appId, tenantId, type: "TIER_CHANGED", message: `Plan valt: ${tier}` },
  });

  return { ok: true, data: undefined };
}

// ── Complete Step ───────────────────────────────────────────────

export async function completeStep(
  appId: string,
  stepId: string,
  data: Record<string, unknown>,
): Promise<ActionResult<{ nextStepId: string | null }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  // Validate step exists in definition
  const step = app.setupSteps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Steget "${stepId}" finns inte` };

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard || wizard.completedAt) return { ok: false, error: "Ingen aktiv installationsguide" };

  const completedSteps = (wizard.completedSteps as string[]) ?? [];

  // Validate dependency
  if (step.dependsOn && !completedSteps.includes(step.dependsOn)) {
    return { ok: false, error: `Steget "${step.dependsOn}" måste slutföras först` };
  }

  // Validate step data based on step type
  const validationError = validateStepData(step, data);
  if (validationError) return { ok: false, error: validationError };

  // Merge step data into accumulator
  const existingData = (wizard.stepData as Record<string, unknown>) ?? {};
  const mergedData = { ...existingData, [stepId]: data };

  // Add to completed steps
  const newCompleted = completedSteps.includes(stepId)
    ? completedSteps
    : [...completedSteps, stepId];

  // Determine next step
  const nextStepId = getNextStepId(app.setupSteps, newCompleted, stepId);

  await prisma.tenantAppWizard.update({
    where: { id: wizard.id },
    data: {
      completedSteps: newCompleted as Prisma.InputJsonValue,
      stepData: mergedData as Prisma.InputJsonValue,
      currentStepId: nextStepId ?? wizard.currentStepId,
    },
  });

  return { ok: true, data: { nextStepId } };
}

// ── Skip Step ───────────────────────────────────────────────────

export async function skipStep(
  appId: string,
  stepId: string,
): Promise<ActionResult<{ nextStepId: string | null }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  const step = app.setupSteps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Steget "${stepId}" finns inte` };

  if (step.required) {
    return { ok: false, error: "Obligatoriska steg kan inte hoppas över" };
  }

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard || wizard.completedAt) return { ok: false, error: "Ingen aktiv installationsguide" };

  const completedSteps = (wizard.completedSteps as string[]) ?? [];
  const newCompleted = completedSteps.includes(stepId)
    ? completedSteps
    : [...completedSteps, stepId];

  const nextStepId = getNextStepId(app.setupSteps, newCompleted, stepId);

  await prisma.tenantAppWizard.update({
    where: { id: wizard.id },
    data: {
      completedSteps: newCompleted as Prisma.InputJsonValue,
      currentStepId: nextStepId ?? wizard.currentStepId,
    },
  });

  return { ok: true, data: { nextStepId } };
}

// ── Finalize Wizard ─────────────────────────────────────────────

export async function finalizeWizard(appId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard) return { ok: false, error: "Ingen installationsguide hittad" };
  if (wizard.completedAt) return { ok: false, error: "Installationsguiden är redan slutförd" };

  const completedSteps = (wizard.completedSteps as string[]) ?? [];

  // 1. All required steps must be completed
  if (!allRequiredComplete(app.setupSteps, completedSteps)) {
    return { ok: false, error: "Alla obligatoriska steg måste slutföras" };
  }

  // 2. Terms accepted if app has termsUrl
  if (app.termsUrl && !wizard.termsAccepted) {
    return { ok: false, error: "Villkoren måste accepteras" };
  }

  // 3. Plan selected if app has paid tiers
  const hasPaidTiers = app.pricing.some((p) => p.pricePerMonth > 0);
  if (hasPaidTiers && !wizard.planSelected) {
    return { ok: false, error: "En prisplan måste väljas" };
  }

  // 4. Set TenantApp.status = ACTIVE, merge stepData into settings
  const stepData = (wizard.stepData as Record<string, unknown>) ?? {};

  await prisma.tenantApp.update({
    where: { tenantId_appId: { tenantId, appId } },
    data: {
      status: "ACTIVE",
      activatedAt: new Date(),
      settings: stepData as Prisma.InputJsonValue,
      pricingTier: wizard.planSelected,
    },
  });

  // 5. Mark wizard completed
  await prisma.tenantAppWizard.update({
    where: { id: wizard.id },
    data: { completedAt: new Date() },
  });

  // 6. Log events
  await prisma.tenantAppEvent.createMany({
    data: [
      { appId, tenantId, type: "SETUP_COMPLETED", message: "Installationsguide slutförd" },
      { appId, tenantId, type: "ACTIVATED", message: "App aktiverad" },
    ],
  });

  // 7. Record billing line item (fire-and-forget)
  if (wizard.planSelected) {
    import("./billing").then(({ recordPlanChange }) =>
      recordPlanChange(tenantId, appId, wizard.planSelected!),
    ).catch((err) => {
      import("@/app/_lib/logger").then(({ log: logFn }) =>
        logFn("error", "wizard.billing_record_failed", { appId, error: String(err) }),
      );
    });
  }

  return { ok: true, data: undefined };
}

// ── Get Wizard State ────────────────────────────────────────────

export async function getWizardState(appId: string): Promise<WizardState | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;

  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  const app = getApp(appId);
  if (!app) return null;

  const wizard = await prisma.tenantAppWizard.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!wizard) return null;

  const completedSteps = (wizard.completedSteps as string[]) ?? [];
  const currentStep = app.setupSteps.find((s) => s.id === wizard.currentStepId);
  if (!currentStep) return null;

  const currentStepIndex = app.setupSteps.findIndex((s) => s.id === wizard.currentStepId) + 1;

  return {
    wizard: {
      id: wizard.id,
      tenantId: wizard.tenantId,
      appId: wizard.appId,
      currentStepId: wizard.currentStepId,
      completedSteps,
      stepData: (wizard.stepData as Record<string, unknown>) ?? {},
      termsAccepted: wizard.termsAccepted,
      termsAcceptedAt: wizard.termsAcceptedAt,
      planSelected: wizard.planSelected,
      startedAt: wizard.startedAt,
      completedAt: wizard.completedAt,
      abandonedAt: wizard.abandonedAt,
    },
    app,
    currentStep,
    completedStepIds: completedSteps,
    totalSteps: app.setupSteps.length,
    currentStepIndex,
    canFinalize: allRequiredComplete(app.setupSteps, completedSteps),
  };
}

// ── Reconfigure Step (post-install, app stays ACTIVE) ───────────

export async function reconfigureStep(
  appId: string,
  stepId: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const app = getApp(appId);
  if (!app) return { ok: false, error: `Appen "${appId}" finns inte` };

  const step = app.setupSteps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: `Steget "${stepId}" finns inte` };

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId } },
  });
  if (!tenantApp) return { ok: false, error: "Appen är inte installerad" };

  // Validate step data
  const validationError = validateStepData(step, data);
  if (validationError) return { ok: false, error: validationError };

  // Merge new step data into existing settings
  const existingSettings = (tenantApp.settings as Record<string, unknown>) ?? {};
  const merged = { ...existingSettings, [stepId]: data };

  await prisma.tenantApp.update({
    where: { id: tenantApp.id },
    data: { settings: merged as Prisma.InputJsonValue },
  });

  await prisma.tenantAppEvent.create({
    data: { appId, tenantId, type: "SETTINGS_UPDATED", message: `Steg "${step.title}" omkonfigurerat` },
  });

  return { ok: true, data: undefined };
}

// ── Step Data Validation ────────────────────────────────────────

function validateStepData(step: SetupStep, data: Record<string, unknown>): string | null {
  switch (step.type) {
    case "api_key": {
      if (!step.apiKeyConfig) return null;
      for (const field of step.apiKeyConfig.fields) {
        const value = data[field.key];
        if (value === undefined || value === null || value === "") {
          return `Fältet "${field.label}" är obligatoriskt`;
        }
        if (typeof value !== "string") {
          return `Fältet "${field.label}" måste vara text`;
        }
      }
      return null;
    }

    case "config": {
      // Config fields use defaults — no required validation needed
      // but validate types if provided
      if (!step.configFields) return null;
      for (const field of step.configFields) {
        const value = data[field.key];
        if (value === undefined) continue; // will use default
        switch (field.type) {
          case "toggle":
            if (typeof value !== "boolean") return `"${field.label}" måste vara sant/falskt`;
            break;
          case "number":
            if (typeof value !== "number") return `"${field.label}" måste vara ett nummer`;
            break;
          case "select":
            if (field.options && !field.options.some((o) => o.value === value)) {
              return `Ogiltigt val för "${field.label}"`;
            }
            break;
        }
      }
      return null;
    }

    case "account_select": {
      if (!data.selectedValue) {
        return "Du måste välja ett konto";
      }
      return null;
    }

    case "oauth": {
      // OAuth completion is verified server-side by the callback handler
      // The step data should contain the tokens/credentials
      if (!data.connected) {
        return "OAuth-anslutning krävs";
      }
      return null;
    }

    case "webhook": {
      // Webhook registration is done by the platform
      return null;
    }

    case "review": {
      // Review step has no data to validate
      return null;
    }

    default:
      return null;
  }
}
