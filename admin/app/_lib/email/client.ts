/**
 * Resend Client Singleton
 * ═══════════════════════
 *
 * Lazy singleton — instantiated on first call, not at module load.
 * This prevents the build from failing when RESEND_API_KEY is not
 * yet configured in the environment (e.g. during Render builds).
 */

import { Resend } from "resend";
import { env } from "@/app/_lib/env";

let _client: Resend | null = null;

export function getResendClient(): Resend {
  if (!_client) {
    _client = new Resend(env.RESEND_API_KEY);
  }
  return _client;
}

/**
 * @deprecated Use getResendClient() instead. Kept for barrel export compatibility.
 */
export const resendClient = {
  get emails() {
    return getResendClient().emails;
  },
  get domains() {
    return getResendClient().domains;
  },
};
