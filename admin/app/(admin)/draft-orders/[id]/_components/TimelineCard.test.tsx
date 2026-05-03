// @vitest-environment jsdom

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen } from "@testing-library/react";

import { TimelineCard } from "./TimelineCard";
import type { TimelineEvent } from "./TimelineCard";

// Fixed reference date for deterministic relative-time assertions.
const FIXED_NOW = new Date("2026-04-28T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function buildEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "ev_1",
    type: "CREATED",
    metadata: {},
    actorUserId: null,
    actorSource: "admin_ui",
    createdAt: new Date("2026-04-28T11:00:00Z"), // 1 hour ago
    ...overrides,
  };
}

describe("TimelineCard — empty + render basics", () => {
  it("empty events array → 'Ingen aktivitet.' visible, no list", () => {
    const { container } = render(<TimelineCard events={[]} />);
    expect(screen.getByText("Ingen aktivitet.")).toBeTruthy();
    expect(container.querySelector("ul")).toBeNull();
  });

  it("renders one row per event in order received", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({ id: "a", type: "CREATED" }),
          buildEvent({ id: "b", type: "STATE_CHANGED" }),
          buildEvent({ id: "c", type: "INVOICE_SENT" }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(3);
  });

  it("title renders 'Aktivitet' card header", () => {
    render(<TimelineCard events={[]} />);
    expect(screen.getByText("Aktivitet")).toBeTruthy();
  });
});

describe("TimelineCard — title mapping for all known event-types", () => {
  const expectations: Array<[TimelineEvent["type"], string]> = [
    ["CREATED", "Utkast skapat"],
    ["STATE_CHANGED", "Status ändrad"],
    ["LINE_ADDED", "Rad tillagd"],
    ["LINE_UPDATED", "Rad ändrad"],
    ["LINE_REMOVED", "Rad borttagen"],
    ["META_UPDATED", "Detaljer uppdaterade"],
    ["CUSTOMER_UPDATED", "Kund ändrad"],
    ["DISCOUNT_APPLIED", "Rabatt tillämpad"],
    ["DISCOUNT_REMOVED", "Rabatt borttagen"],
    ["PRICES_FROZEN", "Priser låsta"],
    ["INVOICE_SENT", "Faktura skickad"],
    ["INVOICE_RESENT", "Faktura skickad om"],
    ["INVOICE_OVERDUE", "Faktura förfallen"],
    ["CONVERTED", "Konverterad till order"],
    ["CANCELLED", "Avbruten"],
    ["HOLD_PLACED", "Reservation gjord"],
    ["HOLD_RELEASED", "Reservation släppt"],
    ["HOLD_FAILED", "Reservation misslyckades"],
    ["EXPIRED_CLEANUP", "Utkast utgick"],
  ];

  for (const [type, expectedTitle] of expectations) {
    it(`${type} → "${expectedTitle}"`, () => {
      render(<TimelineCard events={[buildEvent({ type })]} />);
      expect(screen.getByText(expectedTitle)).toBeTruthy();
    });
  }

  it("unknown event-type → 'Aktivitet' fallback", () => {
    render(<TimelineCard events={[buildEvent({ type: "DEBUG_FOO" })]} />);
    // Two "Aktivitet" expected: card header + fallback title
    expect(screen.getAllByText("Aktivitet").length).toBeGreaterThanOrEqual(2);
  });
});

