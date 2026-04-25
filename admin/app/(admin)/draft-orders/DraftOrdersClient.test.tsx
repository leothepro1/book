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
}));

import { getDrafts } from "./actions";
import { DraftOrdersClient } from "./DraftOrdersClient";

const getDraftsMock = getDrafts as unknown as ReturnType<typeof vi.fn>;

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
  searchParamsImpl = new URLSearchParams();
  getDraftsMock.mockResolvedValue(emptyResult());
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
