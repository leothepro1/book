/**
 * parseDeviceType / parseDeviceTypeFromNav — unit tests.
 *
 * Fixtures cover real UA strings observed in the wild for each bucket
 * plus the iPadOS 13+ MacIntel edge case. Hand-rolled regex precludes
 * exhaustive coverage; the goal is "the platforms Bedfront's guests
 * actually use are classified correctly".
 */

import { describe, expect, it } from "vitest";

import {
  parseDeviceType,
  parseDeviceTypeFromNav,
  type DeviceType,
} from "./device-type";

const UA = {
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
  iPhoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  iPad12:
    "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1",
  iPad17DesktopMode:
    // iPadOS 13+ Safari reports the Mac UA by default — only platform
    // + maxTouchPoints distinguish from a real Mac.
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  androidTabletExplicit:
    "Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  bot: "Googlebot/2.1 (+http://www.google.com/bot.html)",
  empty: "",
};

describe("parseDeviceType — UA-only", () => {
  const cases: Array<[string, string, DeviceType]> = [
    ["macOS Safari → desktop", UA.macSafari, "desktop"],
    ["Windows Chrome → desktop", UA.windowsChrome, "desktop"],
    ["Linux Firefox → desktop", UA.linuxFirefox, "desktop"],
    ["iPhone Safari → mobile", UA.iPhoneSafari, "mobile"],
    ["Android phone (Mobile marker) → mobile", UA.androidPhone, "mobile"],
    ["Android tablet (no Mobile marker) → tablet", UA.androidTablet, "tablet"],
    ["iPadOS 12 (UA contains iPad) → tablet", UA.iPad12, "tablet"],
    [
      "iPadOS 17 desktop-mode (UA-only — falls through to desktop)",
      UA.iPad17DesktopMode,
      "desktop",
    ],
    [
      "Android with explicit Tablet keyword → tablet",
      UA.androidTabletExplicit,
      "tablet",
    ],
    ["empty string → unknown", UA.empty, "unknown"],
    [
      "Googlebot (UA does not contain Mobile/iPhone/iPad) → desktop",
      UA.bot,
      "desktop",
    ],
  ];

  for (const [label, ua, expected] of cases) {
    it(label, () => {
      expect(parseDeviceType(ua)).toBe(expected);
    });
  }

  it("null UA → unknown", () => {
    expect(parseDeviceType(null)).toBe("unknown");
  });

  it("undefined UA → unknown", () => {
    expect(parseDeviceType(undefined)).toBe("unknown");
  });

  it("never throws on adversarial input", () => {
    expect(() => parseDeviceType("\x00\x01\x02")).not.toThrow();
    expect(() => parseDeviceType("a".repeat(10_000))).not.toThrow();
  });
});

describe("parseDeviceTypeFromNav — Navigator-aware (iPadOS 13+ fix)", () => {
  it("iPadOS 17 desktop-mode (MacIntel + multi-touch) → tablet", () => {
    expect(
      parseDeviceTypeFromNav(UA.iPad17DesktopMode, 5, "MacIntel"),
    ).toBe("tablet");
  });

  it("real Mac (MacIntel + zero touch) → desktop", () => {
    expect(parseDeviceTypeFromNav(UA.macSafari, 0, "MacIntel")).toBe("desktop");
  });

  it("real Mac (MacIntel + 1 touchpoint — trackpad gestures) → desktop", () => {
    // The discriminator is `maxTouchPoints > 1`; trackpads can report 1.
    expect(parseDeviceTypeFromNav(UA.macSafari, 1, "MacIntel")).toBe("desktop");
  });

  it("Windows machine even with touch → falls through to UA classifier", () => {
    expect(parseDeviceTypeFromNav(UA.windowsChrome, 10, "Win32")).toBe(
      "desktop",
    );
  });

  it("iPhone with empty platform → falls through to UA mobile", () => {
    expect(parseDeviceTypeFromNav(UA.iPhoneSafari, 5, "")).toBe("mobile");
  });

  it("missing maxTouchPoints (0) on Mac → desktop (UA-fallback)", () => {
    expect(parseDeviceTypeFromNav(UA.macSafari, 0, "MacIntel")).toBe("desktop");
  });
});