describe("TimelineCard — metadata subtitle (defensive extraction)", () => {
  it("STATE_CHANGED maps from/to via DRAFT_LABELS", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "STATE_CHANGED",
            metadata: { from: "OPEN", to: "INVOICED" },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Utkast → Fakturerad")).toBeTruthy();
  });

  it("STATE_CHANGED with reason appends ' · Anledning: ...'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "STATE_CHANGED",
            metadata: { from: "INVOICED", to: "PAID", reason: "manual_payment" },
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("Fakturerad → Betald · Anledning: manual_payment"),
    ).toBeTruthy();
  });

  it("LINE_ADDED with title + quantity + unitPriceCents → 'title (Nx, kr)'", () => {
    // Production emits cents as string (`.toString()`) — Json doesn't allow BigInt.
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "LINE_ADDED",
            metadata: {
              title: "Cabin",
              quantity: 2,
              unitPriceCents: "150000",
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Cabin (2×, 1 500 kr)")).toBeTruthy();
  });

  it("LINE_ADDED accepts unitPriceCents as string (wire-coerced)", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "LINE_ADDED",
            metadata: { title: "Cabin", quantity: 1, unitPriceCents: "150000" },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Cabin (1×, 1 500 kr)")).toBeTruthy();
  });

  it("LINE_UPDATED with diff.quantity {from,to} → 'title · Antal: F → T'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "LINE_UPDATED",
            metadata: {
              title: "Cabin",
              diff: { quantity: { from: 1, to: 3 } },
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Cabin · Antal: 1 → 3")).toBeTruthy();
  });

  it("META_UPDATED summarises diff field labels", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "META_UPDATED",
            metadata: {
              diff: { internalNote: { from: null, to: "x" }, tags: { from: [], to: ["v"] } },
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Intern anteckning, Taggar")).toBeTruthy();
  });

  it("CUSTOMER_UPDATED null→id → 'Kund tillagd'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "CUSTOMER_UPDATED",
            metadata: { diff: { guestAccountId: { from: null, to: "g_1" } } },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Kund tillagd")).toBeTruthy();
  });

  it("CUSTOMER_UPDATED id→null → 'Kund borttagen'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "CUSTOMER_UPDATED",
            metadata: { diff: { guestAccountId: { from: "g_1", to: null } } },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Kund borttagen")).toBeTruthy();
  });

  it("DISCOUNT_APPLIED with code + amount → 'CODE (-amount)'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "DISCOUNT_APPLIED",
            metadata: {
              code: "SUMMER10",
              discountAmountCents: "10000",
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("SUMMER10 (-100 kr)")).toBeTruthy();
  });

  it("INVOICE_SENT with shareLinkExpiresAt → 'Förfaller ...'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "INVOICE_SENT",
            metadata: { shareLinkExpiresAt: "2026-05-31T00:00:00Z" },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Förfaller 31 maj 2026/)).toBeTruthy();
  });

  it("INVOICE_RESENT with rotated PI + new expiry → combined subtitle", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "INVOICE_RESENT",
            metadata: {
              shareLinkExpiresAt: "2026-06-15T00:00:00Z",
              rotatedPaymentIntent: true,
            },
          }),
        ]}
      />,
    );
    expect(
      screen.getByText(/Ny förfaller 15 juni 2026 · Ny betalningslänk/),
    ).toBeTruthy();
  });

  it("INVOICE_RESENT with no metadata → no subtitle, no crash", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({ type: "INVOICE_RESENT", metadata: null }),
        ]}
      />,
    );
    expect(screen.getByText("Faktura skickad om")).toBeTruthy();
  });

  it("INVOICE_OVERDUE with graceDays=3 → 'Markerad förfallen efter 3 dagar'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "INVOICE_OVERDUE",
            metadata: { graceDays: 3 },
          }),
        ]}
      />,
    );
    expect(
      screen.getByText("Markerad förfallen efter 3 dagar"),
    ).toBeTruthy();
  });

  it("INVOICE_OVERDUE with no metadata → no subtitle, no crash", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({ type: "INVOICE_OVERDUE", metadata: null }),
        ]}
      />,
    );
    expect(screen.getByText("Faktura förfallen")).toBeTruthy();
  });

  it("CANCELLED with reason → 'Anledning: ...'", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "CANCELLED",
            metadata: { reason: "Kunden ångrade sig" },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Anledning: Kunden ångrade sig")).toBeTruthy();
  });

  it("malformed metadata (string instead of object) → no subtitle, no crash", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "STATE_CHANGED",
            metadata: "garbage" as unknown as TimelineEvent["metadata"],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Status ändrad")).toBeTruthy();
    // Subtitle absent
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it("STATE_CHANGED missing from-field → no subtitle, no crash", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({
            type: "STATE_CHANGED",
            metadata: { to: "INVOICED" },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Status ändrad")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });
});

describe("TimelineCard — actor mapping (Q5)", () => {
  it("actorSource='admin_ui' → 'Administratör'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: "admin_ui", actorUserId: "u_1" })]}
      />,
    );
    expect(screen.getByText(/Administratör/)).toBeTruthy();
  });

  it("actorSource='cron' → 'System'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: "cron", actorUserId: null })]}
      />,
    );
    expect(screen.getByText(/^System ·/)).toBeTruthy();
  });

  it("actorSource='webhook' → 'System (webhook)'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: "webhook", actorUserId: null })]}
      />,
    );
    expect(screen.getByText(/System \(webhook\)/)).toBeTruthy();
  });

  it("actorSource='api' → 'System (API)'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: "api", actorUserId: null })]}
      />,
    );
    expect(screen.getByText(/System \(API\)/)).toBeTruthy();
  });

  it("both null → 'System'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: null, actorUserId: null })]}
      />,
    );
    expect(screen.getByText(/^System ·/)).toBeTruthy();
  });

  it("actorUserId set, no actorSource → 'Administratör'", () => {
    render(
      <TimelineCard
        events={[buildEvent({ actorSource: null, actorUserId: "u_1" })]}
      />,
    );
    expect(screen.getByText(/Administratör/)).toBeTruthy();
  });
});

describe("TimelineCard — relative time formatting", () => {
  it("recent event (1 hour ago) → relative format", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({ createdAt: new Date("2026-04-28T11:00:00Z") }),
        ]}
      />,
    );
    // Relative string includes "sedan" or "om" (Swedish locale)
    expect(screen.getByText(/sedan/)).toBeTruthy();
  });

  it("event > 7 days old → absolute date format", () => {
    render(
      <TimelineCard
        events={[
          buildEvent({ createdAt: new Date("2026-04-15T10:00:00Z") }),
        ]}
      />,
    );
    // 13 days before fixed now → absolute. sv-locale "d MMM yyyy" produces
    // "15 apr. 2026" (with period after abbreviated month).
    expect(screen.getByText(/15 apr\.? 2026/)).toBeTruthy();
  });
});
