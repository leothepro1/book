"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import {
  createResendDomain,
  getResendDomainStatus,
  deleteResendDomain,
} from "@/app/_lib/email/domains";
import type { DnsRecord } from "@/app/_lib/email/domains";

// ── Types ───────────────────────────────────────────────────────

export type EmailDomainRecord = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED" | "FAILED";
  dnsRecords: DnsRecord[];
  verifiedAt: string | null;
};

const DOMAIN_REGEX = /^[a-z0-9]+([-.]?[a-z0-9]+)*\.[a-z]{2,}$/i;

// ── getEmailDomain ──────────────────────────────────────────────

export async function getEmailDomain(): Promise<EmailDomainRecord | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const domain = await prisma.emailDomain.findFirst({
    where: { tenantId: tenantData.tenant.id },
  });

  if (!domain) return null;

  return {
    id: domain.id,
    domain: domain.domain,
    status: domain.status as "PENDING" | "VERIFIED" | "FAILED",
    dnsRecords: (domain.dnsRecords as unknown as DnsRecord[]) ?? [],
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
  };
}

// ── addEmailDomain ──────────────────────────────────────────────

export async function addEmailDomain(domain: string): Promise<{
  success: boolean;
  error?: string;
  domain?: EmailDomainRecord;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { success: false, error: "Inte inloggad" };

  const normalized = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(normalized)) {
    return { success: false, error: "Ogiltigt domänformat" };
  }

  // Check not already added
  const existing = await prisma.emailDomain.findUnique({
    where: {
      tenantId_domain: {
        tenantId: tenantData.tenant.id,
        domain: normalized,
      },
    },
  });
  if (existing) {
    return { success: false, error: "Domänen är redan tillagd" };
  }

  try {
    const result = await createResendDomain(normalized);

    const record = await prisma.emailDomain.create({
      data: {
        tenantId: tenantData.tenant.id,
        domain: normalized,
        resendDomainId: result.resendDomainId,
        status: "PENDING",
        dnsRecords: JSON.parse(JSON.stringify(result.dnsRecords)),
      },
    });

    return {
      success: true,
      domain: {
        id: record.id,
        domain: record.domain,
        status: "PENDING",
        dnsRecords: result.dnsRecords,
        verifiedAt: null,
      },
    };
  } catch (error) {
    console.error("[addEmailDomain] Error:", error);
    const message = error instanceof Error ? error.message : "Okänt fel";
    return { success: false, error: `Kunde inte lägga till domänen: ${message}` };
  }
}

// ── checkDomainVerification ─────────────────────────────────────

export async function checkDomainVerification(domainId: string): Promise<{
  status: "PENDING" | "VERIFIED" | "FAILED";
  verifiedAt?: string;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { status: "PENDING", error: guard.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { status: "PENDING", error: "Inte inloggad" };

  const domain = await prisma.emailDomain.findFirst({
    where: { id: domainId, tenantId: tenantData.tenant.id },
  });
  if (!domain) return { status: "PENDING", error: "Domänen hittades inte" };

  if (!domain.resendDomainId) {
    return { status: "FAILED", error: "Domänen saknar Resend-ID" };
  }

  try {
    const result = await getResendDomainStatus(domain.resendDomainId);

    const mappedStatus =
      result.status === "verified"
        ? "VERIFIED"
        : result.status === "failed"
          ? "FAILED"
          : "PENDING";

    if (mappedStatus === "VERIFIED" && domain.status !== "VERIFIED") {
      const now = new Date();
      await prisma.emailDomain.update({
        where: { id: domainId },
        data: { status: "VERIFIED", verifiedAt: now },
      });

      // Auto-set emailFrom on tenant if not already set
      const tenant = tenantData.tenant;
      if (!tenant.emailFrom) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            emailFrom: `noreply@${domain.domain}`,
            emailFromName: tenant.emailFromName ?? tenant.name,
          },
        });
      }

      return { status: "VERIFIED", verifiedAt: now.toISOString() };
    }

    if (mappedStatus !== domain.status) {
      await prisma.emailDomain.update({
        where: { id: domainId },
        data: { status: mappedStatus },
      });
    }

    return {
      status: mappedStatus as "PENDING" | "VERIFIED" | "FAILED",
      verifiedAt: domain.verifiedAt?.toISOString(),
    };
  } catch (error) {
    console.error("[checkDomainVerification] Error:", error);
    return { status: "PENDING", error: "Kunde inte kontrollera verifieringen" };
  }
}

// ── removeEmailDomain ───────────────────────────────────────────

export async function removeEmailDomain(domainId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const domain = await prisma.emailDomain.findFirst({
    where: { id: domainId, tenantId: tenantData.tenant.id },
  });
  if (!domain) return { ok: false, error: "Domänen hittades inte" };

  // Delete from Resend (best-effort — domain may already be gone)
  if (domain.resendDomainId) {
    try {
      await deleteResendDomain(domain.resendDomainId);
    } catch (err) {
      console.error("[removeEmailDomain] Resend delete error (non-fatal):", err);
    }
  }

  // Delete from DB
  await prisma.emailDomain.delete({ where: { id: domainId } });

  // Clear emailFrom if this domain was in use
  const tenant = tenantData.tenant;
  if (tenant.emailFrom && tenant.emailFrom.endsWith(`@${domain.domain}`)) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { emailFrom: null, emailFromName: null },
    });
  }

  return { ok: true };
}
