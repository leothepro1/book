// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { GuestAccount } from "@prisma/client";

// Mock the cross-route CustomerPickerModal — testing this card's wiring,
// not the modal's search behavior.
vi.mock(
  "@/app/(admin)/draft-orders/new/_components/CustomerPickerModal",
  () => ({
    CustomerPickerModal: ({
      onClose,
      onSelect,
    }: {
      onClose: () => void;
      onSelect: (c: {
        id: string;
        email: string;
        name: string | null;
        phone: string | null;
        draftOrderCount: number;
        orderCount: number;
      }) => void;
    }) => (
      <div data-testid="picker">
        <button
          type="button"
          onClick={() =>
            onSelect({
              id: "guest_picked",
              email: "picked@example.com",
              name: "Picked Name",
              phone: "+46700000001",
              draftOrderCount: 0,
              orderCount: 0,
            })
          }
        >
          mock-pick
        </button>
        <button type="button" onClick={onClose}>
          mock-close
        </button>
      </div>
    ),
  }),
);

import { CustomerCardEditable } from "./CustomerCardEditable";

const baseDraft = {
  guestAccountId: null as string | null,
  contactFirstName: null as string | null,
  contactLastName: null as string | null,
  contactEmail: null as string | null,
  contactPhone: null as string | null,
};

const baseCustomer: GuestAccount = {
  id: "guest_existing",
  tenantId: "tenant_1",
  email: "lookup@example.com",
  name: null,
  phone: null,
  firstName: null,
  lastName: null,
  address1: null,
  address2: null,
  city: null,
  postalCode: null,
  country: "SE",
  locale: null,
  verifiedEmail: false,
  state: "ENABLED" as const,
  note: null,
  emailMarketingState: "NOT_SUBSCRIBED" as const,
  emailConsentedAt: null,
  emailConsentSource: null,
  emailOptInLevel: "SINGLE_OPT_IN" as const,
  smsMarketingState: "NOT_SUBSCRIBED" as const,
  smsConsentedAt: null,
  dataSaleOptOut: false,
  dataSaleOptOutAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let onChangeMock: Mock<(next: { guestAccountId: string | null }) => void>;

beforeEach(() => {
  onChangeMock = vi.fn();
});

describe("CustomerCardEditable", () => {
  it("renders empty-state with 'Lägg till kund' when guestAccountId is null", () => {
    render(
      <CustomerCardEditable
        draft={baseDraft}
        customer={null}
        value={{ guestAccountId: null }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText("Ingen kund kopplad.")).toBeTruthy();
    expect(screen.getByText("+ Lägg till kund")).toBeTruthy();
  });

  it("renders snapshot name/email/phone + Ändra/Ta bort actions when customer set", () => {
    render(
      <CustomerCardEditable
        draft={{
          ...baseDraft,
          guestAccountId: "guest_1",
          contactFirstName: "Anna",
          contactLastName: "Lind",
          contactEmail: "anna@example.com",
          contactPhone: "+46701234567",
        }}
        customer={baseCustomer}
        value={{ guestAccountId: "guest_1" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText("Anna Lind")).toBeTruthy();
    expect(screen.getByText("anna@example.com")).toBeTruthy();
    expect(screen.getByText("+46701234567")).toBeTruthy();
    expect(screen.getByText("Ändra")).toBeTruthy();
    expect(screen.getByText("Ta bort kund")).toBeTruthy();
  });

  it("'Ta bort kund' calls onChange with null guestAccountId", () => {
    render(
      <CustomerCardEditable
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        customer={baseCustomer}
        value={{ guestAccountId: "guest_1" }}
        onChange={onChangeMock}
      />,
    );
    fireEvent.click(screen.getByText("Ta bort kund"));
    expect(onChangeMock).toHaveBeenCalledWith({ guestAccountId: null });
  });

  it("'Ändra' opens the CustomerPickerModal", () => {
    render(
      <CustomerCardEditable
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        customer={baseCustomer}
        value={{ guestAccountId: "guest_1" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.queryByTestId("picker")).toBeNull();
    fireEvent.click(screen.getByText("Ändra"));
    expect(screen.getByTestId("picker")).toBeTruthy();
  });

  it("'+ Lägg till kund' opens picker, then onSelect calls onChange with picked id and shows pending data", () => {
    const { rerender } = render(
      <CustomerCardEditable
        draft={baseDraft}
        customer={null}
        value={{ guestAccountId: null }}
        onChange={onChangeMock}
      />,
    );
    fireEvent.click(screen.getByText("+ Lägg till kund"));
    fireEvent.click(screen.getByText("mock-pick"));
    expect(onChangeMock).toHaveBeenCalledWith({ guestAccountId: "guest_picked" });
    // Picker closes after select.
    expect(screen.queryByTestId("picker")).toBeNull();
    // Parent updates value → component re-renders with new id; pending shows.
    rerender(
      <CustomerCardEditable
        draft={baseDraft}
        customer={null}
        value={{ guestAccountId: "guest_picked" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText("Picked Name")).toBeTruthy();
    expect(screen.getByText("picked@example.com")).toBeTruthy();
  });

  it("falls back to GuestAccount fields when snapshot fields are null", () => {
    render(
      <CustomerCardEditable
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        customer={{
          ...baseCustomer,
          firstName: "Lookup",
          lastName: "Name",
          email: "lookup@example.com",
          phone: "+46700000000",
        }}
        value={{ guestAccountId: "guest_1" }}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText("Lookup Name")).toBeTruthy();
    expect(screen.getByText("lookup@example.com")).toBeTruthy();
    expect(screen.getByText("+46700000000")).toBeTruthy();
  });
});
