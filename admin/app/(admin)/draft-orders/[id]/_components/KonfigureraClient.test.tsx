// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const updateMetaMock = vi.fn();
const updateCustomerMock = vi.fn();
const sendInvoiceMock = vi.fn();
const markPaidMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("../actions", () => ({
  updateDraftMetaAction: (input: unknown) => updateMetaMock(input),
  updateDraftCustomerAction: (input: unknown) => updateCustomerMock(input),
  applyDraftDiscountCodeAction: vi.fn(),
  removeDraftDiscountCodeAction: vi.fn(),
  addDraftLineItemAction: vi.fn(),
  updateDraftLineItemAction: vi.fn(),
  removeDraftLineItemAction: vi.fn(),
  sendDraftInvoiceAction: (input: unknown) => sendInvoiceMock(input),
  markDraftAsPaidAction: (input: unknown) => markPaidMock(input),
  cancelDraftAction: (input: unknown) => cancelMock(input),
}));

// Mock the cross-route AccommodationPickerModal to avoid importing the
// searchAccommodationsAction tree.
vi.mock(
  "@/app/(admin)/draft-orders/new/_components/AccommodationPickerModal",
  () => ({
    AccommodationPickerModal: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="acc-picker-mock">
        <button type="button" onClick={onClose}>
          mock-close
        </button>
      </div>
    ),
  }),
);

// Mock the cross-route CustomerPickerModal to avoid importing the
// searchCustomersAction tree.
vi.mock(
  "@/app/(admin)/draft-orders/new/_components/CustomerPickerModal",
  () => ({
    CustomerPickerModal: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="picker-mock">
        <button type="button" onClick={onClose}>
          mock-close
        </button>
      </div>
    ),
  }),
);

// Mock /new TagsCard so we don't need searchDraftTagsAction.
vi.mock("@/app/(admin)/draft-orders/new/_components/TagsCard", () => ({
  TagsCard: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (next: string[]) => void;
  }) => (
    <div data-testid="tags-card-mock">
      <span data-testid="tags-value">{JSON.stringify(value)}</span>
      <button type="button" onClick={() => onChange([...value, "x"])}>
        tag-add
      </button>
    </div>
  ),
}));

// Mock /new ExpiresAtCard so we keep the test surface minimal.
vi.mock("@/app/(admin)/draft-orders/new/_components/ExpiresAtCard", () => ({
  ExpiresAtCard: ({
    value,
    onChange,
  }: {
    value: Date;
    onChange: (next: Date) => void;
  }) => (
    <div data-testid="expires-card-mock">
      <span data-testid="expires-iso">{value.toISOString()}</span>
      <button
        type="button"
        onClick={() => onChange(new Date("2026-12-25T00:00:00Z"))}
      >
        expires-pick
      </button>
    </div>
  ),
}));

// Mock /new DiscountCard so we don't render its full input UI here —
// DiscountCardEditable has its own dedicated test file.
vi.mock("@/app/(admin)/draft-orders/new/_components/DiscountCard", () => ({
  DiscountCard: ({
    appliedCode,
  }: {
    appliedCode: string | null;
  }) => (
    <div data-testid="discount-card-mock">
      <span data-testid="discount-applied">{appliedCode ?? "NONE"}</span>
    </div>
  ),
}));

import { KonfigureraClient } from "./KonfigureraClient";
import type { KonfigureraClientDraft } from "./KonfigureraClient";

const baseDraft: KonfigureraClientDraft = {
  id: "draft_1",
  displayNumber: "D-2026-0042",
  status: "OPEN",
  createdAt: new Date("2026-04-20T10:00:00Z"),
  expiresAt: new Date("2026-04-27T00:00:00Z"),
  invoiceSentAt: null,
  pricesFrozenAt: null,
  cancelledAt: null,
  completedAt: null,
  cancellationReason: null,
  invoiceUrl: null,
  guestAccountId: null,
  companyLocationId: null,
  contactFirstName: null,
  contactLastName: null,
  contactEmail: null,
  contactPhone: null,
  appliedDiscountCode: null,
  appliedDiscountAmount: null,
  appliedDiscountType: null,
  internalNote: null,
  customerNote: null,
  tags: [],
  subtotalCents: BigInt(0),
  orderDiscountCents: BigInt(0),
  shippingCents: BigInt(0),
  totalTaxCents: BigInt(0),
  totalCents: BigInt(0),
  currency: "SEK",
  lineItems: [],
};

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  updateMetaMock.mockReset();
  updateCustomerMock.mockReset();
  sendInvoiceMock.mockReset();
  markPaidMock.mockReset();
  cancelMock.mockReset();
});

