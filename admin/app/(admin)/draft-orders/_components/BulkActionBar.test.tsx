// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BulkActionBar } from "./BulkActionBar";

function makeProps(overrides: Partial<React.ComponentProps<typeof BulkActionBar>> = {}) {
  return {
    selectedCount: 1,
    onClearSelection: vi.fn(),
    onSendInvoice: vi.fn(),
    onResendInvoice: vi.fn(),
    onCancel: vi.fn(),
    pending: false,
    ...overrides,
  };
}

describe("BulkActionBar — visibility", () => {
  it("renders nothing when selectedCount=0", () => {
    const { container } = render(
      <BulkActionBar {...makeProps({ selectedCount: 0 })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the bar when selectedCount>=1", () => {
    render(<BulkActionBar {...makeProps({ selectedCount: 1 })} />);
    expect(screen.getByRole("region", { name: "Bulk-åtgärder" })).toBeTruthy();
  });

  it("singular vs plural count label", () => {
    const { rerender } = render(
      <BulkActionBar {...makeProps({ selectedCount: 1 })} />,
    );
    expect(screen.getByText("1 vald")).toBeTruthy();

    rerender(<BulkActionBar {...makeProps({ selectedCount: 5 })} />);
    expect(screen.getByText("5 valda")).toBeTruthy();
  });
});

describe("BulkActionBar — three action buttons + clear link (always visible)", () => {
  it("renders 'Skicka faktura', 'Skicka om faktura', 'Avbryt utkast' + 'Avmarkera'", () => {
    render(<BulkActionBar {...makeProps({ selectedCount: 3 })} />);
    expect(screen.getByRole("button", { name: "Skicka faktura" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Skicka om faktura" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avbryt utkast" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avmarkera" })).toBeTruthy();
  });
});

describe("BulkActionBar — pending disables every interactive control", () => {
  it("buttons + clear link are disabled when pending=true", () => {
    render(
      <BulkActionBar {...makeProps({ selectedCount: 2, pending: true })} />,
    );
    for (const label of [
      "Skicka faktura",
      "Skicka om faktura",
      "Avbryt utkast",
      "Avmarkera",
    ]) {
      const btn = screen.getByRole("button", { name: label });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("BulkActionBar — progress text", () => {
  it("renders 'Bearbetar X av Y…' only when pending AND progress provided", () => {
    const { rerender } = render(
      <BulkActionBar
        {...makeProps({
          selectedCount: 10,
          pending: true,
          progress: { current: 3, total: 10 },
        })}
      />,
    );
    expect(screen.getByText(/Bearbetar 3 av 10/)).toBeTruthy();

    // Pending without progress → no banner.
    rerender(
      <BulkActionBar
        {...makeProps({ selectedCount: 10, pending: true, progress: null })}
      />,
    );
    expect(screen.queryByText(/Bearbetar/)).toBeNull();

    // Progress without pending → no banner (pending=false short-circuits).
    rerender(
      <BulkActionBar
        {...makeProps({
          selectedCount: 10,
          pending: false,
          progress: { current: 3, total: 10 },
        })}
      />,
    );
    expect(screen.queryByText(/Bearbetar/)).toBeNull();
  });
});

describe("BulkActionBar — callback wiring", () => {
  it("each button click fires its corresponding callback exactly once", async () => {
    const user = userEvent.setup();
    const props = makeProps({ selectedCount: 4 });
    render(<BulkActionBar {...props} />);

    await user.click(screen.getByRole("button", { name: "Skicka faktura" }));
    expect(props.onSendInvoice).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Skicka om faktura" }));
    expect(props.onResendInvoice).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Avbryt utkast" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Avmarkera" }));
    expect(props.onClearSelection).toHaveBeenCalledTimes(1);
  });
});
