// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DraftListItem } from "@/app/_lib/draft-orders";

// ── Mocks ────────────────────────────────────────────────────

const pushMock = vi.fn();
let searchParamsImpl = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParamsImpl,
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
      function MockLink({ children, href, ...rest }, ref) {
        return React.createElement("a", { ref, href, ...rest }, children);
      },
    ),
  };
});

vi.mock("./actions", () => ({
  getDrafts: vi.fn(),
  bulkCancelDraftsAction: vi.fn(),
  bulkSendInvoiceAction: vi.fn(),
  bulkResendInvoiceAction: vi.fn(),
}));

import {
  getDrafts,
  bulkCancelDraftsAction,
  bulkSendInvoiceAction,
  bulkResendInvoiceAction,
} from "./actions";
import { DraftOrdersClient } from "./DraftOrdersClient";

const getDraftsMock = getDrafts as unknown as ReturnType<typeof vi.fn>;
const bulkCancelMock = bulkCancelDraftsAction as unknown as ReturnType<
  typeof vi.fn
>;
const bulkSendMock = bulkSendInvoiceAction as unknown as ReturnType<
  typeof vi.fn
>;
const bulkResendMock = bulkResendInvoiceAction as unknown as ReturnType<
  typeof vi.fn
>;

// ── Fixtures ─────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftListItem> = {}): DraftListItem {
  const base: DraftListItem = {
    id: "d1",
    displayNumber: "D-1042",
    status: "OPEN",
    expiresAt: new Date("2026-05-01T10:00:00Z"),
    createdAt: new Date("2026-04-20T09:00:00Z"),
    updatedAt: new Date("2026-04-20T09:00:00Z"),
    totalAmount: BigInt(245000),
    currency: "SEK",
    customer: { id: "c1", email: "anna@example.com", name: "Anna Andersson" },
    accommodationSummary: "2× Stuga A",
    lineCount: 2,
  };
  return { ...base, ...overrides };
}

function emptyResult() {
  return { items: [], total: 0, page: 1, limit: 25 };
}

// ── Setup ────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockClear();
  getDraftsMock.mockReset();
  bulkCancelMock.mockReset();
  bulkSendMock.mockReset();
  bulkResendMock.mockReset();
  searchParamsImpl = new URLSearchParams();
  getDraftsMock.mockResolvedValue(emptyResult());
  bulkCancelMock.mockResolvedValue({
    ok: true,
    total: 0,
    succeeded: [],
    failed: [],
    skipped: [],
  });
  bulkSendMock.mockResolvedValue({
    ok: true,
    total: 0,
    succeeded: [],
    failed: [],
    skipped: [],
  });
  bulkResendMock.mockResolvedValue({
    ok: true,
    total: 0,
    succeeded: [],
    failed: [],
    skipped: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────

describe("DraftOrdersClient — loading + empty states", () => {
  it("C10 — !loaded gate renders null first, then content after fetch resolves", async () => {
    let resolveFetch: (v: ReturnType<typeof emptyResult>) => void = () => {};
    getDraftsMock.mockImplementationOnce(
      () => new Promise((r) => { resolveFetch = r; }),
    );
    const { container } = render(<DraftOrdersClient />);
    expect(container.innerHTML).toBe(""); // !loaded → null
    await act(async () => { resolveFetch(emptyResult()); });
    await waitFor(() => expect(screen.getByText("Inga utkastordrar ännu")).toBeDefined());
  });

  it("C1 — empty state renders title + desc + CTA when items=0, tab=alla, no search", async () => {
    render(<DraftOrdersClient />);
    expect(await screen.findByText("Inga utkastordrar ännu")).toBeDefined();
    expect(screen.getByText("Skapa en ny utkastorder för att börja.")).toBeDefined();
    const cta = screen.getByText("Skapa order").closest("a") as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute("href")).toBe("/draft-orders/new");
  });

  it("C2 — filtered empty state when search active + zero results", async () => {
    // Seed with one draft so tabs/search button render (early-empty branch is skipped).
    getDraftsMock.mockResolvedValueOnce({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    // Subsequent search call returns empty.
    getDraftsMock.mockResolvedValue(emptyResult());
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText("Sök"));
    const input = screen.getByPlaceholderText("Sök bland alla utkast") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "xyz" } });
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByText("Inga utkast matchar filtret")).toBeDefined());
  });
});

