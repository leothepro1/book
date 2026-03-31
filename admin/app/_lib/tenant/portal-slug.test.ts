import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  nameToSlugBase,
  portalSlugToUrl,
  tenantDefaultEmailFrom,
  tenantFromAddress,
} from "./portal-slug";

// ── nameToSlugBase ──────────────────────────────────────────────

describe("nameToSlugBase", () => {
  it("converts 'Grand Hotel Stockholm' to 'grand-hotel-stockholm'", () => {
    expect(nameToSlugBase("Grand Hotel Stockholm")).toBe("grand-hotel-stockholm");
  });

  it("converts Swedish characters: 'Åre Ski Lodge' to 'are-ski-lodge'", () => {
    expect(nameToSlugBase("Åre Ski Lodge")).toBe("are-ski-lodge");
  });

  it("converts ö and &: 'Öster & Väster Inn' to 'oster-vaster-inn'", () => {
    expect(nameToSlugBase("Öster & Väster Inn")).toBe("oster-vaster-inn");
  });

  it("strips leading and trailing hyphens", () => {
    expect(nameToSlugBase("---Hello World---")).toBe("hello-world");
  });

  it("truncates at 30 characters", () => {
    const long = "A Very Long Hotel Name That Exceeds Thirty Characters Easily";
    const result = nameToSlugBase(long);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("handles empty string", () => {
    expect(nameToSlugBase("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(nameToSlugBase("@#$%^&*")).toBe("");
  });
});

// ── portalSlugToUrl ─────────────────────────────────────────────

describe("portalSlugToUrl", () => {
  it("returns correct https URL", () => {
    expect(portalSlugToUrl("grand-hotel-x4k9mq")).toBe(
      "https://grand-hotel-x4k9mq.rutgr.com",
    );
  });

  it("format is https://{slug}.rutgr.com", () => {
    const slug = "test-slug";
    const url = portalSlugToUrl(slug);
    expect(url).toMatch(/^https:\/\/test-slug\.rutgr\.com$/);
  });
});

// ── generatePortalSlug ──────────────────────────────────────────

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(null), // no collision
    },
  },
}));

describe("generatePortalSlug", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns string containing the name base", async () => {
    const { generatePortalSlug } = await import("./portal-slug");
    const slug = await generatePortalSlug("Grand Hotel");
    expect(slug).toContain("grand-hotel");
  });

  it("returns string ending with 6-char random suffix", async () => {
    const { generatePortalSlug } = await import("./portal-slug");
    const slug = await generatePortalSlug("My Hotel");
    // Format: base-xxxxxx (6 random chars after last hyphen)
    const parts = slug.split("-");
    const suffix = parts[parts.length - 1];
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });

  it("format matches '{base}-{random6}'", async () => {
    const { generatePortalSlug } = await import("./portal-slug");
    const slug = await generatePortalSlug("Test Hotel");
    expect(slug).toMatch(/^test-hotel-[a-z0-9]{6}$/);
  });

  it("handles empty name gracefully", async () => {
    const { generatePortalSlug } = await import("./portal-slug");
    const slug = await generatePortalSlug("");
    expect(slug).toMatch(/^hotel-[a-z0-9]{6}$/);
  });
});

// ── tenantDefaultEmailFrom ──────────────────────────────────────

describe("tenantDefaultEmailFrom", () => {
  it("returns noreply@{slug}.rutgr.com", () => {
    expect(tenantDefaultEmailFrom("grandhotel-x4k9mq")).toBe(
      "noreply@grandhotel-x4k9mq.rutgr.com",
    );
  });

  it("format is always noreply@{slug}.rutgr.com", () => {
    expect(tenantDefaultEmailFrom("test")).toBe("noreply@test.rutgr.com");
  });
});

// ── tenantFromAddress ───────────────────────────────────────────

describe("tenantFromAddress", () => {
  it("uses slug-based address when no custom email", () => {
    const result = tenantFromAddress("Apelviken", "apelviken-dev-3vtczx", null, null);
    expect(result).toBe("Apelviken <noreply@apelviken-dev-3vtczx.rutgr.com>");
  });

  it("uses custom emailFrom when set", () => {
    const result = tenantFromAddress("Grand Hotel", "grand-x4k9mq", "noreply@grandhotel.se", null);
    expect(result).toBe("Grand Hotel <noreply@grandhotel.se>");
  });

  it("uses custom emailFromName when set", () => {
    const result = tenantFromAddress("Grand Hotel", "grand-x4k9mq", null, "GH Support");
    expect(result).toBe("GH Support <noreply@grand-x4k9mq.rutgr.com>");
  });

  it("uses both custom emailFrom and emailFromName", () => {
    const result = tenantFromAddress("Grand Hotel", "grand-x4k9mq", "info@gh.se", "GH Support");
    expect(result).toBe("GH Support <info@gh.se>");
  });

  it("falls back to noreply@rutgr.com when no portalSlug", () => {
    const result = tenantFromAddress("New Hotel", null, null, null);
    expect(result).toBe("New Hotel <noreply@rutgr.com>");
  });

  it("returns correct Name <email> format", () => {
    const result = tenantFromAddress("Test", "test-abc123", null, null);
    expect(result).toMatch(/^.+ <.+@.+>$/);
  });
});
