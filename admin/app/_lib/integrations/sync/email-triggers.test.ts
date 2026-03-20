import { describe, it, expect, vi, beforeEach } from "vitest";
import { guestFullName, formatDate } from "./email-triggers";

// ── Mock sendEmailEvent and portal-slug before importing trigger functions ──

const mockSendEmailEvent = vi.fn();
vi.mock("@/app/_lib/email", () => ({
  sendEmailEvent: (...args: unknown[]) => mockSendEmailEvent(...args),
}));

vi.mock("@/app/_lib/tenant/portal-slug", () => ({
  portalSlugToUrl: (slug: string) => `https://${slug}.bedfront.com`,
}));

// Import trigger functions after mock is set up
const { triggerBookingConfirmed, triggerCheckInConfirmed } = await import(
  "./email-triggers"
);

function makeBookingWithTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking_1",
    tenantId: "tenant_1",
    firstName: "Anna",
    lastName: "Lindgren",
    guestEmail: "anna@example.com",
    phone: null,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    arrival: new Date("2026-06-15"),
    departure: new Date("2026-06-18"),
    unit: "Rum 201",
    status: "PRE_CHECKIN" as const,
    checkedInAt: null,
    checkedOutAt: null,
    signatureCapturedAt: null,
    signatureDataUrl: null,
    externalId: "ext_1",
    externalSource: "mews",
    lastSyncedAt: new Date(),
    confirmedEmailSentAt: null,
    checkedInEmailSentAt: null,
    portalToken: "tok_abc123",
    checkedOutEmailSentAt: null,
    createdAt: new Date(),
    magicLinks: [],
    accessPasses: [],
    tenant: {
      id: "tenant_1",
      clerkOrgId: "org_1",
      name: "Grand Hotel",
      slug: "grand-hotel",
      portalSlug: "grand-hotel-x4k9mq",
      ownerClerkUserId: null,
      settings: null,
      draftSettings: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      settingsVersion: 0,
      previousSettings: null,
      legalName: null,
      businessType: null,
      nickname: null,
      phone: null,
      addressStreet: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      organizationNumber: null,
      vatNumber: null,
      emailFrom: null,
      emailFromName: null,
      checkinEnabled: false,
      checkoutEnabled: false,
      earlyCheckinEnabled: false,
      earlyCheckinDays: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

// ── safeSend behavior ───────────────────────────────────────────

describe("safeSend (via trigger functions)", () => {
  beforeEach(() => {
    mockSendEmailEvent.mockReset();
  });

  it("does not throw when sendEmailEvent throws", async () => {
    mockSendEmailEvent.mockRejectedValue(new Error("Resend down"));
    const booking = makeBookingWithTenant();

    // Should not throw
    await expect(triggerBookingConfirmed(booking as never)).resolves.toBeUndefined();
  });

  it("skips silently when guestEmail is empty", async () => {
    const booking = makeBookingWithTenant({ guestEmail: "" });

    await triggerBookingConfirmed(booking as never);
    expect(mockSendEmailEvent).not.toHaveBeenCalled();
  });

  it("calls sendEmailEvent with correct tenantId, eventType, email", async () => {
    mockSendEmailEvent.mockResolvedValue(undefined);
    const booking = makeBookingWithTenant();

    await triggerBookingConfirmed(booking as never);

    expect(mockSendEmailEvent).toHaveBeenCalledWith(
      "tenant_1",
      "BOOKING_CONFIRMED",
      "anna@example.com",
      expect.objectContaining({
        guestName: "Anna Lindgren",
        hotelName: "Grand Hotel",
      }),
    );
  });

  it("calls CHECK_IN_CONFIRMED with correct variables", async () => {
    mockSendEmailEvent.mockResolvedValue(undefined);
    const booking = makeBookingWithTenant();

    await triggerCheckInConfirmed(booking as never);

    expect(mockSendEmailEvent).toHaveBeenCalledWith(
      "tenant_1",
      "CHECK_IN_CONFIRMED",
      "anna@example.com",
      expect.objectContaining({
        guestName: "Anna Lindgren",
        hotelName: "Grand Hotel",
        roomNumber: "Rum 201",
      }),
    );
  });
});

// ── guestFullName ───────────────────────────────────────────────

describe("guestFullName", () => {
  it("returns full name for both first and last name", () => {
    expect(guestFullName({ firstName: "Anna", lastName: "Lindgren" })).toBe(
      "Anna Lindgren",
    );
  });

  it("returns first name only when lastName is empty", () => {
    expect(guestFullName({ firstName: "Anna", lastName: "" })).toBe("Anna");
  });

  it("returns empty string when both are empty", () => {
    expect(guestFullName({ firstName: "", lastName: "" })).toBe("");
  });
});

// ── formatDate ──────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns Swedish formatted date for valid Date", () => {
    const result = formatDate(new Date("2026-06-15"));
    // sv-SE format: "15 juni 2026"
    expect(result).toContain("2026");
    expect(result).toContain("juni");
    expect(result).toContain("15");
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });
});

// ── loginUrl (tested via triggerBookingConfirmed variables) ─────

describe("loginUrl in email triggers", () => {
  beforeEach(() => {
    mockSendEmailEvent.mockReset();
    mockSendEmailEvent.mockResolvedValue(undefined);
  });

  it("returns login URL when portalSlug exists", async () => {
    const booking = makeBookingWithTenant({
      tenant: {
        ...makeBookingWithTenant().tenant,
        portalSlug: "apelviken-dev-3vtczx",
      },
    });

    await triggerBookingConfirmed(booking as never);

    expect(mockSendEmailEvent).toHaveBeenCalledWith(
      expect.any(String),
      "BOOKING_CONFIRMED",
      expect.any(String),
      expect.objectContaining({
        loginUrl: "https://apelviken-dev-3vtczx.bedfront.com/login",
      }),
    );
  });

  it("returns empty string when portalSlug is null", async () => {
    const booking = makeBookingWithTenant({
      tenant: {
        ...makeBookingWithTenant().tenant,
        portalSlug: null,
      },
    });

    await triggerBookingConfirmed(booking as never);

    expect(mockSendEmailEvent).toHaveBeenCalledWith(
      expect.any(String),
      "BOOKING_CONFIRMED",
      expect.any(String),
      expect.objectContaining({ loginUrl: "" }),
    );
  });

  it("format is https://{slug}.bedfront.com/login", async () => {
    const booking = makeBookingWithTenant({
      tenant: {
        ...makeBookingWithTenant().tenant,
        portalSlug: "my-hotel-abc456",
      },
    });

    await triggerBookingConfirmed(booking as never);

    expect(mockSendEmailEvent).toHaveBeenCalledWith(
      expect.any(String),
      "BOOKING_CONFIRMED",
      expect.any(String),
      expect.objectContaining({
        loginUrl: "https://my-hotel-abc456.bedfront.com/login",
      }),
    );
  });
});
