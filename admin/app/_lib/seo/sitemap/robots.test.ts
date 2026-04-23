import { describe, expect, it } from "vitest";

import { buildRobotsTxt } from "./robots";

// ── indexable=true ───────────────────────────────────────────

describe("buildRobotsTxt — indexable=true", () => {
  it("starts with the Bedfront header comment", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    expect(txt.startsWith("# Bedfront robots.txt\n")).toBe(true);
  });

  it("contains the M12 admin-configurable TODO comment", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    expect(txt).toContain(
      "# TODO(m12): make per-tenant Disallow list + AI-bot rules admin-configurable",
    );
  });

  it("declares 'User-agent: *' and 'Allow: /'", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
  });

  it("emits every Disallow path from the spec", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    for (const path of [
      "/admin",
      "/api",
      "/checkout",
      "/cart",
      "/account",
      "/portal",
      "/auth",
      "/login",
      "/register",
      "/order-status",
      "/unsubscribe",
      "/email-unsubscribe",
      "/no-booking",
      "/p/",
      "/shop/checkout",
      "/shop/gift-cards/confirmation",
      "/search",
    ]) {
      expect(txt).toContain(`Disallow: ${path}`);
    }
  });

  it("uses 'Disallow: /search' exactly (not '/search?q=')", () => {
    // Standard-compliant across all major crawlers: prefix matching.
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    expect(txt).toContain("Disallow: /search\n");
    expect(txt).not.toContain("Disallow: /search?");
  });

  it("ends with a Sitemap line on the tenant's primaryDomain", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: true,
    });
    expect(txt).toContain(
      "Sitemap: https://apelviken.rutgr.com/sitemap.xml",
    );
  });

  it("interpolates an alternate primaryDomain into the Sitemap line", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "custom.example.com",
      indexable: true,
    });
    expect(txt).toContain("Sitemap: https://custom.example.com/sitemap.xml");
  });

  it("is deterministic across two calls with identical input", () => {
    const ctx = { primaryDomain: "apelviken.rutgr.com", indexable: true };
    expect(buildRobotsTxt(ctx)).toBe(buildRobotsTxt(ctx));
  });
});

// ── indexable=false (fail-closed) ────────────────────────────

describe("buildRobotsTxt — indexable=false (fail-closed)", () => {
  it("emits exactly 'User-agent: *\\nDisallow: /\\n'", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: false,
    });
    expect(txt).toBe("User-agent: *\nDisallow: /\n");
  });

  it("contains no Sitemap line when indexable=false", () => {
    const txt = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: false,
    });
    expect(txt).not.toContain("Sitemap:");
  });

  it("ignores the primaryDomain when indexable=false", () => {
    // Same output regardless of host — the fail-closed path is a
    // resource-type semantic, not a per-tenant config.
    const a = buildRobotsTxt({
      primaryDomain: "apelviken.rutgr.com",
      indexable: false,
    });
    const b = buildRobotsTxt({
      primaryDomain: "custom.example.com",
      indexable: false,
    });
    expect(a).toBe(b);
  });
});