describe("KonfigureraClient — header & layout (status-agnostic)", () => {
  it("renders header title with displayNumber + DraftBadge", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Draft D-2026-0042")).toBeTruthy();
    expect(screen.getAllByText("Utkast").length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT render PaymentTermsCard when paymentTerms is null", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText("Betalningsvillkor")).toBeNull();
  });

  it("renders PaymentTermsCard when paymentTerms is set (B2B)", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={{
          id: "terms_1",
          name: "Net 30",
          depositPercent: 25,
          frozen: false,
        }}
      />,
    );
    expect(screen.getByText("Betalningsvillkor")).toBeTruthy();
    expect(screen.getByText("Net 30")).toBeTruthy();
  });

  it("back-button pushes to /draft-orders", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByLabelText("Tillbaka till utkastorders"));
    expect(pushMock).toHaveBeenCalledWith("/draft-orders");
  });

  it("prev/next buttons are disabled when prev/next are null", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(
      (screen.getByLabelText("Föregående utkast") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Nästa utkast") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("prev/next buttons navigate to /draft-orders/<id>/konfigurera when set", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={{ id: "draft_prev", displayNumber: "D-2026-0041" }}
        next={{ id: "draft_next", displayNumber: "D-2026-0043" }}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByLabelText("Föregående utkast"));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/draft-orders/draft_prev/konfigurera",
    );
    fireEvent.click(screen.getByLabelText("Nästa utkast"));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/draft-orders/draft_next/konfigurera",
    );
  });

  it("StatusCard shows Priser låsta row when pricesFrozenAt is set", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          pricesFrozenAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Priser låsta")).toBeTruthy();
  });
});

describe("KonfigureraClient — read-only mode (non-editable status)", () => {
  const completedDraft: KonfigureraClientDraft = {
    ...baseDraft,
    status: "COMPLETED",
  };

  it("renders read-only cards with empty-states (no edit affordances)", () => {
    render(
      <KonfigureraClient
        draft={completedDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("Ingen kund kopplad.")).toBeTruthy();
    expect(screen.getByText("Ingen rabatt tillämpad.")).toBeTruthy();
    expect(screen.getByText("Inga taggar.")).toBeTruthy();
    expect(screen.getByText("Inga rader.")).toBeTruthy();
    expect(screen.getByText("Inga reservationer.")).toBeTruthy();
    // No "Lägg till kund" button (that's editable affordance only).
    expect(screen.queryByText("+ Lägg till kund")).toBeNull();
  });

  it("does NOT render PublishBarUI in DOM when not editable", () => {
    render(
      <KonfigureraClient
        draft={completedDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText("Osparade ändringar")).toBeNull();
    expect(screen.queryByText("Spara")).toBeNull();
    expect(screen.queryByText("Ignorera")).toBeNull();
  });

  it("does NOT render ExpiresAtCardEditable in read-only mode", () => {
    render(
      <KonfigureraClient
        draft={completedDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByTestId("expires-card-mock")).toBeNull();
  });
});

describe("KonfigureraClient — edit mode (editable status)", () => {
  it("renders editable affordances for OPEN status", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("+ Lägg till kund")).toBeTruthy();
    expect(screen.getByTestId("expires-card-mock")).toBeTruthy();
    expect(screen.getByTestId("tags-card-mock")).toBeTruthy();
  });

  it("PublishBarUI is hidden when no dirty changes (hasUnsavedChanges=false)", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // PublishBarUI mounts but hides via CSS class (no .publish-actions--visible).
    const bar = document.querySelector(".publish-actions");
    expect(bar).toBeTruthy();
    expect(bar?.classList.contains("publish-actions--visible")).toBe(false);
  });

  it("editing tags marks meta dirty → PublishBarUI becomes visible", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("tag-add"));
    const bar = document.querySelector(".publish-actions");
    expect(bar?.classList.contains("publish-actions--visible")).toBe(true);
  });

  it("editing expiresAt marks meta dirty → PublishBarUI visible", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("expires-pick"));
    const bar = document.querySelector(".publish-actions");
    expect(bar?.classList.contains("publish-actions--visible")).toBe(true);
  });

  it("renders DiscountCardEditable when editable && !isLocked", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // DiscountCardEditable wraps /new DiscountCard (mocked as discount-card-mock).
    expect(screen.getByTestId("discount-card-mock")).toBeTruthy();
  });

  it("hides DiscountCardEditable when pricesFrozenAt set, falls back to read-only DiscountCard", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          pricesFrozenAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // Mocked /new DiscountCard not rendered (DiscountCardEditable hidden).
    expect(screen.queryByTestId("discount-card-mock")).toBeNull();
    // Read-only DiscountCard renders the empty-state copy instead.
    expect(screen.getByText("Ingen rabatt tillämpad.")).toBeTruthy();
  });

  it("PricesFrozenBanner renders when pricesFrozenAt is set", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          pricesFrozenAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(
      screen.getByText(
        /Priserna är låsta sedan fakturan skickades\. Rader och rabatt kan inte ändras\./,
      ),
    ).toBeTruthy();
  });
});

