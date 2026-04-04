/**
 * DB-backed extractAsync() for translatable resource types.
 *
 * The browser-safe stubs in resource-types.ts register metadata
 * (label, icon, fields) with extract: () => []. This file attaches
 * the actual extractAsync() implementations that query Prisma.
 *
 * Only imported server-side (API routes, server components).
 * Never imported in client components.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { getResourceTypes } from "./resource-types";
import type { TranslatableItem } from "./resource-types";

function attachExtractAsync(
  id: string,
  fn: (tenantId: string) => Promise<TranslatableItem[]>,
) {
  const rt = getResourceTypes().find((r) => r.id === id);
  if (rt) {
    (rt as { extractAsync?: typeof fn }).extractAsync = fn;
  }
}

// ── Products ────────────────────────────────────────────────

attachExtractAsync("products", async (tenantId) => {
  const products = await prisma.product.findMany({
    where: { tenantId, archivedAt: null },
    select: { id: true, title: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
  return products
    .filter((p) => p.title.trim() !== "")
    .map((p): TranslatableItem => ({
      id: p.id,
      name: p.title,
      data: { title: p.title, description: p.description ?? "" },
    }));
});

// ── Product Collections ─────────────────────────────────────

attachExtractAsync("collections", async (tenantId) => {
  const collections = await prisma.productCollection.findMany({
    where: { tenantId },
    select: { id: true, title: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
  return collections
    .filter((c) => c.title.trim() !== "")
    .map((c): TranslatableItem => ({
      id: c.id,
      name: c.title,
      data: { title: c.title, description: c.description ?? "" },
    }));
});

// ── Gift Card Products ──────────────────────────────────────

attachExtractAsync("gift-cards", async (tenantId) => {
  const giftCards = await prisma.giftCardProduct.findMany({
    where: { tenantId },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "asc" },
  });
  return giftCards
    .filter((g) => g.title.trim() !== "")
    .map((g): TranslatableItem => ({
      id: g.id,
      name: g.title,
      data: { title: g.title, description: g.description ?? "" },
    }));
});

// ── Accommodations ──────────────────────────────────────────

attachExtractAsync("accommodations", async (tenantId) => {
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, archivedAt: null },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      description: true,
      descriptionOverride: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  return accommodations.map((a): TranslatableItem => {
    const displayName = a.nameOverride || a.name;
    const displayDesc = a.descriptionOverride || a.description;
    return {
      id: a.id,
      name: displayName,
      data: { name: displayName, description: displayDesc ?? "" },
    };
  });
});

// ── Accommodation Categories ────────────────────────────────

attachExtractAsync("accommodation-categories", async (tenantId) => {
  const categories = await prisma.accommodationCategory.findMany({
    where: { tenantId },
    select: { id: true, title: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
  return categories
    .filter((c) => c.title.trim() !== "")
    .map((c): TranslatableItem => ({
      id: c.id,
      name: c.title,
      data: { title: c.title, description: c.description ?? "" },
    }));
});
