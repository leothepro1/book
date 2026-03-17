/**
 * Resend Domains API Wrapper
 * ══════════════════════════
 *
 * Only file that calls Resend's domain endpoints.
 * Same single-entry-point pattern as resolveAdapter() for PMS.
 */

import { resendClient } from "./client";

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: string;
}

export interface ResendDomainResult {
  resendDomainId: string;
  dnsRecords: DnsRecord[];
  status: "pending" | "verified" | "failed";
}

/**
 * Create a new domain in Resend.
 * Called when tenant adds a sender domain.
 */
export async function createResendDomain(
  domain: string,
): Promise<ResendDomainResult> {
  const { data, error } = await resendClient.domains.create({ name: domain });

  if (error || !data) {
    throw new Error(
      `[email/domains] Failed to create domain "${domain}": ${error?.message ?? "Unknown error"}`,
    );
  }

  const dnsRecords: DnsRecord[] = (data.records ?? []).map(
    (r: { type: string; name: string; value: string; ttl?: string }) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl,
    }),
  );

  return {
    resendDomainId: data.id,
    dnsRecords,
    status: "pending",
  };
}

/**
 * Get current verification status from Resend.
 */
export async function getResendDomainStatus(
  resendDomainId: string,
): Promise<{ status: "pending" | "verified" | "failed" }> {
  const { data, error } = await resendClient.domains.get(resendDomainId);

  if (error || !data) {
    throw new Error(
      `[email/domains] Failed to get domain status: ${error?.message ?? "Unknown error"}`,
    );
  }

  const s = (data.status ?? "not_started") as string;
  if (s === "verified") return { status: "verified" };
  if (s === "failed" || s === "temporary_failure") return { status: "failed" };
  return { status: "pending" };
}

/**
 * Delete a domain from Resend.
 * Called when tenant removes their sender domain.
 */
export async function deleteResendDomain(
  resendDomainId: string,
): Promise<void> {
  const { error } = await resendClient.domains.remove(resendDomainId);

  if (error) {
    throw new Error(
      `[email/domains] Failed to delete domain: ${error.message}`,
    );
  }
}