describe("DraftOrdersClient — items render", () => {
  it("C3 — customer fallback: name renders, then email, then em-dash", async () => {
    getDraftsMock.mockResolvedValue({
      items: [
        makeDraft({ id: "d1", customer: { id: null, email: "x@y.se", name: "Anna" } }),
        makeDraft({ id: "d2", customer: { id: null, email: "no-name@y.se", name: null } }),
        makeDraft({ id: "d3", customer: null }),
      ],
      total: 3, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    expect(await screen.findByText("Anna")).toBeDefined();
    expect(screen.getByText("no-name@y.se")).toBeDefined();
    // em-dash for null customer (only one row should show standalone "—" in customer cell)
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("C4 — total formatted via formatSek (kr suffix)", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1", totalAmount: BigInt(245000), currency: "SEK" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    expect(await screen.findByText(/2\s*450\s*kr/)).toBeDefined();
  });

  it("C5 — DraftBadge renders status label", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1", status: "PENDING_APPROVAL" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    expect(await screen.findByText("Inväntar godkännande")).toBeDefined();
  });
});

describe("DraftOrdersClient — interactions", () => {
  it("C6 — row click triggers router.push to /draft-orders/[id]/konfigurera", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    const row = await screen.findByText("D-1042");
    fireEvent.click(row.closest(".ord-row")!);
    expect(pushMock).toHaveBeenCalledWith("/draft-orders/d1/konfigurera");
  });

  it("C7 — tab Link href built with ?tab=X (default tab uses bare path)", async () => {
    // Seed with one draft so the filter bar renders (tabs are part of it).
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    const allaLink = screen.getByText("Alla").closest("a") as HTMLAnchorElement;
    expect(allaLink.getAttribute("href")).toBe("/draft-orders");
    const oppnaLink = screen.getByText("Öppna").closest("a") as HTMLAnchorElement;
    expect(oppnaLink.getAttribute("href")).toContain("tab=");
    expect(decodeURIComponent(oppnaLink.getAttribute("href")!)).toContain("tab=öppna");
  });

  it("C8 — search debounce 300ms triggers getDrafts re-call with search param", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    getDraftsMock.mockClear();

    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText("Sök"));
    const input = screen.getByPlaceholderText("Sök bland alla utkast") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "draft-1042" } });
    // Before debounce expires: no new call
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(getDraftsMock).not.toHaveBeenCalled();
    // After debounce expires: getDrafts called with search
    await act(async () => { vi.advanceTimersByTime(150); });
    vi.useRealTimers();
    await waitFor(() => {
      const lastCall = getDraftsMock.mock.calls.at(-1);
      expect(lastCall?.[0]?.search).toBe("draft-1042");
    });
  });

  it("C9 — pagination next/prev updates page state and refetches", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 60, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    getDraftsMock.mockClear();
    fireEvent.click(screen.getByLabelText("Nästa sida"));
    await waitFor(() => {
      const lastCall = getDraftsMock.mock.calls.at(-1);
      expect(lastCall?.[0]?.page).toBe(2);
    });
  });
});

describe("DraftOrdersClient — CTA + tab default", () => {
  it("C11 — empty state CTA renders with href=/draft-orders/new", async () => {
    render(<DraftOrdersClient />);
    const cta = (await screen.findByText("Skapa order")).closest("a") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/draft-orders/new");
  });
});

// ═══════════════════════════════════════════════════════════════
// FAS 7.8 — Bulk action wiring
// ═══════════════════════════════════════════════════════════════

