/**
 * Automation Enrollment Service
 * ═════════════════════════════
 *
 * Creates AutomationEnrollment records when trigger events fire.
 * The automation worker (cron) picks up pending enrollments and
 * sends emails via sendMarketingEmail().
 *
 * Never throws — all errors are caught and logged.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import type { AutomationTrigger } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────

export interface EnrollInAutomationsParams {
  tenantId: string;
  guestId: string;
  trigger: AutomationTrigger;
}

// ── Main function ──────────────────────────────────────────────

export async function enrollInAutomations(
  params: EnrollInAutomationsParams,
): Promise<void> {
  const { tenantId, guestId, trigger } = params;

  try {
    // 1. Check EmailAppInstallation is active
    const installation = await prisma.emailAppInstallation.findUnique({
      where: { tenantId },
      select: { status: true },
    });

    if (!installation || installation.status !== "ACTIVE") {
      return;
    }

    // 2. Get guest email for suppression check
    const guest = await prisma.guestAccount.findUnique({
      where: { id: guestId },
      select: { email: true },
    });

    if (!guest) {
      log("warn", "automation_enroll.guest_not_found", { tenantId, guestId, trigger });
      return;
    }

    // 3. Check suppression
    const suppressed = await prisma.emailSuppression.findUnique({
      where: { tenantId_email: { tenantId, email: guest.email.toLowerCase() } },
      select: { id: true },
    });

    if (suppressed) {
      log("info", "automation_enroll.suppressed", { tenantId, guestId, trigger });
      return;
    }

    // 4. Find active automations for this trigger
    const automations = await prisma.emailAutomation.findMany({
      where: {
        tenantId,
        trigger,
        status: "ACTIVE",
      },
      select: {
        id: true,
        allowReenrollment: true,
        steps: {
          where: { order: 0 },
          select: { id: true, delaySeconds: true },
          take: 1,
        },
      },
    });

    if (automations.length === 0) {
      return;
    }

    let enrolled = 0;

    for (const automation of automations) {
      // 4a. Check re-enrollment
      if (!automation.allowReenrollment) {
        const existing = await prisma.automationEnrollment.findFirst({
          where: {
            automationId: automation.id,
            guestId,
            status: { in: ["PENDING", "ACTIVE", "COMPLETED"] },
          },
          select: { id: true },
        });

        if (existing) {
          continue;
        }
      }

      // 4b. Must have at least one step
      const firstStep = automation.steps[0];
      if (!firstStep) {
        log("warn", "automation_enroll.no_steps", {
          tenantId,
          automationId: automation.id,
          trigger,
        });
        continue;
      }

      // 4c. Create enrollment
      const scheduledAt = new Date(Date.now() + firstStep.delaySeconds * 1000);

      await prisma.automationEnrollment.create({
        data: {
          tenantId,
          automationId: automation.id,
          guestId,
          status: "PENDING",
          currentStepId: null,
          scheduledAt,
          claimedAt: null,
        },
      });

      enrolled++;
    }

    if (enrolled > 0) {
      log("info", "automation_enroll.created", {
        tenantId,
        guestId,
        trigger,
        count: enrolled,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "automation_enroll.failed", {
      tenantId,
      guestId,
      trigger,
      error: message,
    });
  }
}
