import { describe, it, expect } from "vitest";
import { renderTemplate, injectPreviewText } from "./template-utils";

// ── renderTemplate ──────────────────────────────────────────────

describe("renderTemplate", () => {
  it("replaces a known variable", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Anna" })).toBe(
      "Hello Anna",
    );
  });

  it("keeps placeholder for unknown variable", () => {
    expect(renderTemplate("Hello {{name}}", {})).toBe("Hello {{name}}");
  });

  it("handles multiple variables in one string", () => {
    const result = renderTemplate("{{a}} and {{b}}", { a: "X", b: "Y" });
    expect(result).toBe("X and Y");
  });

  it("returns original string if no variables present", () => {
    expect(renderTemplate("No vars here", { foo: "bar" })).toBe(
      "No vars here",
    );
  });

  it("handles repeated use of the same variable", () => {
    expect(
      renderTemplate("{{x}} then {{x}} again", { x: "OK" }),
    ).toBe("OK then OK again");
  });
});

// ── injectPreviewText ───────────────────────────────────────────

describe("injectPreviewText", () => {
  it("injects span after <body> tag", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const result = injectPreviewText(html, "Preview");
    expect(result).toContain("<body><span");
    expect(result).toContain("Preview");
    expect(result).toContain("<p>Hello</p>");
  });

  it("falls back to prepend when no <body> tag present", () => {
    const html = "<p>No body tag</p>";
    const result = injectPreviewText(html, "Preview");
    expect(result).toMatch(/^<span/);
    expect(result).toContain("Preview");
  });

  it("HTML-encodes < > & in preview text", () => {
    const result = injectPreviewText(
      "<html><body></body></html>",
      "A < B & C > D",
    );
    expect(result).toContain("A &lt; B &amp; C &gt; D");
    expect(result).not.toContain("A < B");
  });

  it("contains padding characters", () => {
    const result = injectPreviewText(
      "<html><body></body></html>",
      "Short",
    );
    expect(result).toContain("&nbsp;&zwnj;");
  });

  it("handles <body> tag with attributes", () => {
    const html = '<html><body class="main" style="margin:0"><p>Hi</p></body></html>';
    const result = injectPreviewText(html, "Preview");
    expect(result).toContain('style="margin:0"><span');
    expect(result).toContain("Preview");
  });
});
