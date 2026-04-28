// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GuestAccount } from "@prisma/client";

import { CustomerCard } from "./CustomerCard";

const baseDraft = {
  guestAccountId: null as string | null,
  companyLocationId: null as string | null,
  contactFirstName: null as string | null,
  contactLastName: null as string | null,
  contactEmail: null as string | null,
  contactPhone: null as string | null,
};

const baseCustomer: GuestAccount = {
  id: "guest_1",
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

describe("CustomerCard — read-only", () => {
  it("renders empty-state when no guest + no company", () => {
    render(<CustomerCard draft={baseDraft} customer={null} />);
    expect(screen.getByText("Ingen kund kopplad.")).toBeTruthy();
  });

  it("renders snapshot name + email + phone when guest is set", () => {
    render(
      <CustomerCard
        draft={{
          ...baseDraft,
          guestAccountId: "guest_1",
          contactFirstName: "Anna",
          contactLastName: "Lind",
          contactEmail: "anna@example.com",
          contactPhone: "+46701234567",
        }}
        customer={baseCustomer}
      />,
    );
    expect(screen.getByText("Anna Lind")).toBeTruthy();
    expect(screen.getByText("anna@example.com")).toBeTruthy();
    expect(screen.getByText("+46701234567")).toBeTruthy();
  });

  it("renders Visa kund link when guestAccountId is set", () => {
    render(
      <CustomerCard
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        customer={baseCustomer}
      />,
    );
    const link = screen.getByText(/Visa kund/);
    expect(link.getAttribute("href")).toBe("/customers/guest_1");
  });

  it("renders company id when companyLocationId is set (B2B)", () => {
    render(
      <CustomerCard
        draft={{ ...baseDraft, companyLocationId: "comp_loc_42" }}
        customer={null}
      />,
    );
    expect(screen.getByText("comp_loc_42")).toBeTruthy();
  });

  it("falls back to GuestAccount.firstName/lastName/email/phone when snapshot fields are null", () => {
    render(
      <CustomerCard
        draft={{ ...baseDraft, guestAccountId: "guest_1" }}
        customer={{
          ...baseCustomer,
          firstName: "Lookup",
          lastName: "Name",
          email: "lookup@example.com",
          phone: "+46700000000",
        }}
      />,
    );
    expect(screen.getByText("Lookup Name")).toBeTruthy();
    expect(screen.getByText("lookup@example.com")).toBeTruthy();
    expect(screen.getByText("+46700000000")).toBeTruthy();
  });
});
