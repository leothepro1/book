import { describe, it, expect } from "vitest";
import { resolveTemplateHtml } from "./template-overrides";

describe("resolveTemplateHtml", () => {
  it("returns override when present and non-empty", () => {
    const result = resolveTemplateHtml(
      "BOOKING_CONFIRMED",
      "<html>Custom</html>",
      "<html>Default</html>",
    );
    expect(result).toEqual({ html: "<html>Custom</html>", isOverride: true });
  });

  it("returns default when override is null", () => {
    const result = resolveTemplateHtml(
      "BOOKING_CONFIRMED",
      null,
      "<html>Default</html>",
    );
    expect(result).toEqual({ html: "<html>Default</html>", isOverride: false });
  });

  it("returns default when override is empty string", () => {
    const result = resolveTemplateHtml(
      "BOOKING_CONFIRMED",
      "",
      "<html>Default</html>",
    );
    expect(result).toEqual({ html: "<html>Default</html>", isOverride: false });
  });

  it("returns default when override is whitespace only", () => {
    const result = resolveTemplateHtml(
      "BOOKING_CONFIRMED",
      "   \n  ",
      "<html>Default</html>",
    );
    expect(result).toEqual({ html: "<html>Default</html>", isOverride: false });
  });

  it("returns default when override is undefined", () => {
    const result = resolveTemplateHtml(
      "MAGIC_LINK",
      undefined,
      "<html>Default Magic</html>",
    );
    expect(result).toEqual({ html: "<html>Default Magic</html>", isOverride: false });
  });

  it("preserves override HTML exactly as stored", () => {
    const customHtml = '<div style="color:red">Test {{guestName}}</div>';
    const result = resolveTemplateHtml("SUPPORT_REPLY", customHtml, "<html>Default</html>");
    expect(result.html).toBe(customHtml);
    expect(result.isOverride).toBe(true);
  });
});
