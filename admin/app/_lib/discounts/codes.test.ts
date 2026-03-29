import { describe, it, expect, vi } from "vitest";

// Mock prisma and logger to prevent import chain failures
vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

import { normalizeCode } from "./codes";

describe("normalizeCode", () => {
  it("uppercases the code", () => {
    expect(normalizeCode("summer20")).toBe("SUMMER20");
  });

  it("trims leading whitespace", () => {
    expect(normalizeCode("  SUMMER20")).toBe("SUMMER20");
  });

  it("trims trailing whitespace", () => {
    expect(normalizeCode("SUMMER20  ")).toBe("SUMMER20");
  });

  it("trims and uppercases together", () => {
    expect(normalizeCode(" summer20 ")).toBe("SUMMER20");
  });

  it("handles already-normalized code", () => {
    expect(normalizeCode("SUMMER20")).toBe("SUMMER20");
  });

  it("handles empty string after trim", () => {
    expect(normalizeCode("   ")).toBe("");
  });

  it("handles mixed case", () => {
    expect(normalizeCode("SuMmEr20")).toBe("SUMMER20");
  });

  it("preserves digits and special characters", () => {
    expect(normalizeCode("vip-50%off")).toBe("VIP-50%OFF");
  });
});
