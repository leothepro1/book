/**
 * Resend Client Singleton
 * ═══════════════════════
 *
 * Single Resend instance for the entire application.
 * Uses validated env — never reads process.env directly.
 */

import { Resend } from "resend";
import { env } from "@/app/_lib/env";

export const resendClient: Resend = new Resend(env.RESEND_API_KEY);
