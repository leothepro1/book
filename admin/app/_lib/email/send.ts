/**
 * Email Send Layer
 * ════════════════
 *
 * Core send logic for the email notification system.
 * sendEmailEvent() is the only public function — all other
 * helpers are internal to this file.
 *
 * No logging of email addresses, content, or API keys.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resendClient } from "./client";
import { getEventDefinition } from "./registry";
import { renderTemplate, injectPreviewText } from "./template-utils";
import { renderDefaultTemplate } from "./templates";
import { generateUnsubscribeToken } from "./unsubscribe-token";
import type { EmailEventType } from "./registry";
import type { ResolvedEmailTemplate } from "./types";

// ── getResolvedTemplate ─────────────────────────────────────────

/**
 * Fetch tenant + override from DB, merge with registry defaults,
 * and return a fully resolved template ready for variable substitution.
 */
async function getResolvedTemplate(
  tenantId: string,
  eventType: EmailEventType,
  variables: Record<string, string>,
): Promise<ResolvedEmailTemplate> {
  const [tenant, override] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, emailFrom: true, emailFromName: true },
    }),
    prisma.emailTemplate.findUnique({
      where: { tenantId_eventType: { tenantId, eventType } },
    }),
  ]);

  const def = getEventDefinition(eventType);

  // Resolve HTML — tenant override takes priority, then react-email default
  const html =
    override?.html && override.html.trim().length > 0
      ? override.html
      : await renderDefaultTemplate(eventType, variables);

  const subject = override?.subject ?? def.defaultSubject;
  const previewText = override?.previewText ?? def.defaultPreviewText;

  // Resolve from address
  // emailFrom is set automatically when a domain is verified
  // via checkDomainVerification() in domain-actions.ts
  let from: string;
  if (tenant.emailFrom && tenant.emailFrom.length > 0) {
    const displayName = tenant.emailFromName ?? tenant.name;
    from = `${displayName} <${tenant.emailFrom}>`;
  } else {
    from = `${tenant.name} <onboarding@resend.dev>`;
  }

  return { subject, previewText, html, from };
}

// ── sendEmailEvent (public) ─────────────────────────────────────

/**
 * Send an email notification for a specific event type.
 *
 * This is the only public function in the email module's send layer.
 * All triggers (booking confirmed, magic link, etc.) call this function.
 * Nothing else in the codebase calls resendClient directly.
 *
 * Flow:
 *   1. Check unsubscribe — skip silently if opted out
 *   2. Create send log entry (QUEUED)
 *   3. Resolve template + render
 *   4. Send via Resend with List-Unsubscribe headers
 *   5. Update log entry (SENT or FAILED)
 */
export async function sendEmailEvent(
  tenantId: string,
  eventType: EmailEventType,
  to: string,
  variables: Record<string, string>,
  options?: { testMode?: boolean },
): Promise<void> {
  // 1. Check unsubscribe — must be first, before any template work
  const unsubscribed = await prisma.emailUnsubscribe.findUnique({
    where: { tenantId_email: { tenantId, email: to } },
    select: { id: true },
  });
  if (unsubscribed) return;

  // 2. Create send log entry
  const logEntry = await prisma.emailSendLog.create({
    data: { tenantId, eventType, toEmail: to, status: "QUEUED" },
  });

  // 3. Resolve template + render
  const resolved = await getResolvedTemplate(tenantId, eventType, variables);

  const renderedSubject = options?.testMode
    ? `[TEST] ${renderTemplate(resolved.subject, variables)}`
    : renderTemplate(resolved.subject, variables);
  const renderedPreviewText = renderTemplate(resolved.previewText, variables);
  const renderedHtml = renderTemplate(resolved.html, variables);
  const finalHtml = injectPreviewText(renderedHtml, renderedPreviewText);

  // 4. Build unsubscribe URL + headers
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const unsubscribeToken = generateUnsubscribeToken(tenantId, to);
  const unsubscribeUrl =
    `${appUrl}/unsubscribe?` +
    `tenant=${tenantId}&email=${encodeURIComponent(to)}&` +
    `token=${unsubscribeToken}`;

  // 5. Send via Resend
  try {
    const { data, error } = await resendClient.emails.send({
      from: resolved.from,
      to,
      subject: renderedSubject,
      html: finalHtml,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      await prisma.emailSendLog.update({
        where: { id: logEntry.id },
        data: { status: "FAILED", error: error.message },
      });
      throw new Error(`[email] Resend delivery failed: ${error.message}`);
    }

    // 6. Update log on success
    await prisma.emailSendLog.update({
      where: { id: logEntry.id },
      data: {
        status: "SENT",
        resendId: data?.id ?? null,
      },
    });
  } catch (err) {
    // Ensure log is updated even on unexpected errors
    if (err instanceof Error && !err.message.startsWith("[email] Resend")) {
      await prisma.emailSendLog.update({
        where: { id: logEntry.id },
        data: { status: "FAILED", error: err.message },
      }).catch(() => {}); // don't mask the original error
    }
    throw err;
  }
}
