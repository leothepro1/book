// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BulkResultModal } from "./BulkResultModal";
import type { BulkActionResult } from "../actions";

function makeResult(
  overrides: Partial<Extract<BulkActionResult, { ok: true }>> = {},
): BulkActionResult {
  return {
    ok: true,
    total: 0,
    succeeded: [],
    skipped: [],
    failed: [],
    ...overrides,
  };
}

describe("BulkResultModal — visibility", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <BulkResultModal
        open={false}
        result={makeResult()}
        actionLabel="X"
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when result=null", () => {
    const { container } = render(
      <BulkResultModal
        open
        result={null}
        actionLabel="X"
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("BulkResultModal — section visibility per non-empty bucket", () => {
  it("all-ok → only Lyckade section, no retry button", () => {
    render(
      <BulkResultModal
        open
        actionLabel="Skicka faktura"
        result={makeResult({
          total: 2,
          succeeded: [
            { draftId: "d_a", displayNumber: "D-A" },
            { draftId: "d_b", displayNumber: "D-B" },
          ],
        })}
        onClose={() => {}}
        onRetryFailed={() => {}}
      />,
    );

    expect(screen.getByText(/Lyckade \(2\)/)).toBeTruthy();
    expect(screen.queryByText(/Skippade/)).toBeNull();
    expect(screen.queryByText(/^Fel/)).toBeNull();
    expect(screen.queryByText(/Försök igen/)).toBeNull();
    expect(screen.getByText("D-A")).toBeTruthy();
    expect(screen.getByText("D-B")).toBeTruthy();
  });

  it("mixed (1 ok / 1 skip / 1 fail) → all three sections + retry button", () => {
    render(
      <BulkResultModal
        open
        actionLabel="Avbryt utkast"
        result={makeResult({
          total: 3,
          succeeded: [{ draftId: "d_a", displayNumber: "D-A" }],
          skipped: [
            { draftId: "d_b", displayNumber: "D-B", reason: "redan terminal" },
          ],
          failed: [
            { draftId: "d_c", displayNumber: "D-C", error: "Stripe 503" },
          ],
        })}
        onClose={() => {}}
        onRetryFailed={() => {}}
      />,
    );

    expect(screen.getByText(/Lyckade \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Skippade \(1\)/)).toBeTruthy();
    expect(screen.getByText(/^Fel \(1\)/)).toBeTruthy();
    expect(screen.getByText("redan terminal")).toBeTruthy();
    expect(screen.getByText("Stripe 503")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Försök igen för misslyckade \(1\)/ }),
    ).toBeTruthy();
  });

  it("all-fail → only Fel section + retry button", () => {
    render(
      <BulkResultModal
        open
        actionLabel="Skicka om faktura"
        result={makeResult({
          total: 2,
          failed: [
            { draftId: "d_a", displayNumber: "D-A", error: "boom1" },
            { draftId: "d_b", displayNumber: "D-B", error: "boom2" },
          ],
        })}
        onClose={() => {}}
        onRetryFailed={() => {}}
      />,
    );

    expect(screen.queryByText(/Lyckade/)).toBeNull();
    expect(screen.queryByText(/Skippade/)).toBeNull();
    expect(screen.getByText(/^Fel \(2\)/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Försök igen för misslyckade \(2\)/ }),
    ).toBeTruthy();
  });
});

describe("BulkResultModal — retry CTA gating", () => {
  it("failed > 0 but no onRetryFailed prop → retry button hidden", () => {
    render(
      <BulkResultModal
        open
        actionLabel="X"
        result={makeResult({
          total: 1,
          failed: [{ draftId: "d_a", displayNumber: "D-A", error: "boom" }],
        })}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/Försök igen/)).toBeNull();
  });
});

describe("BulkResultModal — header line", () => {
  it("shows actionLabel + counts in header", () => {
    render(
      <BulkResultModal
        open
        actionLabel="Avbryt utkast"
        result={makeResult({
          total: 4,
          succeeded: [
            { draftId: "d_a", displayNumber: "D-A" },
            { draftId: "d_b", displayNumber: "D-B" },
          ],
          skipped: [
            { draftId: "d_c", displayNumber: "D-C", reason: "x" },
          ],
          failed: [{ draftId: "d_d", displayNumber: "D-D", error: "y" }],
        })}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByText("Avbryt utkast: 2 lyckade, 1 skippade, 1 fel"),
    ).toBeTruthy();
  });
});

describe("BulkResultModal — close + retry callbacks", () => {
  it("footer Stäng button fires onClose (X aria-label also routes to onClose)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BulkResultModal
        open
        actionLabel="X"
        result={makeResult()}
        onClose={onClose}
      />,
    );
    // Two "Stäng"-named buttons: the × close-icon (aria-label) and the
    // footer CTA. Both wire to onClose; click the footer one explicitly.
    const closeButtons = screen.getAllByRole("button", { name: "Stäng" });
    expect(closeButtons.length).toBe(2);
    await user.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retry button fires onRetryFailed (and not onClose)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRetryFailed = vi.fn();
    render(
      <BulkResultModal
        open
        actionLabel="X"
        result={makeResult({
          total: 1,
          failed: [{ draftId: "d_a", displayNumber: "D-A", error: "boom" }],
        })}
        onClose={onClose}
        onRetryFailed={onRetryFailed}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Försök igen för misslyckade/ }),
    );
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("BulkResultModal — error result variant (ok=false)", () => {
  it("renders the error message when result.ok=false", () => {
    render(
      <BulkResultModal
        open
        actionLabel="Avbryt utkast"
        result={{ ok: false, error: "Ingen tenant" }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Ingen tenant")).toBeTruthy();
  });
});
