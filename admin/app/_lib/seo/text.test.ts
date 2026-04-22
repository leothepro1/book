import { describe, expect, it } from "vitest";

import { stripHtml } from "./text";

describe("stripHtml", () => {
  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(stripHtml("Hello world")).toBe("Hello world");
  });

  it("strips simple tags but preserves content", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("drops <script> tag AND its content (defensive)", () => {
    // Regression: merchant paste of `<script>alert(1)</script>Hello`
    // must NEVER produce a meta description containing `alert(1)`.
    expect(stripHtml("<script>alert(1)</script>Hello")).toBe("Hello");
  });

  it("drops <style> tag AND its content", () => {
    expect(stripHtml("<style>body{}</style>Content")).toBe("Content");
  });

  it("handles self-closing and void tags", () => {
    expect(stripHtml("Line<br/>Two<hr>Three")).toBe("LineTwoThree");
  });

  it("decodes the supported HTML entities", () => {
    expect(stripHtml("A &amp; B &lt;x&gt; &quot;hi&quot; &#39;ok&#39;")).toBe(
      'A & B <x> "hi" \'ok\'',
    );
  });

  it("decodes &nbsp; to regular space (which is then collapsed)", () => {
    expect(stripHtml("Hello&nbsp;&nbsp;world")).toBe("Hello world");
  });

  it("collapses newlines and tabs into single spaces", () => {
    expect(stripHtml("Hello\n\n\tworld")).toBe("Hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("   padded   ")).toBe("padded");
  });

  it("handles tags with attributes", () => {
    expect(stripHtml('<a href="http://x">Link</a>')).toBe("Link");
  });

  it("handles nested tags", () => {
    expect(
      stripHtml("<div><p><em>Deep</em> content</p></div>"),
    ).toBe("Deep content");
  });

  it("leaves unknown entities alone (graceful degradation)", () => {
    expect(stripHtml("Price: 10&euro;")).toBe("Price: 10&euro;");
  });
});
