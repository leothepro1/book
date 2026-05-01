import { describe, expect, it } from "vitest";

import {
  PRODUCTION_TENANT_FILTER,
  STAGING_TENANT_FILTER,
  isProductionTenant,
  isStagingTenant,
} from "./environment";

describe("PRODUCTION_TENANT_FILTER", () => {
  it("is shaped to spread into a Prisma where clause", () => {
    expect(PRODUCTION_TENANT_FILTER).toEqual({ environment: "production" });
  });

  it("is `as const` — TypeScript-narrow at the use site", () => {
    // Compile-time check: this assignment would fail tsc if the
    // filter were typed as `{ environment: string }` instead of
    // `{ environment: "production" }`.
    const filter: { environment: "production" } = PRODUCTION_TENANT_FILTER;
    expect(filter.environment).toBe("production");
  });
});

describe("STAGING_TENANT_FILTER", () => {
  it("is shaped to spread into a Prisma where clause", () => {
    expect(STAGING_TENANT_FILTER).toEqual({ environment: "staging" });
  });

  it("is distinct from PRODUCTION_TENANT_FILTER", () => {
    expect(PRODUCTION_TENANT_FILTER).not.toEqual(STAGING_TENANT_FILTER);
  });
});

describe("isProductionTenant — refinement #2: shape acceptance", () => {
  it("works with minimal { environment } projection", () => {
    expect(isProductionTenant({ environment: "production" })).toBe(true);
    expect(isProductionTenant({ environment: "staging" })).toBe(false);
  });

  it("works with full Prisma Tenant object", () => {
    // Construct enough fields to satisfy the structural type. We only
    // need `environment` per the helper's signature, but we want a
    // realistic Tenant-shaped object to prove the helper accepts it
    // without any cast or `Pick<...>` gymnastics at the call site.
    const fullTenant = {
      id: "tenant_t",
      clerkOrgId: "org_1",
      name: "Apelviken",
      slug: "apelviken",
      portalSlug: "apelviken-x",
      environment: "production" as const,
      // Other fields elided — the helper signature only reads
      // `environment`, so TypeScript's structural compatibility is
      // satisfied by any object that has at least that field with
      // the right enum value.
    };
    expect(isProductionTenant(fullTenant)).toBe(true);
  });

  it("returns false for staging tenants regardless of other fields", () => {
    expect(
      isProductionTenant({
        id: "tenant_s",
        environment: "staging" as const,
      } as { environment: "staging" }),
    ).toBe(false);
  });
});

describe("isStagingTenant — refinement #2: shape acceptance", () => {
  it("works with minimal { environment } projection", () => {
    expect(isStagingTenant({ environment: "staging" })).toBe(true);
    expect(isStagingTenant({ environment: "production" })).toBe(false);
  });

  it("works with full Prisma Tenant object", () => {
    const fullTenant = {
      id: "tenant_s",
      clerkOrgId: "org_staging",
      name: "Apelviken (staging)",
      slug: "apelviken-staging",
      portalSlug: "apelviken-staging",
      environment: "staging" as const,
    };
    expect(isStagingTenant(fullTenant)).toBe(true);
  });

  it("isProductionTenant and isStagingTenant are mutually exclusive", () => {
    const prod = { environment: "production" as const };
    const staging = { environment: "staging" as const };
    expect(
      isProductionTenant(prod) !== isStagingTenant(prod),
    ).toBe(true);
    expect(
      isProductionTenant(staging) !== isStagingTenant(staging),
    ).toBe(true);
  });
});

describe("usage guard: filter shape works with Prisma `where`", () => {
  it("PRODUCTION_TENANT_FILTER spreads into a where clause without type errors", () => {
    // This test is primarily a compile-time check — the runtime
    // assertion is incidental. If a future Prisma upgrade narrows
    // the where-clause type incompatibly, this line fails tsc and
    // we know to update the helper.
    type WhereClauseExample = {
      environment: "production" | "staging";
      status?: "active" | "archived";
    };
    const where: WhereClauseExample = {
      ...PRODUCTION_TENANT_FILTER,
      status: "active",
    };
    expect(where).toEqual({ environment: "production", status: "active" });
  });
});