describe("KonfigureraClient — linesEditable gate", () => {
  it("OPEN + no locks → LineItemsCardEditable renders ('+ Lägg till boende' visible)", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText("+ Lägg till boende")).toBeTruthy();
  });

  it("PENDING_APPROVAL → editable cards remain (meta) but lines are read-only", () => {
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "PENDING_APPROVAL" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // No add-line affordance (linesEditable=false)
    expect(screen.queryByText("+ Lägg till boende")).toBeNull();
    // But meta editable affordances exist (CustomerCardEditable's add button)
    expect(screen.getByText("+ Lägg till kund")).toBeTruthy();
  });

  it("OPEN + pricesFrozenAt set → lines read-only", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          pricesFrozenAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText("+ Lägg till boende")).toBeNull();
  });

  it("OPEN + cancelledAt set → lines read-only", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          cancelledAt: new Date("2026-04-22T08:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText("+ Lägg till boende")).toBeNull();
  });
});

describe("KonfigureraClient — handleSave + handleDiscard", () => {
  it("save: meta dirty → updateDraftMetaAction called → savedAt + router.refresh", async () => {
    updateMetaMock.mockResolvedValueOnce({ ok: true, draft: { id: "draft_1" } });
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // dirty meta:
    fireEvent.click(screen.getByText("tag-add"));
    fireEvent.click(screen.getByText("Spara"));
    await waitFor(() => expect(updateMetaMock).toHaveBeenCalled());
    expect(updateMetaMock.mock.calls[0][0]).toMatchObject({
      draftId: "draft_1",
      tags: ["x"],
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("save: meta failure → no refresh, dirty stays (PublishBarUI still visible)", async () => {
    updateMetaMock.mockResolvedValueOnce({
      ok: false,
      error: "Utkast med status OPEN kan inte ändras",
    });
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("tag-add"));
    fireEvent.click(screen.getByText("Spara"));
    await waitFor(() => expect(updateMetaMock).toHaveBeenCalled());
    expect(refreshMock).not.toHaveBeenCalled();
    // dirty.meta still true → bar stays visible
    const bar = document.querySelector(".publish-actions");
    expect(bar?.classList.contains("publish-actions--visible")).toBe(true);
    // saveError banner surfaces the service error message
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Utkast med status OPEN kan inte ändras",
      );
    });
  });

  it("discard resets dirty + state from draft prop", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // Make dirty
    fireEvent.click(screen.getByText("tag-add"));
    let bar = document.querySelector(".publish-actions");
    expect(bar?.classList.contains("publish-actions--visible")).toBe(true);
    // Discard
    fireEvent.click(screen.getByText("Ignorera"));
    bar = document.querySelector(".publish-actions");
    expect(bar?.classList.contains("publish-actions--visible")).toBe(false);
  });

});

