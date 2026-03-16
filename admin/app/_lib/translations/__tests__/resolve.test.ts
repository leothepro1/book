import { describe, it, expect } from "vitest";
import { resolveTranslation } from "../resolve";
import { makeResourceId } from "../types";
import type { PlatformStringDefinition, PlatformStringMap } from "../types";

function makePlatformMap(entries: PlatformStringDefinition[]): PlatformStringMap {
  return new Map(entries.map((e) => [e.resourceId, e]));
}

describe("resolveTranslation", () => {
  const rid = makeResourceId("tenant:page:home:section:sec_1:heading");
  const emptyPlatform: PlatformStringMap = new Map();

  it("returns tenant translation for requested locale when it exists", () => {
    const tenantMap = new Map([
      [`en:${rid}`, "Welcome"],
    ]);

    const result = resolveTranslation(rid, "en", "sv", tenantMap, emptyPlatform, "Välkommen");
    expect(result).toBe("Welcome");
  });

  it("falls back to primary locale translation when requested locale has no translation", () => {
    const tenantMap = new Map([
      [`sv:${rid}`, "Välkommen (sv override)"],
    ]);

    const result = resolveTranslation(rid, "de", "sv", tenantMap, emptyPlatform, "Välkommen");
    expect(result).toBe("Välkommen (sv override)");
  });

  it("falls back to platform default for requested locale when available", () => {
    const platformRid = makeResourceId("platform:global:checkin_button");
    const platformMap = makePlatformMap([{
      resourceId: platformRid,
      defaultTranslations: { sv: "Checka in", en: "Check in", de: "Einchecken" },
    }]);

    const result = resolveTranslation(platformRid, "de", "sv", new Map(), platformMap, "Checka in");
    expect(result).toBe("Einchecken");
  });

  it("falls back to platform default for primary locale", () => {
    const platformRid = makeResourceId("platform:global:checkout_button");
    const platformMap = makePlatformMap([{
      resourceId: platformRid,
      defaultTranslations: { sv: "Checka ut", en: "Check out" },
    }]);

    // Requesting "fr" — no tenant translation, no platform "fr", falls to platform "sv"
    const result = resolveTranslation(platformRid, "fr", "sv", new Map(), platformMap, "Checka ut");
    expect(result).toBe("Checka ut");
  });

  it("returns raw sourceValue as final fallback", () => {
    const result = resolveTranslation(rid, "ja", "sv", new Map(), emptyPlatform, "Originaltext");
    expect(result).toBe("Originaltext");
  });

  it("never returns undefined", () => {
    const result = resolveTranslation(
      makeResourceId("nonexistent:resource"),
      "xx",
      "sv",
      new Map(),
      emptyPlatform,
      "Fallback",
    );
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result).toBe("Fallback");
  });

  it("tenant translation overrides platform default", () => {
    const platformRid = makeResourceId("platform:global:greeting");
    const platformMap = makePlatformMap([{
      resourceId: platformRid,
      defaultTranslations: { sv: "Hej", en: "Hello" },
    }]);

    const tenantMap = new Map([
      [`en:${platformRid}`, "Hi there!"],
    ]);

    const result = resolveTranslation(platformRid, "en", "sv", tenantMap, platformMap, "Hej");
    expect(result).toBe("Hi there!");
  });
});
