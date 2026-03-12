import { describe, it, expect } from "vitest";
import { migrateSettings } from "../migrations";
import type { ThemeManifest, TenantSectionSettings } from "../types";

function makeManifest(
  version: string,
  migrations?: ThemeManifest["migrations"],
): ThemeManifest {
  return {
    id: "test-theme",
    name: "Test",
    version,
    author: { name: "test" },
    description: "",
    thumbnail: "",
    previewImages: [],
    tags: [],
    settings: [],
    settingDefaults: {},
    detail: { heading: "", description: "", features: [] },
    designPreset: {} as any,
    sectionGroups: { header: [], footer: [] },
    templates: { home: { name: "Home", sections: [] } },
    migrations,
  };
}

describe("migrateSettings", () => {
  it("returns unchanged if versions match", () => {
    const settings: TenantSectionSettings = { "test-theme:hero": { title: "Hi" } };
    const manifest = makeManifest("1.0.0");
    const result = migrateSettings(settings, manifest, "1.0.0");

    expect(result.migrated).toBe(false);
    expect(result.settings).toBe(settings); // Same reference — no copy
    expect(result.resolvedVersion).toBe("1.0.0");
    expect(result.appliedVersions).toEqual([]);
  });

  it("returns unchanged if no migrations defined", () => {
    const settings: TenantSectionSettings = { "test-theme:hero": { title: "Hi" } };
    const manifest = makeManifest("2.0.0");
    const result = migrateSettings(settings, manifest, "1.0.0");

    expect(result.migrated).toBe(false);
  });

  it("runs single migration", () => {
    const settings: TenantSectionSettings = {
      "test-theme:hero": { title: "Hi" },
    };
    const manifest = makeManifest("2.0.0", {
      "2.0.0": (s) => {
        const migrated = { ...s };
        if (migrated["test-theme:hero"]) {
          migrated["test-theme:hero-banner"] = migrated["test-theme:hero"];
          delete migrated["test-theme:hero"];
        }
        return migrated;
      },
    });

    const result = migrateSettings(settings, manifest, "1.0.0");

    expect(result.migrated).toBe(true);
    expect(result.settings["test-theme:hero"]).toBeUndefined();
    expect(result.settings["test-theme:hero-banner"]).toEqual({ title: "Hi" });
    expect(result.resolvedVersion).toBe("2.0.0");
    expect(result.appliedVersions).toEqual(["2.0.0"]);
  });

  it("runs migration chain in order", () => {
    const log: string[] = [];
    const manifest = makeManifest("3.0.0", {
      "2.0.0": (s) => { log.push("2.0.0"); return { ...s, v2: { applied: true } }; },
      "3.0.0": (s) => { log.push("3.0.0"); return { ...s, v3: { applied: true } }; },
    });

    const result = migrateSettings({}, manifest, "1.0.0");

    expect(log).toEqual(["2.0.0", "3.0.0"]);
    expect(result.appliedVersions).toEqual(["2.0.0", "3.0.0"]);
    expect(result.migrated).toBe(true);
  });

  it("skips migrations older than tenant version", () => {
    const log: string[] = [];
    const manifest = makeManifest("3.0.0", {
      "1.0.0": (s) => { log.push("1.0.0"); return s; },
      "2.0.0": (s) => { log.push("2.0.0"); return s; },
      "3.0.0": (s) => { log.push("3.0.0"); return s; },
    });

    migrateSettings({}, manifest, "2.0.0");

    expect(log).toEqual(["3.0.0"]);
  });

  it("runs all migrations when tenantVersion is null (legacy)", () => {
    const log: string[] = [];
    const manifest = makeManifest("2.0.0", {
      "1.0.0": (s) => { log.push("1.0.0"); return s; },
      "2.0.0": (s) => { log.push("2.0.0"); return s; },
    });

    migrateSettings({}, manifest, null);

    expect(log).toEqual(["1.0.0", "2.0.0"]);
  });

  it("stops migration chain on error", () => {
    const manifest = makeManifest("3.0.0", {
      "2.0.0": (s) => ({ ...s, ok: { applied: true } }),
      "3.0.0": () => { throw new Error("boom"); },
    });

    const result = migrateSettings({}, manifest, "1.0.0");

    // 2.0.0 applied, 3.0.0 failed
    expect(result.migrated).toBe(true);
    expect(result.appliedVersions).toEqual(["2.0.0"]);
    expect(result.resolvedVersion).toBe("2.0.0");
    expect((result.settings as any).ok).toEqual({ applied: true });
  });
});
