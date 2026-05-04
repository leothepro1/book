// @vitest-environment jsdom

/**
 * VisitorsLiveCard — UI tests.
 *
 * Per recon §4 B.4 + task brief, 5 cases:
 *   1. Initial skeleton while first fetch is pending
 *   2. Fetch resolves → renders the visitorsNow number
 *   3. Fetch fails → renders error + retry button
 *   4. Retry button triggers a new fetch
 *   5. Polling timer is cleared on unmount (no fetch after unmount)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { VisitorsLiveCard } from "./VisitorsLiveCard";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // Override global.fetch only for the duration of this suite.
  vi.stubGlobal("fetch", fetchMock);
  // Default to real timers — RTL's waitFor() polls via timers, so
  // fake timers without explicit advance would deadlock waitFor.
  // Tests that need to advance time (Case 5) opt into fake timers
  // explicitly.
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("VisitorsLiveCard", () => {
  it("Case 1 — initial render shows skeleton until first fetch resolves", async () => {
    // Pending fetch never resolves in this test
    let resolveFetch: (v: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { container } = render(<VisitorsLiveCard />);

    expect(screen.getByText("Besökare just nu")).toBeTruthy();
    // Skeleton element rendered
    expect(
      container.querySelector(".analytics-summary-card__skeleton"),
    ).toBeTruthy();

    // Resolve so the test doesn't leak a pending promise.
    await act(async () => {
      resolveFetch(
        jsonResponse({
          visitorsNow: 0,
          updatedAt: new Date().toISOString(),
          source: "fresh",
        }),
      );
    });
  });

  it("Case 2 — fetch resolves with visitorsNow, number renders", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        visitorsNow: 42,
        updatedAt: new Date().toISOString(),
        source: "fresh",
      }),
    );

    render(<VisitorsLiveCard />);

    await waitFor(() => {
      expect(screen.getByText("42")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/live/visitors",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("Case 3 — fetch fails, error + retry button render", async () => {
    fetchMock.mockResolvedValue(
      new Response("Internal", { status: 500 }),
    );

    render(<VisitorsLiveCard />);

    await waitFor(() => {
      expect(screen.getByText(/Kunde inte ladda besökare/)).toBeTruthy();
    });
    const retryBtn = screen.getByRole("button", { name: /Försök igen/i });
    expect(retryBtn).toBeTruthy();
  });

  it("Case 4 — retry button triggers a new fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Internal", { status: 500 }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        visitorsNow: 7,
        updatedAt: new Date().toISOString(),
        source: "fresh",
      }),
    );

    render(<VisitorsLiveCard />);

    await waitFor(() => {
      expect(screen.getByText(/Kunde inte ladda besökare/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Försök igen/i }));

    await waitFor(() => {
      expect(screen.getByText("7")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Case 5 — polling timer + AbortController cleared on unmount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        visitorsNow: 3,
        updatedAt: new Date().toISOString(),
        source: "fresh",
      }),
    );

    const { unmount } = render(<VisitorsLiveCard />);

    // First fetch on mount (real timers, await the resolution).
    await waitFor(() => {
      expect(screen.getByText("3")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    // After unmount, switch to fake timers and advance past the
    // 5-min poll interval. If cleanup leaked, the polling timer
    // would fire fetchMock a second time.
    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
