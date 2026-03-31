import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Playwright
const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("fake-png"));
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockSetViewportSize = vi.fn().mockResolvedValue(undefined);
const mockAddStyleTag = vi.fn().mockResolvedValue(undefined);
const mockWaitForTimeout = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

const mockPage = {
  setViewportSize: mockSetViewportSize,
  goto: mockGoto,
  addStyleTag: mockAddStyleTag,
  waitForTimeout: mockWaitForTimeout,
  screenshot: mockScreenshot,
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: mockClose,
};

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

const { capturePortalScreenshots } = await import("../capture");

beforeEach(() => {
  vi.clearAllMocks();
  mockBrowser.newPage.mockResolvedValue({ ...mockPage });
});

describe("capturePortalScreenshots", () => {
  it("calls goto with the correct URL", async () => {
    await capturePortalScreenshots("https://test.rutgr.com/preview/home", "tenant-1");
    expect(mockGoto).toHaveBeenCalledWith("https://test.rutgr.com/preview/home", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
  });

  it("sets desktop viewport to 1440×900", async () => {
    await capturePortalScreenshots("https://test.rutgr.com", "tenant-1");
    expect(mockSetViewportSize).toHaveBeenCalledWith({ width: 1440, height: 900 });
  });

  it("sets mobile viewport to 390×844", async () => {
    await capturePortalScreenshots("https://test.rutgr.com", "tenant-1");
    expect(mockSetViewportSize).toHaveBeenCalledWith({ width: 390, height: 844 });
  });

  it("takes two screenshots (desktop + mobile)", async () => {
    await capturePortalScreenshots("https://test.rutgr.com", "tenant-1");
    expect(mockScreenshot).toHaveBeenCalledTimes(2);
  });

  it("always closes browser even on error", async () => {
    mockGoto.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      capturePortalScreenshots("https://test.rutgr.com", "tenant-1"),
    ).rejects.toThrow("timeout");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("returns Buffer instances", async () => {
    const result = await capturePortalScreenshots("https://test.rutgr.com", "tenant-1");
    expect(result.desktopBuffer).toBeInstanceOf(Buffer);
    expect(result.mobileBuffer).toBeInstanceOf(Buffer);
  });
});
