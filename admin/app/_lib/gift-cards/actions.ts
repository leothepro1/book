"use server";

import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

// ── Helpers ─────────────────────────────────────────────────────

async function getTenant() {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  return prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "presentkort";
}

// ── Design config type ──────────────────────────────────────────

export type DesignConfig = {
  logoUrl: string;
  bgMode: "fill" | "gradient" | "image";
  bgColor: string;
  bgGradientColor2: string;
  bgGradientDir: "down" | "up";
};

export type DesignItem = {
  id: string;
  name: string;
  imageUrl: string;
  config: DesignConfig;
  sortOrder: number;
};

export type GiftCardProductItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  designCount: number;
};

function parseConfig(raw: unknown): DesignConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    logoUrl: (c.logoUrl as string) ?? "",
    bgMode: (c.bgMode as DesignConfig["bgMode"]) ?? "fill",
    bgColor: (c.bgColor as string) ?? "#FFFFFF",
    bgGradientColor2: (c.bgGradientColor2 as string) ?? "#000000",
    bgGradientDir: (c.bgGradientDir as DesignConfig["bgGradientDir"]) ?? "down",
  };
}

function toDesignItem(d: { id: string; name: string; imageUrl: string; config: unknown; sortOrder: number }): DesignItem {
  return { id: d.id, name: d.name, imageUrl: d.imageUrl, config: parseConfig(d.config), sortOrder: d.sortOrder };
}

// ── List all gift card products for tenant ──────────────────────

export async function listGiftCardProducts(): Promise<GiftCardProductItem[]> {
  const tenant = await getTenant();
  if (!tenant) return [];

  const products = await prisma.giftCardProduct.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { designs: true } } },
  });

  return products.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    enabled: p.enabled,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    designCount: p._count.designs,
  }));
}

// ── Get single gift card product ────────────────────────────────

export async function getGiftCardProduct(productId: string) {
  const tenant = await getTenant();
  if (!tenant) return null;

  const product = await prisma.giftCardProduct.findFirst({
    where: { id: productId, tenantId: tenant.id },
    include: {
      designs: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, imageUrl: true, config: true, sortOrder: true },
      },
    },
  });

  if (!product) return null;

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    slug: product.slug,
    status: product.status,
    enabled: product.enabled,
    minAmount: product.minAmount,
    maxAmount: product.maxAmount,
    designs: product.designs.map(toDesignItem),
  };
}

// ── Create new gift card product ────────────────────────────────

export async function createGiftCardProduct(data: {
  title?: string;
}): Promise<{ ok: true; id: string } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  const title = data.title?.trim() || "Presentkort";
  let slug = generateSlug(title);

  // Handle slug collision
  const existing = await prisma.giftCardProduct.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
  });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const product = await prisma.giftCardProduct.create({
    data: {
      tenantId: tenant.id,
      title,
      slug,
      status: "DRAFT",
      enabled: false,
    },
  });

  return { ok: true, id: product.id };
}

// ── Update gift card product settings ───────────────────────────

export async function updateGiftCardProduct(
  productId: string,
  data: {
    title?: string;
    description?: string;
    enabled?: boolean;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
  },
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  const product = await prisma.giftCardProduct.findFirst({
    where: { id: productId, tenantId: tenant.id },
  });
  if (!product) return { error: "Presentkortet hittades inte" };

  await prisma.giftCardProduct.update({
    where: { id: productId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.minAmount !== undefined ? { minAmount: data.minAmount } : {}),
      ...(data.maxAmount !== undefined ? { maxAmount: data.maxAmount } : {}),
    },
  });

  return { ok: true };
}

// ── GiftCardDesign CRUD ─────────────────────────────────────────

