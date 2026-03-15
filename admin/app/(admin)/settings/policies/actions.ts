"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";

/** Valid policy IDs — must match POLICY_ITEMS in PoliciesContent.tsx */
const VALID_POLICY_IDS = [
  "booking-terms",
  "checkin-terms",
  "house-rules",
  "privacy-policy",
  "terms-of-service",
] as const;

type PolicyId = (typeof VALID_POLICY_IDS)[number];

export type PolicyRecord = {
  policyId: string;
  content: string;
  updatedAt: string;
};

// ── getPolicies ──────────────────────────────────────────────
// Readable by any org member — no admin guard.

export async function getPolicies(): Promise<PolicyRecord[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const policies = await prisma.tenantPolicy.findMany({
    where: { tenantId: tenantData.tenant.id },
    select: { policyId: true, content: true, updatedAt: true },
  });

  return policies.map((p) => ({
    policyId: p.policyId,
    content: p.content,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

// ── getPolicy ────────────────────────────────────────────────
// Fetch a single policy by ID. Used for guest-facing lookups.

export async function getPolicy(policyId: string): Promise<PolicyRecord | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const policy = await prisma.tenantPolicy.findUnique({
    where: {
      tenantId_policyId: {
        tenantId: tenantData.tenant.id,
        policyId,
      },
    },
    select: { policyId: true, content: true, updatedAt: true },
  });

  if (!policy) return null;

  return {
    policyId: policy.policyId,
    content: policy.content,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

// ── savePolicy ───────────────────────────────────────────────

export async function savePolicy(
  policyId: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (!VALID_POLICY_IDS.includes(policyId as PolicyId)) {
    return { ok: false, error: "Ogiltig policy-typ" };
  }

  const trimmed = content.trim();

  try {
    if (!trimmed) {
      // Empty content = delete the policy
      await prisma.tenantPolicy.deleteMany({
        where: {
          tenantId: tenantData.tenant.id,
          policyId,
        },
      });
    } else {
      // Upsert: create or update
      await prisma.tenantPolicy.upsert({
        where: {
          tenantId_policyId: {
            tenantId: tenantData.tenant.id,
            policyId,
          },
        },
        create: {
          tenantId: tenantData.tenant.id,
          policyId,
          content: trimmed,
        },
        update: {
          content: trimmed,
        },
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[savePolicy] Error:", error);
    return { ok: false, error: "Kunde inte spara policyn — försök igen" };
  }
}

// ── Public lookup (for guest portal) ─────────────────────────
// Fetches a policy by tenant slug + policyId — no auth required.

export async function getPublicPolicy(
  tenantSlug: string,
  policyId: string,
): Promise<{ content: string; updatedAt: string } | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) return null;

  const policy = await prisma.tenantPolicy.findUnique({
    where: {
      tenantId_policyId: {
        tenantId: tenant.id,
        policyId,
      },
    },
    select: { content: true, updatedAt: true },
  });

  if (!policy) return null;

  return {
    content: policy.content,
    updatedAt: policy.updatedAt.toISOString(),
  };
}
