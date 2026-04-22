import { describe, it, expect } from "vitest";
import { resolveWebhookExternalTenant } from "./webhook-tenant";

describe("resolveWebhookExternalTenant", () => {
  it("extracts Mews EnterpriseId from payload root", () => {
    expect(
      resolveWebhookExternalTenant("mews", {
        EnterpriseId: "ent-123",
        Events: [],
      }),
    ).toBe("ent-123");
  });

  it("returns null for Mews payload missing EnterpriseId", () => {
    expect(resolveWebhookExternalTenant("mews", { Events: [] })).toBeNull();
  });

  it("returns null for Mews payload where EnterpriseId is not a string", () => {
    expect(
      resolveWebhookExternalTenant("mews", { EnterpriseId: 42 }),
    ).toBeNull();
  });

  it("returns default fake enterprise ID for fake provider without override", () => {
    expect(resolveWebhookExternalTenant("fake", {})).toBe(
      "fake-enterprise-id",
    );
  });

  it("honors explicit enterpriseId in fake payload for test flexibility", () => {
    expect(
      resolveWebhookExternalTenant("fake", { enterpriseId: "custom-fake" }),
    ).toBe("custom-fake");
  });

  it("returns null for manual provider (no webhooks)", () => {
    expect(resolveWebhookExternalTenant("manual", {})).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(resolveWebhookExternalTenant("mews", null)).toBeNull();
    expect(resolveWebhookExternalTenant("mews", "string")).toBeNull();
    expect(resolveWebhookExternalTenant("mews", 123)).toBeNull();
  });

  it("returns null for unimplemented providers", () => {
    expect(resolveWebhookExternalTenant("apaleo", {})).toBeNull();
    expect(resolveWebhookExternalTenant("opera", {})).toBeNull();
  });
});