export async function createDesign(
  productId: string,
  data: {
    logoUrl: string;
    bgMode: string;
    bgColor: string;
    bgGradientColor2?: string;
    bgGradientDir?: string;
    bgImageUrl?: string;
  },
): Promise<{ ok: true; design: DesignItem } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  const product = await prisma.giftCardProduct.findFirst({
    where: { id: productId, tenantId: tenant.id },
  });
  if (!product) return { error: "Presentkortet hittades inte" };

  const last = await prisma.giftCardDesign.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextOrder = (last?.sortOrder ?? -1) + 1;

  const config: DesignConfig = {
    logoUrl: data.logoUrl || "",
    bgMode: data.bgMode as DesignConfig["bgMode"],
    bgColor: data.bgColor || "#FFFFFF",
    bgGradientColor2: data.bgGradientColor2 || "#000000",
    bgGradientDir: (data.bgGradientDir as DesignConfig["bgGradientDir"]) || "down",
  };

  const design = await prisma.giftCardDesign.create({
    data: {
      tenantId: tenant.id,
      productId,
      name: `Mall ${nextOrder + 1}`,
      imageUrl: data.bgMode === "image" ? (data.bgImageUrl ?? "") : "",
      config,
      sortOrder: nextOrder,
      active: true,
    },
    select: { id: true, name: true, imageUrl: true, config: true, sortOrder: true },
  });

  // Render PNG + upload (best-effort)
  try {
    const { renderGiftCardPNG } = await import("./render");
    const { uploadRenderedDesign } = await import("./upload-rendered");
    const pngBuffer = await renderGiftCardPNG(config, data.bgImageUrl);
    await uploadRenderedDesign(tenant.id, design.id, pngBuffer);
    log("info", "gift-card.design-render-success", { designId: design.id, tenantId: tenant.id });
  } catch (err) {
    log("warn", "gift-card.design-render-failed", { designId: design.id, tenantId: tenant.id, error: String(err) });
  }

  return { ok: true, design: toDesignItem(design) };
}

export async function updateDesign(
  designId: string,
  data: {
    logoUrl: string;
    bgMode: string;
    bgColor: string;
    bgGradientColor2?: string;
    bgGradientDir?: string;
    bgImageUrl?: string;
  },
): Promise<{ ok: true; design: DesignItem } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  const existing = await prisma.giftCardDesign.findFirst({
    where: { id: designId, tenantId: tenant.id },
  });
  if (!existing) return { error: "Mallen hittades inte" };

  const config: DesignConfig = {
    logoUrl: data.logoUrl || "",
    bgMode: data.bgMode as DesignConfig["bgMode"],
    bgColor: data.bgColor || "#FFFFFF",
    bgGradientColor2: data.bgGradientColor2 || "#000000",
    bgGradientDir: (data.bgGradientDir as DesignConfig["bgGradientDir"]) || "down",
  };

  const design = await prisma.giftCardDesign.update({
    where: { id: designId },
    data: {
      imageUrl: data.bgMode === "image" ? (data.bgImageUrl ?? "") : "",
      config,
    },
    select: { id: true, name: true, imageUrl: true, config: true, sortOrder: true },
  });

  try {
    const { renderGiftCardPNG } = await import("./render");
    const { uploadRenderedDesign } = await import("./upload-rendered");
    const pngBuffer = await renderGiftCardPNG(config, data.bgImageUrl);
    await uploadRenderedDesign(tenant.id, design.id, pngBuffer);
  } catch (err) {
    log("warn", "gift-card.design-render-failed", { designId: design.id, tenantId: tenant.id, error: String(err) });
  }

  return { ok: true, design: toDesignItem(design) };
}

export async function deleteDesign(designId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  const design = await prisma.giftCardDesign.findFirst({
    where: { id: designId, tenantId: tenant.id },
  });
  if (!design) return { error: "Mallen hittades inte" };

  await prisma.giftCardDesign.delete({ where: { id: designId } });
  return { ok: true };
}

export async function reorderDesigns(orderedIds: string[]): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const tenant = await getTenant();
  if (!tenant) return { error: "Organisationen hittades inte" };

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.giftCardDesign.updateMany({
        where: { id, tenantId: tenant.id },
        data: { sortOrder: index },
      }),
    ),
  );

  return { ok: true };
}