function selectFirstRowCheckbox() {
  // Per-row checkbox is the second .ord-check on screen — the first
  // .ord-check belongs to the column header.
  const checkboxes = document.querySelectorAll(".ord-check");
  const rowCheckbox = checkboxes[1] as HTMLElement;
  fireEvent.click(rowCheckbox);
}

describe("DraftOrdersClient — bulk action bar visibility", () => {
  it("BWB1 — bar hidden until ≥1 row selected, appears after selection", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");

    expect(screen.queryByRole("region", { name: "Bulk-åtgärder" })).toBeNull();

    selectFirstRowCheckbox();

    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Bulk-åtgärder" }),
      ).toBeDefined(),
    );
  });
});

describe("DraftOrdersClient — bulk send-invoice flow", () => {
  it("BWB2 — click Skicka faktura → ConfirmModal → confirm → action called → result modal", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    bulkSendMock.mockResolvedValue({
      ok: true,
      total: 1,
      succeeded: [{ draftId: "d1", displayNumber: "D-1042" }],
      skipped: [],
      failed: [],
    });

    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    selectFirstRowCheckbox();
    await screen.findByRole("region", { name: "Bulk-åtgärder" });

    fireEvent.click(screen.getByRole("button", { name: "Skicka faktura" }));

    // The confirm modal opens — its CTA also says "Skicka faktura". Pick the
    // last one (it is rendered after the bar in tree order).
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: "Skicka faktura" });
      expect(buttons.length).toBeGreaterThan(1);
    });

    const confirmButtons = screen.getAllByRole("button", { name: "Skicka faktura" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(bulkSendMock).toHaveBeenCalledTimes(1);
      const call = bulkSendMock.mock.calls[0][0] as { draftIds: string[] };
      expect(call.draftIds).toEqual(["d1"]);
    });

    await waitFor(() =>
      expect(
        screen.getByText(/Skicka faktura: 1 lyckade/),
      ).toBeDefined(),
    );
  });
});

describe("DraftOrdersClient — result modal close clears selection", () => {
  it("BWB3 — closing the result modal clears selection (bar hides)", async () => {
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 1, page: 1, limit: 25,
    });
    bulkResendMock.mockResolvedValue({
      ok: true,
      total: 1,
      succeeded: [{ draftId: "d1", displayNumber: "D-1042" }],
      skipped: [],
      failed: [],
    });

    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    selectFirstRowCheckbox();
    await screen.findByRole("region", { name: "Bulk-åtgärder" });

    fireEvent.click(
      screen.getByRole("button", { name: "Skicka om faktura" }),
    );
    // Confirm modal CTA — pick the last instance.
    const confirmButtons = await screen.findAllByRole("button", {
      name: "Skicka om faktura",
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/Skicka om faktura: 1 lyckade/)).toBeDefined(),
    );

    // Footer "Stäng" — appears twice (× aria-label + footer CTA). Click the
    // visible CTA at the end of the modal.
    const closeButtons = screen.getAllByRole("button", { name: "Stäng" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Bulk-åtgärder" }),
      ).toBeNull(),
    );
  });
});

describe("DraftOrdersClient — selection auto-clear on filter change", () => {
  it("BWB4 — pagination next/prev clears selection (Q6 LOCKED)", async () => {
    // 60 items → multiple pages so the Nästa knapp is enabled.
    getDraftsMock.mockResolvedValue({
      items: [makeDraft({ id: "d1" })],
      total: 60, page: 1, limit: 25,
    });
    render(<DraftOrdersClient />);
    await screen.findByText("D-1042");
    selectFirstRowCheckbox();
    await screen.findByRole("region", { name: "Bulk-åtgärder" });

    fireEvent.click(screen.getByLabelText("Nästa sida"));

    // The clear-on-change useEffect runs on the page-state update, so the
    // bar disappears synchronously after the next paint.
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Bulk-åtgärder" }),
      ).toBeNull(),
    );
  });
});
