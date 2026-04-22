import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({ log: vi.fn() }));

import { stringifyJsonLd } from "./json-ld-safe";
import type { StructuredDataObject } from "./types";
import { log } from "../logger";

function obj(extra: Record<string, unknown> = {}): StructuredDataObject {
  return {
    "@context": "https://schema.org",
    "@type": "Thing",
    ...extra,
  };
}

describe("stringifyJsonLd — basic serialization", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("round-trips a simple object", () => {
    const out = stringifyJsonLd(obj({ name: "Hello" }));
    // Valid JSON that a parser can decode.
    expect(JSON.parse(out)).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Hello",
    });
  });

  it("produces minified output (no indentation)", () => {
    const out = stringifyJsonLd(obj({ name: "Hello" }));
    expect(out).not.toContain("\n");
    expect(out).not.toMatch(/"\s+:/);
  });
});

describe("stringifyJsonLd — HTML break-out defense", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("escapes '</script>' inside a string value so it cannot close the tag", () => {
    const out = stringifyJsonLd(
      obj({ description: "Evil: </script><img src=x onerror=alert(1)>" }),
    );
    // The raw `</script>` sequence must not appear in output.
    expect(out).not.toContain("</script>");
    // A JSON parser still decodes the original string intact.
    const parsed = JSON.parse(out) as { description: string };
    expect(parsed.description).toContain("</script>");
  });

  it("escapes '<!--' inside strings", () => {
    const out = stringifyJsonLd(obj({ description: "<!--comment-->" }));
    expect(out).not.toContain("<!--");
  });

  it("escapes every `<` regardless of context", () => {
    const out = stringifyJsonLd(obj({ description: "a<b<c" }));
    // Two < chars, both escaped.
    expect(out.match(/\\u003c/g)).toHaveLength(2);
    expect(out).not.toMatch(/[^\\]</);
  });

  it("handles mixed-case </Script> and </SCRIPT>", () => {
    const out = stringifyJsonLd(obj({ description: "</Script></SCRIPT>" }));
    expect(out).not.toMatch(/<\//i);
  });

  it("escapes U+2028 LINE SEPARATOR", () => {
    const out = stringifyJsonLd(obj({ description: "line\u2028break" }));
    expect(out).toContain("\\u2028");
    expect(out).not.toMatch(new RegExp("\u2028"));
  });

  it("escapes U+2029 PARAGRAPH SEPARATOR", () => {
    const out = stringifyJsonLd(obj({ description: "para\u2029break" }));
    expect(out).toContain("\\u2029");
    expect(out).not.toMatch(new RegExp("\u2029"));
  });
});

describe("stringifyJsonLd — failure handling", () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it("returns empty string and logs when JSON.stringify throws on a circular ref", () => {
    const circular = obj() as Record<string, unknown>;
    circular.self = circular;
    const out = stringifyJsonLd(circular as StructuredDataObject);
    expect(out).toBe("");
    expect(log).toHaveBeenCalledWith(
      "error",
      "seo.json_ld.stringify_failed",
      expect.objectContaining({
        schemaType: "Thing",
        reason: expect.any(String),
      }),
    );
  });

  it("returns empty string and logs for BigInt without toJSON", () => {
    const out = stringifyJsonLd(
      obj({ price: BigInt("9007199254740993") }) as StructuredDataObject,
    );
    expect(out).toBe("");
    expect(log).toHaveBeenCalled();
  });

  it("never throws on malformed input", () => {
    // A BigInt without a toJSON method is a real runtime shape that
    // makes JSON.stringify throw. We've already tested that explicitly
    // above; here we just confirm the outer-level guarantee that no
    // input — however weird — surfaces an exception to the caller.
    expect(() =>
      stringifyJsonLd(obj({ price: BigInt("1") })),
    ).not.toThrow();
  });
});
