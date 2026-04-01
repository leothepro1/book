/**
 * Automation Enrollment Worker
 * ════════════════════════════
 *
 * Processes pending automation enrollments in batches.
 * Each enrollment progresses through EmailAutomationSteps,
 * sending marketing emails via sendMarketingEmail().
 *
 * Concurrency safety: uses SELECT ... FOR UPDATE SKIP LOCKED
 * to prevent double-processing by concurrent workers.
 *
 * Never throws — always returns { processed, failed }.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { sendMarketingEmail } from "@/app/_lib/email/sendMarketingEmail";
import { renderEmailBlocks, renderVariables } from "@/app/_lib/email/renderEmailBlocks";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

interface WorkerResult {
  processed: number;
  failed: number;
}

interface ClaimedEnrollment {
  id: string;
  tenantId: string;
  automationId: string;
  guestId: string;
  currentStepId: string | null;
}

// ── Constants ──────────────────────────────────────────────────

const BATCH_SIZE = 50;
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// ── Main function ──────────────────────────────────────────────

export async function processAutomationEnrollments(): Promise<WorkerResult> {
  let processed = 0;
  let failed = 0;

  try {
    // ── Step 0: Fail stuck enrollments ───────────────────────
    await failStuckEnrollments();

    // ── Step 1: Claim pending enrollments (atomic) ──────────
    const claimed = await claimEnrollments();

    if (claimed.length === 0) {
      return { processed: 0, failed: 0 };
    }

    log("info", "automation_worker.claimed", {
      count: claimed.length,
    });

    // ── Step 2: Process each claimed enrollment ─────────────
    for (const enrollment of claimed) {
      try {
        await processEnrollment(enrollment);
        processed++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : "Unknown error";
        log("error", "automation_worker.enrollment_failed", {
          enrollmentId: enrollment.id,
          automationId: enrollment.automationId,
          tenantId: enrollment.tenantId,
          error: message,
        });

        // Mark as FAILED so it doesn't get picked up again
        try {
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "FAILED" },
          });
        } catch {
          // Best effort — don't let meta-failure crash the loop
        }
      }
    }

    log("info", "automation_worker.completed", {
      processed,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "automation_worker.batch_failed", { error: message });
  }

  return { processed, failed };
}

// ── Step 0: Fail stuck enrollments ─────────────────────────────

async function failStuckEnrollments(): Promise<void> {
  const threshold = new Date(Date.now() - STUCK_THRESHOLD_MS);

  const result = await prisma.automationEnrollment.updateMany({
    where: {
      status: "ACTIVE",
      claimedAt: { lt: threshold },
    },
    data: { status: "FAILED" },
  });

  if (result.count > 0) {
    log("warn", "automation_worker.stuck_enrollments_failed", {
      count: result.count,
    });
  }
}

// ── Step 1: Claim enrollments (atomic, skip locked) ────────────

async function claimEnrollments(): Promise<ClaimedEnrollment[]> {
  const now = new Date();

  // SELECT ... FOR UPDATE SKIP LOCKED ensures two concurrent
  // workers never claim the same enrollment.
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedEnrollment[]>`
      UPDATE "AutomationEnrollment"
      SET "status" = 'ACTIVE',
          "claimedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" IN (
        SELECT "id"
        FROM "AutomationEnrollment"
        WHERE "status" = 'PENDING'
          AND "scheduledAt" <= ${now}
          AND "claimedAt" IS NULL
        ORDER BY "scheduledAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "tenantId", "automationId", "guestId", "currentStepId"
    `;
    return rows;
  });

  return claimed;
}

// ── Step 2: Process a single enrollment ────────────────────────

async function processEnrollment(
  enrollment: ClaimedEnrollment,
): Promise<void> {
  const { id, tenantId, automationId, guestId, currentStepId } = enrollment;

  // Fetch automation + all steps + guest + tenant
  const [automation, guest, tenant] = await Promise.all([
    prisma.emailAutomation.findUnique({
      where: { id: automationId },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: { template: true },
        },
      },
    }),
    prisma.guestAccount.findUnique({
      where: { id: guestId },
      select: { email: true, firstName: true, lastName: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    }),
  ]);

  if (!automation || !guest || !tenant) {
    log("error", "automation_worker.missing_data", {
      enrollmentId: id,
      tenantId,
      hasAutomation: !!automation,
      hasGuest: !!guest,
      hasTenant: !!tenant,
    });
    await prisma.automationEnrollment.update({
      where: { id },
      data: { status: "FAILED" },
    });
    return;
  }

  // Determine which step to execute
  const steps = automation.steps;
  let stepIndex: number;

  if (currentStepId === null) {
    // First step
    stepIndex = 0;
  } else {
    const currentIndex = steps.findIndex((s) => s.id === currentStepId);
    stepIndex = currentIndex + 1;
  }

  // No more steps → complete
  if (stepIndex >= steps.length) {
    await prisma.automationEnrollment.update({
      where: { id },
      data: { status: "COMPLETED", claimedAt: null },
    });
    return;
  }

  const step = steps[stepIndex];
  const template = step.template;

  // Build template variables
  const vars: Record<string, string> = {
    "guest.firstName": guest.firstName ?? "",
    "guest.lastName": guest.lastName ?? "",
    "guest.email": guest.email,
    "tenant.name": tenant.name,
  };

  // Render subject with variable substitution
  const renderedSubject = renderVariables(template.subject, vars);

  // Render blocks JSON to HTML
  const htmlBody = renderEmailBlocks(template.blocks, vars);

  // Send marketing email
  const result = await sendMarketingEmail({
    tenantId,
    recipientEmail: guest.email,
    recipientName: guest.firstName,
    subject: renderedSubject,
    htmlBody,
    enrollmentId: id,
  });

  if (!result.success) {
    log("error", "automation_worker.send_failed", {
      enrollmentId: id,
      automationId,
      tenantId,
      stepId: step.id,
      error: result.error ?? "Unknown",
    });
    await prisma.automationEnrollment.update({
      where: { id },
      data: { status: "FAILED" },
    });
    return;
  }

  // Determine next state
  const nextStepIndex = stepIndex + 1;
  const hasMoreSteps = nextStepIndex < steps.length;

  if (hasMoreSteps) {
    const nextStep = steps[nextStepIndex];
    const nextScheduledAt = new Date(
      Date.now() + nextStep.delaySeconds * 1000,
    );

    await prisma.automationEnrollment.update({
      where: { id },
      data: {
        currentStepId: step.id,
        status: "PENDING",
        claimedAt: null,
        scheduledAt: nextScheduledAt,
      },
    });
  } else {
    await prisma.automationEnrollment.update({
      where: { id },
      data: {
        currentStepId: step.id,
        status: "COMPLETED",
        claimedAt: null,
      },
    });
  }

  log("info", "automation_worker.step_completed", {
    enrollmentId: id,
    automationId,
    tenantId,
    stepId: step.id,
    stepOrder: step.order,
    hasMoreSteps,
  });
}

