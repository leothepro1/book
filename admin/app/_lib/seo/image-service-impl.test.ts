import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/prisma", () => ({
  prisma: {
    mediaAsset: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../logger", () => ({ log: vi.fn() }));

import { prisma } from "../db/prisma";
import { log } from "../logger";

import { createCloudinaryImageService } from "./image-service-impl";

type FindFirst = typeof prisma.mediaAsset.findFirst;

function asset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "media_abc",
    tenantId: "tenant_t",
    publicId: "hospitality/acme/cards/abc",
    url: "https://cdn.example/v1/abc.jpg",
    resourceType: "image",
    filename: "abc.jpg",
    mimeType: "image/jpeg",
    bytes: 12345,
    width: 800,
    height: 600,
    format: "jpg",
    folder: "cards",
    alt: "Stored alt",
    title: "",
    uploadedBy: "user_1",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockReset();
  vi.mocked(log).mockClear();
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
});

describe("createCloudinaryImageService.getOgImage", () => {
  it("returns null when the asset does not exist", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(null);

    const svc = createCloudinaryImageService();
    const result = await svc.getOgImage("missing_id", "tenant_t");

    expect(result).toBeNull();
  });

  it("passes tenantId + id + deletedAt filter to Prisma (tenant isolation)", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(null);

    const svc = createCloudinaryImageService();
    await svc.getOgImage("media_abc", "tenant_t");

    expect(prisma.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "media_abc", tenantId: "tenant_t", deletedAt: null },
    });
  });

  it("returns a ResolvedImage with Cloudinary-transformed URL for a hit", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset() as never,
    );

    const svc = createCloudinaryImageService();
    const result = await svc.getOgImage("media_abc", "tenant_t");

    expect(result).not.toBeNull();
    expect(result?.width).toBe(1200);
    expect(result?.height).toBe(630);
    expect(result?.alt).toBe("Stored alt");
    expect(result?.url).toContain("hospitality/acme/cards/abc");
    expect(result?.url).toContain("res.cloudinary.com/test-cloud/image/upload/");
  });

  it("uses JPG explicitly (not f_auto — Facebook compat)", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset() as never,
    );

    const svc = createCloudinaryImageService();
    const result = await svc.getOgImage("media_abc", "tenant_t");

    // URL must contain explicit f_jpg transform — not f_auto.
    expect(result?.url).toContain("f_jpg");
    expect(result?.url).not.toContain("f_auto");
  });

  it("uses g_auto for subject-aware cropping", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset() as never,
    );

    const svc = createCloudinaryImageService();
    const result = await svc.getOgImage("media_abc", "tenant_t");
    expect(result?.url).toMatch(/g_auto/);
  });

  it("uses the full 1200x630 fill transform", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset() as never,
    );

    const svc = createCloudinaryImageService();
    const result = await svc.getOgImage("media_abc", "tenant_t");
    expect(result?.url).toMatch(/w_1200/);
    expect(result?.url).toMatch(/h_630/);
    expect(result?.url).toMatch(/c_fill/);
  });

  it("alt option overrides the asset's stored alt", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset({ alt: "Stored" }) as never,
    );

    const svc = createCloudinaryImageService();
    const r = await svc.getOgImage("media_abc", "tenant_t", {
      alt: "Override",
    });
    expect(r?.alt).toBe("Override");
  });

  it("falls back to stored alt when option.alt is undefined", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(
      asset({ alt: "Stored" }) as never,
    );

    const svc = createCloudinaryImageService();
    const r = await svc.getOgImage("media_abc", "tenant_t");
    expect(r?.alt).toBe("Stored");
  });

  it("returns null (never throws) when Prisma raises", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockRejectedValue(
      new Error("db down"),
    );

    const svc = createCloudinaryImageService();
    const r = await svc.getOgImage("media_abc", "tenant_t");

    expect(r).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.image_service.db_error",
      expect.objectContaining({
        imageId: "media_abc",
        tenantId: "tenant_t",
      }),
    );
  });

  it("does NOT log for legitimate misses (keeps log volume sane)", async () => {
    vi.mocked(prisma.mediaAsset.findFirst as FindFirst).mockResolvedValue(null);

    const svc = createCloudinaryImageService();
    await svc.getOgImage("missing_id", "tenant_t");

    expect(log).not.toHaveBeenCalled();
  });
});

describe("createCloudinaryImageService.generateDynamicOgImage", () => {
  it("returns null (M3) and logs for ops visibility", async () => {
    const svc = createCloudinaryImageService();
    const r = await svc.generateDynamicOgImage({
      title: "t",
      siteName: "s",
      tenantId: "tenant_t",
    });

    expect(r).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "info",
      "seo.og_image.dynamic_unavailable",
      { tenantId: "tenant_t" },
    );
  });
});
