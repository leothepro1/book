// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const updateMetaMock = vi.fn();
const updateCustomerMock = vi.fn();
const sendInvoiceMock = vi.fn();
const resendInvoiceMock = vi.fn();
const markPaidMock = vi.fn();
const cancelMock = vi.fn();
const submitForApprovalMock = vi.fn();
const approveDraftMock = vi.fn();
const rejectDraftMock = vi.fn();

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
  resendDraftInvoiceAction: (input: unknown) => resendInvoiceMock(input),
  markDraftAsPaidAction: (input: unknown) => markPaidMock(input),
  cancelDraftAction: (input: unknown) => cancelMock(input),
  submitDraftForApprovalAction: (input: unknown) =>
    submitForApprovalMock(input),
  approveDraftAction: (input: unknown) => approveDraftMock(input),
  rejectDraftAction: (input: unknown) => rejectDraftMock(input),
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
  shareLinkExpiresAt: null,
  createdByUserId: null,
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
  resendInvoiceMock.mockReset();
  markPaidMock.mockReset();
  cancelMock.mockReset();
  submitForApprovalMock.mockReset();
  approveDraftMock.mockReset();
  rejectDraftMock.mockReset();
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
          events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
        events={[]}
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
          events={[]}
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

describe("KonfigureraClient — timeline integration (7.2b.4e)", () => {
  it("empty events array → 'Ingen aktivitet.' rendered in pf-main", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    expect(screen.getByText("Ingen aktivitet.")).toBeTruthy();
    expect(screen.getByText("Aktivitet")).toBeTruthy();
  });

  it("renders timeline events alongside other cards", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[
          {
            id: "ev_1",
            type: "CREATED",
            metadata: {},
            actorUserId: null,
            actorSource: "admin_ui",
            createdAt: new Date("2026-04-28T10:00:00Z"),
          },
          {
            id: "ev_2",
            type: "INVOICE_SENT",
            metadata: {},
            actorUserId: null,
            actorSource: "admin_ui",
            createdAt: new Date("2026-04-28T11:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.getByText("Utkast skapat")).toBeTruthy();
    expect(screen.getByText("Faktura skickad")).toBeTruthy();
    expect(screen.queryByText("Ingen aktivitet.")).toBeNull();
  });

  it("timeline renders for terminal-status drafts (always read-only)", () => {
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "COMPLETED" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[
          {
            id: "ev_1",
            type: "CONVERTED",
            metadata: {},
            actorUserId: null,
            actorSource: "webhook",
            createdAt: new Date("2026-04-28T10:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.getByText("Konverterad till order")).toBeTruthy();
  });
});

// ── Resend invoice (FAS 7.4 B.3) ──────────────────────────────

describe("KonfigureraClient — resend invoice (FAS 7.4)", () => {
  function renderInvoiced(overrides: Partial<KonfigureraClientDraft> = {}) {
    return render(
      <KonfigureraClient
        draft={{
          ...baseDraft,
          status: "INVOICED",
          contactEmail: "x@y.z",
          shareLinkExpiresAt: new Date("2099-01-01T00:00:00Z"),
          invoiceSentAt: new Date("2026-04-25T12:00:00Z"),
          pricesFrozenAt: new Date("2026-04-25T12:00:00Z"),
          ...overrides,
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
  }

  it("dropdown shows 'Skicka om faktura' when status=INVOICED + link active", () => {
    renderInvoiced();
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByText("Skicka om faktura")).toBeTruthy();
  });

  it("dropdown shows expired suffix when shareLinkExpiresAt < now", () => {
    renderInvoiced({
      shareLinkExpiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(
      screen.getByText("Skicka om faktura (länken har gått ut)"),
    ).toBeTruthy();
  });

  it("'Skicka om faktura' is hidden when status=PAID", () => {
    render(
      <KonfigureraClient
        draft={{ ...baseDraft, status: "PAID" }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    // Dropdown trigger may not even appear if no items — avoid asserting
    // on the menu and instead assert on absence of the label outright.
    expect(screen.queryByText(/Skicka om faktura/)).toBeNull();
  });

  it("'Skicka om faktura' is hidden when status=OPEN (no invoice yet)", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    expect(screen.queryByText(/Skicka om faktura/)).toBeNull();
  });

  it("clicking row opens ConfirmModal", () => {
    renderInvoiced();
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Skicka om faktura"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Skicka om faktura");
  });

  it("confirm → resendDraftInvoiceAction called → router.refresh on ok", async () => {
    resendInvoiceMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
      invoiceUrl: "https://x/inv-2",
      rotatedPaymentIntent: true,
      emailStatus: "sent",
    });
    renderInvoiced();
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Skicka om faktura"));
    fireEvent.click(screen.getByText("Skicka om"));
    await waitFor(() =>
      expect(resendInvoiceMock).toHaveBeenCalledWith({ draftId: "draft_1" }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("resend failure → action error banner", async () => {
    resendInvoiceMock.mockResolvedValueOnce({
      ok: false,
      error: "Faktura redan betald",
    });
    renderInvoiced();
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Skicka om faktura"));
    fireEvent.click(screen.getByText("Skicka om"));
    await waitFor(() =>
      expect(screen.getByText("Faktura redan betald")).toBeTruthy(),
    );
  });
});

// ── Approval flow (FAS 7.6-lite B.3) ──────────────────────────

describe("KonfigureraClient — approval flow dropdown gating (FAS 7.6-lite)", () => {
  const draftWithLine: KonfigureraClientDraft = {
    ...baseDraft,
    lineItems: [
      // Minimal placeholder; LineItemsCard renders, full structure not required
      // for dropdown gating — only `length > 0` matters.
      {
        ...({
          id: "li_1",
          draftOrderId: baseDraft.id,
          tenantId: "tenant_1",
          lineType: "ACCOMMODATION",
          position: 1,
          title: "Cabin",
          quantity: 1,
          unitPriceCents: BigInt(150000),
          totalCents: BigInt(150000),
          taxAmountCents: BigInt(0),
          taxable: true,
        } as unknown as KonfigureraClientDraft["lineItems"][number]),
      },
    ],
  };

  it("OPEN with line items → 'Begär godkännande' visible in dropdown", () => {
    render(
      <KonfigureraClient
        draft={draftWithLine}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByText("Begär godkännande")).toBeTruthy();
  });

  it("OPEN with NO line items → 'Begär godkännande' hidden", () => {
    render(
      <KonfigureraClient
        draft={baseDraft}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    // baseDraft has lineItems=[], dropdown does not surface submit option.
    // (The dropdown trigger appears only if there is at least one item;
    // for OPEN+empty there is "Avbryt utkast", so the menu opens and we
    // can assert absence.)
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.queryByText("Begär godkännande")).toBeNull();
  });

  it("INVOICED → no 'Begär godkännande' (already past OPEN)", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "INVOICED",
          shareLinkExpiresAt: new Date("2099-01-01T00:00:00Z"),
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.queryByText("Begär godkännande")).toBeNull();
  });

  it("PENDING_APPROVAL → both 'Godkänn' and 'Avslå' visible (currentUserId mismatch)", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByText("Godkänn")).toBeTruthy();
    expect(screen.getByText("Avslå")).toBeTruthy();
  });

  it("PENDING_APPROVAL self-approval → 'Godkänn' hidden, 'Avslå' visible", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_same",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_same"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.queryByText("Godkänn")).toBeNull();
    expect(screen.getByText("Avslå")).toBeTruthy();
  });

  it("PENDING_APPROVAL with null createdByUserId → 'Godkänn' visible (legacy graceful)", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: null,
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_actor"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    expect(screen.getByText("Godkänn")).toBeTruthy();
  });
});

describe("KonfigureraClient — approval modals (FAS 7.6-lite)", () => {
  const draftWithLine: KonfigureraClientDraft = {
    ...baseDraft,
    lineItems: [
      {
        ...({
          id: "li_1",
          draftOrderId: baseDraft.id,
          tenantId: "tenant_1",
          lineType: "ACCOMMODATION",
          position: 1,
          title: "Cabin",
          quantity: 1,
          unitPriceCents: BigInt(150000),
          totalCents: BigInt(150000),
          taxAmountCents: BigInt(0),
          taxable: true,
        } as unknown as KonfigureraClientDraft["lineItems"][number]),
      },
    ],
  };

  it("clicking 'Begär godkännande' opens modal with optional textarea", () => {
    render(
      <KonfigureraClient
        draft={draftWithLine}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Begär godkännande"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Begär godkännande");
    // Confirm button NOT disabled (note is optional)
    const confirm = screen.getByText("Begär") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });

  it("submit-for-approval success → action called + router.refresh", async () => {
    submitForApprovalMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
    });
    render(
      <KonfigureraClient
        draft={draftWithLine}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Begär godkännande"));
    fireEvent.click(screen.getByText("Begär"));
    await waitFor(() =>
      expect(submitForApprovalMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        requestNote: undefined,
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("clicking 'Godkänn' opens modal with optional textarea", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Godkänn"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Godkänn utkast");
  });

  it("approve success → action called + router.refresh", async () => {
    approveDraftMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
    });
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Godkänn"));
    // Click the *modal* "Godkänn" button (the second one). The modal one
    // is inside a dialog role; the menu trigger has already disappeared.
    const confirmButtons = screen.getAllByText("Godkänn");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() =>
      expect(approveDraftMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        approvalNote: undefined,
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("clicking 'Avslå' opens modal with REQUIRED reason textarea, confirm disabled", () => {
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Avslå"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("Avslå utkast");
    // Reject button is disabled when reason is empty
    const rejectButtons = screen.getAllByText("Avslå");
    const modalRejectButton = rejectButtons[rejectButtons.length - 1] as HTMLButtonElement;
    expect(modalRejectButton.disabled).toBe(true);
  });

  it("typing reason enables 'Avslå' button + reject success calls action", async () => {
    rejectDraftMock.mockResolvedValueOnce({
      ok: true,
      draft: { id: "draft_1" },
    });
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Avslå"));
    const reasonInput = screen.getByPlaceholderText(
      /pris för högt/,
    ) as HTMLTextAreaElement;
    fireEvent.change(reasonInput, {
      target: { value: "Pris för högt jämfört med konkurrenter" },
    });
    const rejectButtons = screen.getAllByText("Avslå");
    const modalRejectButton = rejectButtons[rejectButtons.length - 1] as HTMLButtonElement;
    expect(modalRejectButton.disabled).toBe(false);
    fireEvent.click(modalRejectButton);
    await waitFor(() =>
      expect(rejectDraftMock).toHaveBeenCalledWith({
        draftId: "draft_1",
        rejectionReason: "Pris för högt jämfört med konkurrenter",
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("approve failure → action error banner shows", async () => {
    approveDraftMock.mockResolvedValueOnce({
      ok: false,
      error: "Cannot approve your own approval request",
    });
    render(
      <KonfigureraClient
        draft={{
          ...draftWithLine,
          status: "PENDING_APPROVAL",
          createdByUserId: "user_creator",
        }}
        reservations={[]}
        customer={null}
        stripePaymentIntent={null}
        prev={null}
        next={null}
        paymentTerms={null}
        events={[]}
        currentUserId="user_other"
      />,
    );
    fireEvent.click(screen.getByText(/Fler åtgärder/));
    fireEvent.click(screen.getByText("Godkänn"));
    const confirmButtons = screen.getAllByText("Godkänn");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() =>
      expect(
        screen.getByText("Cannot approve your own approval request"),
      ).toBeTruthy(),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
