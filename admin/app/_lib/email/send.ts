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
import { checkEmailRateLimit, recordEmailSend } from "./rate-limit";
import { tenantFromAddress } from "@/app/_lib/tenant/portal-slug";
import { resolveBranding } from "./branding";
import { resolveTemplateHtml } from "./template-overrides";
import type { EmailEventType } from "./registry";
import type { ResolvedEmailTemplate } from "./types";

const IS_DEV = process.env.NODE_ENV === "development";

// ── Result type ─────────────────────────────────────────────────

export type EmailSendResult =
  | { status: "sent" }
  | { status: "rate_limited" }
  | { status: "skipped_unsubscribed" }
  | { status: "failed"; error: unknown };

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
      select: {
        id: true, name: true, emailFrom: true, emailFromName: true,
        portalSlug: true, emailLogoUrl: true, emailLogoWidth: true, emailAccentColor: true,
      },
    }),
    prisma.emailTemplate.findUnique({
      where: { tenantId_eventType: { tenantId, eventType } },
    }),
  ]);

  const def = getEventDefinition(eventType);

  // Resolve branding — only applied to platform default templates
  const branding = resolveBranding(tenant);

  // Render platform default (with branding) as fallback
  const defaultHtml = await renderDefaultTemplate(eventType, variables, branding);

  // resolveTemplateHtml is the single source of truth for default vs override
  const { html } = resolveTemplateHtml(eventType, override?.html, defaultHtml);

  const subject = override?.subject ?? def.defaultSubject;
  const previewText = override?.previewText ?? def.defaultPreviewText;

  // Resolve from address — priority:
  // 1. Custom emailFrom (tenant verified their own domain)
  // 2. portalSlug-based: noreply@{slug}.bedfront.com
  // 3. Fallback: noreply@bedfront.com (no portalSlug)
  const from = tenantFromAddress(
    tenant.name,
    tenant.portalSlug,
    tenant.emailFrom,
    tenant.emailFromName,
  );

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
 *   2. Check rate limit — skip silently if exceeded
 *   3. Create send log entry (QUEUED)
 *   4. Resolve template + render
 *   5. Send via Resend with List-Unsubscribe headers
 *   6. Update log entry (SENT or FAILED)
 *   7. Record send for rate limiting
 *
 * Returns an EmailSendResult indicating what happened.
 */
export async function sendEmailEvent(
  tenantId: string,
  eventType: EmailEventType,
  to: string,
  variables: Record<string, string>,
  options?: { testMode?: boolean },
): Promise<EmailSendResult> {
  // 1. Check unsubscribe — must be first, before any template work
  const unsubscribed = await prisma.emailUnsubscribe.findUnique({
    where: { tenantId_email: { tenantId, email: to } },
    select: { id: true },
  });
  if (unsubscribed) return { status: "skipped_unsubscribed" };

  // 2. Check rate limit — skip silently if exceeded
  const allowed = await checkEmailRateLimit(tenantId, to, eventType);
  if (!allowed) {
    console.warn(
      `[email] Rate limit reached: ${eventType} to ${to} for tenant ${tenantId}`,
    );
    return { status: "rate_limited" };
  }

  // 3. Create send log entry
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

  // 5. Send via Resend (or log in dev mode)
  try {
    if (IS_DEV) {
      // Dev mode: log to console instead of sending via Resend.
      // The full pipeline runs (template resolution, branding, variables)
      // so the UI and data layer behave identically to production.
      console.log(
        `\n[email-dev] ════════════════════════════════════════`,
        `\n  Event:   ${eventType}`,
        `\n  To:      ${to}`,
        `\n  From:    ${resolved.from}`,
        `\n  Subject: ${renderedSubject}`,
        `\n  Preview: ${renderedPreviewText}`,
        `\n  HTML:    ${finalHtml.length} chars`,
        `\n════════════════════════════════════════════════════\n`,
      );

      // Update log as SENT so the UI reflects success
      await prisma.emailSendLog.update({
        where: { id: logEntry.id },
        data: { status: "SENT", resendId: `dev_${Date.now()}` },
      });

      await recordEmailSend(tenantId, to, eventType);
      return { status: "sent" };
    }

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

    // 7. Record send for rate limiting
    await recordEmailSend(tenantId, to, eventType);

    return { status: "sent" };
  } catch (err) {
    // Ensure log is updated even on unexpected errors
    if (err instanceof Error && !err.message.startsWith("[email] Resend")) {
      await prisma.emailSendLog.update({
        where: { id: logEntry.id },
        data: { status: "FAILED", error: err.message },
      }).catch(() => {}); // don't mask the original error
    }
    return { status: "failed", error: err };
  }
}
