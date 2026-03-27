/**
 * Setup Requirements — separate from App Store.
 *
 * getSetupStatus() is the ONLY function that checks PMS + payments readiness.
 * Never inline these checks in app install logic.
 */

import { prisma } from "@/app/_lib/db/prisma";
import type { SetupStatus } from "./types";

/**
 * Check whether a tenant has completed the platform setup prerequisites.
 *
 * - "pms": TenantIntegration exists with status !== "error"
 * - "payments": Tenant.stripeOnboardingComplete === true
 * - isReadyForApps: both are complete
 */
export async function getSetupStatus(tenantId: string): Promise<SetupStatus> {
  const [integration, tenant] = await Promise.all([
    prisma.tenantIntegration.findUnique({
      where: { tenantId },
      select: { provider: true, status: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeOnboardingComplete: true },
    }),
  ]);

  const pmsComplete =
    integration !== null &&
    integration.status !== "error" &&
    integration.status !== "pending";

  const paymentsComplete = tenant?.stripeOnboardingComplete === true;

  return {
    pms: {
      complete: pmsComplete,
      ...(integration ? { provider: integration.provider } : {}),
    },
    payments: {
      complete: paymentsComplete,
    },
    isReadyForApps: true,
  };
}
