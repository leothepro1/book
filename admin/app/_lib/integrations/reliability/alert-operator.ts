/**
 * Operator Alert — terminal-failure email escalation
 * ════════════════════════════════════════════════════
 *
 * Sends a direct email to the platform operator when a reliability-
 * engine state transitions to an UNRECOVERABLE position — currently
 * used by:
 *
 *   - outbound.ts on COMPENSATION_FAILED (guest paid, PMS rejected,
 *     refund also failed — money is STUCK until a human acts)
 *
 * Intentionally NOT routed through sendEmailEvent / the email
 * registry — this is a platform-ops email, not a guest-facing
 * communication. It has no tenant branding, no unsubscribe link,
 * no template customisation. Direct Resend call with a minimal
 * payload.
 *
 * Recipient resolution:
 *   1. OPERATOR_ALERT_EMAIL env var (explicit override)
 *   2. Falls back to a platform default — if neither is set, the
 *      function logs a warning and no email is sent (so unit tests
 *      and local dev don't crash).
 *
 * Never throws. Operator-alert failures are logged but must not
 * block the state-machine transition that triggered them — the
 * row is already terminally DEAD, and failing here would only add
 * noise without doing anything useful.
 */

import { getResendClient } from "@/app/_lib/email/client";
import { env } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

export interface OperatorAlertArgs {
  /** Short subject line — will be prefixed with "[PMS ALERT]". */
  subject: string;
  /** Plain-text or simple HTML body. */
  body: string;
  /** For audit context — logged with the send attempt. */
  tenantId?: string;
  /** Severity hint for mail-filter / escalation rules. */
  severity?: "urgent" | "warning";
}

function resolveOperatorEmail(): string | null {
  const explicit = process.env.OPERATOR_ALERT_EMAIL;
  if (explicit && explicit.includes("@")) return explicit;

  // Fallback — platform owner. Only used if OPERATOR_ALERT_EMAIL
  // isn't configured. Should be overridden in production via env.
  const fallback = process.env.PLATFORM_ADMIN_EMAIL;
  if (fallback && fallback.includes("@")) return fallback;

  return null;
}

export async function sendOperatorAlert(args: OperatorAlertArgs): Promise<void> {
  const to = resolveOperatorEmail();
  if (!to) {
    log("warn", "pms.operator_alert.no_recipient_configured", {
      tenantId: args.tenantId,
      subject: args.subject,
    });
    return;
  }

  const severity = args.severity ?? "urgent";
  const subjectPrefix = severity === "urgent" ? "[PMS URGENT]" : "[PMS]";

  // From-address: noreply on the platform domain. We don't need a
  // branded sender for internal ops mail. Keep DMARC-compatible by
  // using a domain we verify.
  const from =
    process.env.OPERATOR_ALERT_FROM ??
    "PMS Reliability <noreply@rutgr.com>";

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from,
      to,
      subject: `${subjectPrefix} ${args.subject}`,
      text: args.body,
    });
    log("info", "pms.operator_alert.sent", {
      tenantId: args.tenantId,
      to,
      severity,
    });
  } catch (err) {
    log("error", "pms.operator_alert.send_failed", {
      tenantId: args.tenantId,
      to,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
