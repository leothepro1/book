"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth, requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";

export type SegmentListItem = {
  id: string;
  name: string;
  query: string;
  isDefault: boolean;
  memberCount: number;
  totalCustomers: number;
  lastActivity: string | null;
  createdAt: string;
};

export async function getSegments(): Promise<SegmentListItem[]> {
  const { orgId } = await getAuth();
  if (!orgId) return [];

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return [];

  const [segments, totalCustomers] = await Promise.all([
    prisma.guestSegment.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: {
            memberships: { where: { leftAt: null } },
          },
        },
        memberships: {
          where: { leftAt: null },
          orderBy: { joinedAt: "desc" },
          take: 1,
          select: { joinedAt: true },
        },
      },
    }),
    prisma.guestAccount.count({ where: { tenantId: tenant.id } }),
  ]);

  return segments.map((s) => ({
    id: s.id,
    name: s.name,
    query: s.query,
    isDefault: s.isDefault,
    memberCount: s._count.memberships,
    totalCustomers,
    lastActivity: s.memberships[0]?.joinedAt.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function createSegment(
  name: string,
  query: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const trimmedName = name.trim();
  const trimmedQuery = query.trim();
  if (!trimmedName) return { ok: false, error: "Segmentnamnet kan inte vara tomt" };
  if (!trimmedQuery) return { ok: false, error: "Segment-query kan inte vara tom" };

  // Validate the query parses
  try {
    const { parseSegmentQuery } = await import("@/app/_lib/segments/engine");
    parseSegmentQuery(trimmedQuery);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ogiltig query-syntax" };
  }

  const { orgId, userId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const segment = await prisma.guestSegment.create({
    data: {
      tenantId: tenant.id,
      name: trimmedName,
      query: trimmedQuery,
      isDefault: false,
      createdBy: userId,
    },
  });

  // Run initial sync for this segment (non-blocking)
  import("@/app/_lib/segments/sync").then(({ syncSegmentMembers }) =>
    syncSegmentMembers(segment.id, tenant.id),
  ).catch(() => {});

  return { ok: true, id: segment.id };
}

export async function deleteSegment(
  segmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const { orgId } = await getAuth();
  if (!orgId) return { ok: false, error: "Ingen organisation vald" };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Organisationen hittades inte" };

  const segment = await prisma.guestSegment.findFirst({
    where: { id: segmentId, tenantId: tenant.id },
    select: { id: true, isDefault: true },
  });
  if (!segment) return { ok: false, error: "Segmentet hittades inte" };
  if (segment.isDefault) return { ok: false, error: "Standardsegment kan inte tas bort" };

  await prisma.guestSegment.delete({ where: { id: segmentId } });

  return { ok: true };
}
