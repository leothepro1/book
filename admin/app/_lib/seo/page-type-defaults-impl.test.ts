import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma", () => ({
  prisma: {
    pageTypeSeoDefault: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../logger", () => ({ log: vi.fn() }));

import { prisma } from "../db/prisma";
import { log } from "../logger";

import {
  RESOURCE_TYPE_TO_PAGE_TYPE,
  createPageTypeSeoDefaultRepository,
} from "./page-type-defaults-impl";
import { SeoResourceTypes } from "./types";

type FindUnique = typeof prisma.pageTypeSeoDefault.findUnique;

beforeEach(() => {
  vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUnique).mockReset();
  vi.mocked(log).mockClear();
});

describe("RESOURCE_TYPE_TO_PAGE_TYPE", () => {
  it("covers every SeoResourceType exhaustively", () => {
    for (const rt of SeoResourceTypes) {
      expect(RESOURCE_TYPE_TO_PAGE_TYPE[rt]).toBeDefined();
    }
  });

  it("maps lowercase engine types to UPPERCASE DB enum values", () => {
    expect(RESOURCE_TYPE_TO_PAGE_TYPE.accommodation).toBe("ACCOMMODATION");
    expect(RESOURCE_TYPE_TO_PAGE_TYPE.accommodation_category).toBe(
      "ACCOMMODATION_CATEGORY",
    );
    expect(RESOURCE_TYPE_TO_PAGE_TYPE.homepage).toBe("HOMEPAGE");
    expect(RESOURCE_TYPE_TO_PAGE_TYPE.search).toBe("SEARCH");
  });
});

describe("createPageTypeSeoDefaultRepository.get", () => {
  it("issues a unique lookup on (tenantId, pageType)", async () => {
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUnique).mockResolvedValue(
      null,
    );

    const repo = createPageTypeSeoDefaultRepository();
    await repo.get("tenant_t", "accommodation");

    expect(prisma.pageTypeSeoDefault.findUnique).toHaveBeenCalledWith({
      where: { tenantId_pageType: { tenantId: "tenant_t", pageType: "ACCOMMODATION" } },
    });
  });

  it("returns null when no row is configured for that page type", async () => {
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUnique).mockResolvedValue(
      null,
    );

    const repo = createPageTypeSeoDefaultRepository();
    const result = await repo.get("tenant_t", "accommodation");

    expect(result).toBeNull();
  });

  it("returns the Prisma row when configured", async () => {
    const row = {
      id: "ptd_1",
      tenantId: "tenant_t",
      pageType: "ACCOMMODATION" as const,
      titlePattern: "P: {entity.title}",
      descriptionPattern: null,
      ogImagePattern: null,
      structuredDataEnabled: true,
    };
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUnique).mockResolvedValue(
      row,
    );

    const repo = createPageTypeSeoDefaultRepository();
    const result = await repo.get("tenant_t", "accommodation");

    expect(result).toBe(row);
  });

  it("returns null and logs when Prisma raises (degrades gracefully)", async () => {
    vi.mocked(prisma.pageTypeSeoDefault.findUnique as FindUnique).mockRejectedValue(
      new Error("db down"),
    );

    const repo = createPageTypeSeoDefaultRepository();
    const result = await repo.get("tenant_t", "accommodation");

    expect(result).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.page_type_defaults.db_error",
      expect.objectContaining({
        tenantId: "tenant_t",
        resourceType: "accommodation",
      }),
    );
  });
});