describe("KonfigureraClient — sequential save with stop-at-first-failure (Q8)", () => {
  it("customer dirty + meta dirty: customer saves first; meta fail leaves customer-dirty cleared", async () => {
    updateCustomerMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
    });
    updateMetaMock.mockResolvedValueOnce({
      ok: false,
      error: "Utkast med status FOO kan inte ändras",
    });
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // Mark customer dirty: click "Ta bort kund"
    fireEvent.click(screen.getByText("Ta bort kund"));
    // Mark meta dirty:
    fireEvent.click(screen.getByText("tag-add"));
    // Save
    fireEvent.click(screen.getByText("Spara"));
    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalled());
    await waitFor(() => expect(updateMetaMock).toHaveBeenCalled());
    expect(refreshMock).not.toHaveBeenCalled();
    // saveError banner displays the meta-failure message
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Utkast med status FOO kan inte ändras",
      );
    });
  });

  it("customer-failure stops the chain: meta NOT called", async () => {
    updateCustomerMock.mockResolvedValueOnce({
      ok: false,
      error: "Kunden kunde inte hittas",
    });
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Ta bort kund"));
    fireEvent.click(screen.getByText("tag-add"));
    fireEvent.click(screen.getByText("Spara"));
    await waitFor(() => expect(updateCustomerMock).toHaveBeenCalled());
    expect(updateMetaMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    // saveError banner surfaces the customer-failure message
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Kunden kunde inte hittas",
      );
    });
  });
});

