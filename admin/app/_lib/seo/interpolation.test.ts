import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger", () => ({
  log: vi.fn(),
}));

import { interpolate } from "./interpolation";
import { log } from "../logger";

describe("interpolate — happy path", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("substitutes a single flat placeholder", () => {
    expect(interpolate("{siteName}", { siteName: "Apelviken" })).toBe(
      "Apelviken",
    );
  });

  it("substitutes multiple placeholders in one template", () => {
    expect(
      interpolate("{title} | {siteName}", {
        title: "Stuga 1",
        siteName: "Apelviken",
      }),
    ).toBe("Stuga 1 | Apelviken");
  });

  it("substitutes the same placeholder appearing multiple times", () => {
    expect(interpolate("{s}-{s}-{s}", { s: "go" })).toBe("go-go-go");
  });

  it("descends a dotted path one level deep", () => {
    expect(
      interpolate("{entity.title}", { entity: { title: "Stuga" } }),
    ).toBe("Stuga");
  });

  it("descends a dotted path arbitrary levels deep", () => {
    expect(
      interpolate("{a.b.c.d}", { a: { b: { c: { d: "deep" } } } }),
    ).toBe("deep");
  });

  it("returns the template unchanged when it contains no placeholders", () => {
    expect(interpolate("Plain text with no vars", {})).toBe(
      "Plain text with no vars",
    );
  });

  it("returns an empty string for an empty template", () => {
    expect(interpolate("", {})).toBe("");
  });

  it("handles unicode content around placeholders", () => {
    expect(interpolate("🏠 {name} 🌲", { name: "Stuga" })).toBe(
      "🏠 Stuga 🌲",
    );
  });
});

describe("interpolate — missing key behaviour", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("leaves the literal when a top-level key is missing", () => {
    expect(interpolate("x {foo} y", {})).toBe("x {foo} y");
  });

  it("leaves the literal when a nested key is missing", () => {
    expect(
      interpolate("{entity.foo}", { entity: { title: "ok" } }),
    ).toBe("{entity.foo}");
  });

  it("leaves the literal when an intermediate value is a string", () => {
    expect(interpolate("{a.b.c}", { a: { b: "stop here" } })).toBe(
      "{a.b.c}",
    );
  });

  it("leaves the literal when an intermediate value is null", () => {
    expect(interpolate("{a.b.c}", { a: { b: null } })).toBe("{a.b.c}");
  });

  it("logs warn with path and supplied tenantId on missing key", () => {
    interpolate("{missing}", {}, { tenantId: "tenant_xyz" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.interpolation.missing_key",
      expect.objectContaining({
        path: "missing",
        tenantId: "tenant_xyz",
      }),
    );
  });

  it("logs warn with null tenantId when not provided", () => {
    interpolate("{missing}", {});
    expect(log).toHaveBeenCalledWith(
      "warn",
      "seo.interpolation.missing_key",
      expect.objectContaining({
        path: "missing",
        tenantId: null,
      }),
    );
  });

  it("does not log when every placeholder resolves", () => {
    interpolate("{x}", { x: "y" }, { tenantId: "t" });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs once per unresolved placeholder occurrence", () => {
    // Two unresolved placeholders in the same template → two warn calls.
    interpolate("{a} {b}", {}, { tenantId: "t" });
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe("interpolate — leaf coercion", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("coerces numbers", () => {
    expect(interpolate("{n}", { n: 42 })).toBe("42");
  });

  it("coerces zero", () => {
    expect(interpolate("{n}", { n: 0 })).toBe("0");
  });

  it("coerces booleans", () => {
    expect(interpolate("{on}/{off}", { on: true, off: false })).toBe(
      "true/false",
    );
  });

  it("coerces bigints", () => {
    // Use BigInt() constructor — tsconfig targets ES2017 which disallows
    // bigint literals. Matches the convention in money/bigint.test.ts.
    expect(
      interpolate("{n}", { n: BigInt("9007199254740993") }),
    ).toBe("9007199254740993");
  });

  it("leaves literal for object leaf", () => {
    expect(interpolate("{x}", { x: { a: 1 } })).toBe("{x}");
  });

  it("leaves literal for array leaf", () => {
    expect(interpolate("{x}", { x: [1, 2, 3] })).toBe("{x}");
  });

  it("leaves literal for null leaf", () => {
    expect(interpolate("{x}", { x: null })).toBe("{x}");
  });

  it("leaves literal for undefined leaf", () => {
    expect(interpolate("{x}", { x: undefined })).toBe("{x}");
  });
});

describe("interpolate — malformed input", () => {
  beforeEach(() => {
    vi.mocked(log).mockClear();
  });

  it("leaves an unmatched opening brace alone", () => {
    expect(interpolate("prefix { not a placeholder", { foo: "x" })).toBe(
      "prefix { not a placeholder",
    );
  });

  it("leaves a placeholder with whitespace inside alone", () => {
    expect(interpolate("{foo bar}", { foo: "x" })).toBe("{foo bar}");
  });

  it("leaves a placeholder with leading digit alone", () => {
    // Grammar requires [A-Za-z_] start.
    expect(interpolate("{1foo}", { "1foo": "x" })).toBe("{1foo}");
  });

  it("does not match empty braces", () => {
    expect(interpolate("{}", {})).toBe("{}");
    // No warn: the pattern never matched, so lookup never ran.
    expect(log).not.toHaveBeenCalled();
  });
});
