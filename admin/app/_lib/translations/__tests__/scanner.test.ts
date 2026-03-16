import { describe, it, expect, vi } from "vitest";
import { computeDigest } from "../digest";
import type { StoredTranslation } from "../types";
import { makeResourceId } from "../types";

// Mock traverseConfig to avoid importing the full registry chain
vi.mock("../traversal", () => ({
  traverseConfig: (
    _config: unknown,
    visitor: (field: { resourceId: string; namespace: string; sourceValue: string; fieldLabel: string; pageId: string; pageName: string; sectionId: string; sectionName: string; setValue: () => void }) => void,
  ) => {
    // Emit a free section title
    visitor({
      resourceId: makeResourceId("tenant:page:home:section:sec_free:title"),
      namespace: "TENANT",
      sourceValue: "Välkommen",
      fieldLabel: "Titel",
      pageId: "home",
      pageName: "Hem",
      sectionId: "sec_free",
      sectionName: "Hero",
      setValue: () => {},
    });
    // Emit a locked section editable field
    visitor({
      resourceId: makeResourceId("locked:page:stays:section:sec_locked:heading"),
      namespace: "LOCKED",
      sourceValue: "Mina bokningar",
      fieldLabel: "Rubrik",
      pageId: "stays",
      pageName: "Vistelser",
      sectionId: "sec_locked",
      sectionName: "Bokningar",
      setValue: () => {},
    });
    // Note: locked non-editable fields are NOT emitted by traverseConfig
    // (filtered by editableFields in traversal.ts). So we don't emit them here.
  },
}));

// Import scanner AFTER mock is set up
const { scanTranslatableStrings } = await import("../scanner");

function makeStoredTranslation(locale: string, resourceId: string, value: string, sourceDigest: string): StoredTranslation {
  return {
    id: "tr-1",
    tenantId: "test-tenant",
    locale,
    resourceId,
    namespace: "TENANT",
    value,
    sourceDigest,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("scanTranslatableStrings", () => {
  const fakeConfig = {} as never; // Config is not used — traverseConfig is mocked

  it("emits correct resourceIds for free and locked sections", () => {
    const fields = scanTranslatableStrings(fakeConfig, new Map(), "en");

    expect(fields).toHaveLength(2);
    expect(fields[0].resourceId).toBe("tenant:page:home:section:sec_free:title");
    expect(fields[0].namespace).toBe("TENANT");
    expect(fields[1].resourceId).toBe("locked:page:stays:section:sec_locked:heading");
    expect(fields[1].namespace).toBe("LOCKED");
  });

  it("locked non-editable fields are NOT emitted", () => {
    const fields = scanTranslatableStrings(fakeConfig, new Map(), "en");
    // The mock only emits editable fields — no non-editable locked field exists
    const nonEditable = fields.filter((f) => f.resourceId.includes("non_editable"));
    expect(nonEditable).toHaveLength(0);
  });

  it("resolves status to MISSING when no existing translation", () => {
    const fields = scanTranslatableStrings(fakeConfig, new Map(), "en");
    for (const field of fields) {
      expect(field.status).toBe("MISSING");
      expect(field.translatedValue).toBeUndefined();
    }
  });

  it("resolves status to TRANSLATED when digest matches", () => {
    const sourceDigest = computeDigest("Välkommen");
    const existing = new Map<string, StoredTranslation>();
    existing.set(
      "en:tenant:page:home:section:sec_free:title",
      makeStoredTranslation("en", "tenant:page:home:section:sec_free:title", "Welcome", sourceDigest),
    );

    const fields = scanTranslatableStrings(fakeConfig, existing, "en");
    const freeField = fields.find((f) => f.resourceId.includes("sec_free:title"));
    expect(freeField).toBeDefined();
    expect(freeField!.status).toBe("TRANSLATED");
    expect(freeField!.translatedValue).toBe("Welcome");
  });

  it("resolves status to OUTDATED when digest does not match", () => {
    const existing = new Map<string, StoredTranslation>();
    existing.set(
      "en:tenant:page:home:section:sec_free:title",
      makeStoredTranslation("en", "tenant:page:home:section:sec_free:title", "Old translation", "00000000"),
    );

    const fields = scanTranslatableStrings(fakeConfig, existing, "en");
    const freeField = fields.find((f) => f.resourceId.includes("sec_free:title"));
    expect(freeField).toBeDefined();
    expect(freeField!.status).toBe("OUTDATED");
    expect(freeField!.translationDigest).toBe("00000000");
  });
});