describe("KonfigureraClient — saveError banner", () => {
  it("not rendered initially when no save has failed", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not render when !editable (banner is gated by editable flag)", async () => {
    updateMetaMock.mockResolvedValueOnce({ ok: false, error: "x" });
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "COMPLETED" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    // No editable affordances → no Spara button → no possibility to trigger.
    expect(screen.queryByText("Spara")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("auto-clears after 5000ms", async () => {
    vi.useFakeTimers();
    updateMetaMock.mockResolvedValueOnce({
      ok: false,
      error: "Tillfälligt fel",
    });
    try {
      render(
        <KonfigureraClient
          draft={baseDraft}
          reservations={[]}
          customer={null}
          stripePaymentIntent={null}
          prev={null}
          next={null}
          paymentTerms={null}
        />,
      );
      fireEvent.click(screen.getByText("tag-add"));
      fireEvent.click(screen.getByText("Spara"));
      // Flush the action's microtasks via act() so React commits the
      // setSaveError state-change. Advance only 100ms — well below the
      // 5000ms auto-clear timeout.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByRole("alert").textContent).toBe("Tillfälligt fel");
      // Advance past the 5000ms threshold (cumulative: 100 + 4901 > 5000).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4901);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("KonfigureraClient — lifecycle actions (7.2b.4d.2)", () => {
  it("OPEN status → 'Fler åtgärder' dropdown rendered", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.getByText(/Fler åtgärder/)).toBeTruthy();
  });

  it("COMPLETED status → no dropdown (items=[])", () => {
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "COMPLETED" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByText(/Fler åtgärder/)).toBeNull();
  });

  it("clicking 'Skicka faktura' opens send-invoice ConfirmModal", () => {
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          guestAccountId: "g_1",
          contactEmail: "x@y.z",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Skicka faktura"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Skicka faktura");
  });

  it("send-invoice success with emailStatus='sent' → router.refresh, no banner", async () => {
    sendInvoiceMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
      invoiceUrl: "https://x/inv",
      emailStatus: "sent",
    });
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          guestAccountId: "g_1",
          contactEmail: "x@y.z",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Skicka faktura"));
    fireEvent.click(screen.getByText("Skicka"));
    await waitFor(() => expect(sendInvoiceMock).toHaveBeenCalled());
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    // No error/info banner should appear for emailStatus=sent
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("send-invoice success with emailStatus='failed' → error banner with copy hint", async () => {
    sendInvoiceMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
      invoiceUrl: "https://x/inv",
      emailStatus: "failed",
    });
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          guestAccountId: "g_1",
          contactEmail: "x@y.z",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Skicka faktura"));
    fireEvent.click(screen.getByText("Skicka"));
    await waitFor(() =>
      expect(
        screen.getByText(/Email kunde inte levereras/),
      ).toBeTruthy(),
    );
  });

  it("send-invoice success with emailStatus='skipped_unsubscribed' → info banner", async () => {
    sendInvoiceMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
      invoiceUrl: "https://x/inv",
      emailStatus: "skipped_unsubscribed",
    });
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          guestAccountId: "g_1",
          contactEmail: "x@y.z",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Skicka faktura"));
    fireEvent.click(screen.getByText("Skicka"));
    await waitFor(() =>
      expect(
        screen.getByText(/Mottagaren har avregistrerat sig/),
      ).toBeTruthy(),
    );
  });

  it("send-invoice failure → action error banner", async () => {
    sendInvoiceMock.mockResolvedValueOnce({
      ok: false,
      error: "Stripe ej konfigurerat",
    });
    render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          guestAccountId: "g_1",
          contactEmail: "x@y.z",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Skicka faktura"));
    fireEvent.click(screen.getByText("Skicka"));
    await waitFor(() =>
      expect(screen.getByText("Stripe ej konfigurerat")).toBeTruthy(),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("mark-paid passes reference when provided", async () => {
    markPaidMock.mockResolvedValueOnce({ ok: true, draft: { id: "draft_1" } });
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "INVOICED" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Markera som betald"));
    const refInput = screen.getByPlaceholderText(/Bankgiro/) as HTMLInputElement;
    fireEvent.change(refInput, { target: { value: "BG-1234" } });
    fireEvent.click(screen.getByText("Markera"));
    await waitFor(() =>
      expect(markPaidMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        reference: "BG-1234",
      }),
    );
  });

  it("mark-paid without reference → action called with reference=undefined", async () => {
    markPaidMock.mockResolvedValueOnce({ ok: true, draft: { id: "draft_1" } });
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "INVOICED" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText("Markera som betald"));
    fireEvent.click(screen.getByText("Markera"));
    await waitFor(() =>
      expect(markPaidMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        reference: undefined,
      }),
    );
  });

  it("cancel passes reason when provided", async () => {
    cancelMock.mockResolvedValueOnce({ ok: true, draft: { id: "draft_1" } });
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Avbryt utkast"));
    const reasonInput = screen.getByPlaceholderText(
      /kunden ändrade sig/,
    ) as HTMLTextAreaElement;
    fireEvent.change(reasonInput, { target: { value: "Kund ångrade sig" } });
    fireEvent.click(screen.getByText("Avbryt utkastet"));
    await waitFor(() =>
      expect(cancelMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        reason: "Kund ångrade sig",
      }),
    );
  });

  it("action error auto-clears after 5000ms", async () => {
    vi.useFakeTimers();
    cancelMock.mockResolvedValueOnce({ ok: false, error: "Något fel" });
    try {
      render(
        <KonfigureraClient
          draft={baseDraft}
          reservations={[]}
          customer={null}
          stripePaymentIntent={null}
          prev={null}
          next={null}
          paymentTerms={null}
        />,
      );
      fireEvent.click(screen.getByText(/Fler åtgärder/));
      fireEvent.click(screen.getByText("Avbryt utkast"));
      fireEvent.click(screen.getByText("Avbryt utkastet"));
      // Flush pending microtasks (action promise resolves, setActionError fires)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByText("Något fel")).toBeTruthy();
      // Advance past the 5000ms auto-clear (cumulative 5001 > 5000)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4901);
      });
      expect(screen.queryByText("Något fel")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
