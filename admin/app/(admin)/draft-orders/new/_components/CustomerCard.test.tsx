// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CustomerSearchResult } from "@/app/_lib/draft-orders";
import { CustomerCard } from "./CustomerCard";

const ANNA: CustomerSearchResult = {
  id: "g1",
  email: "anna@example.se",
  name: "Anna Andersson",
  phone: null,
  draftOrderCount: 0,
  orderCount: 3,
};

describe("CustomerCard", () => {
  it("CC1 — empty state renders + Lägg till kund", () => {
    render(
      <CustomerCard
        customer={null}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("Kund")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "+ Lägg till kund" }),
    ).toBeTruthy();
  });

  it("CC2 — empty state click triggers onChangeClick", () => {
    const onChangeClick = vi.fn();
    render(
      <CustomerCard
        customer={null}
        onChangeClick={onChangeClick}
        onClear={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "+ Lägg till kund" }),
    );
    expect(onChangeClick).toHaveBeenCalledTimes(1);
  });

  it("CC3 — selected state renders name, email, order count", () => {
    render(
      <CustomerCard
        customer={ANNA}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("Anna Andersson")).toBeTruthy();
    expect(screen.getByText("anna@example.se · 3 ordrar")).toBeTruthy();
  });

  it("CC4 — name=null renders email as primary, no email in meta", () => {
    render(
      <CustomerCard
        customer={{
          ...ANNA,
          name: null,
          orderCount: 0,
        }}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("anna@example.se")).toBeTruthy();
    // No meta row at all when no name and no orders.
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("CC5 — name=null with orderCount>0 shows orders only in meta", () => {
    render(
      <CustomerCard
        customer={{
          ...ANNA,
          name: null,
          orderCount: 1,
        }}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("anna@example.se")).toBeTruthy();
    expect(screen.getByText("1 order")).toBeTruthy();
  });

  it("CC6 — orderCount=1 uses singular, >1 uses plural", () => {
    const { rerender } = render(
      <CustomerCard
        customer={{ ...ANNA, orderCount: 1 }}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("anna@example.se · 1 order")).toBeTruthy();

    rerender(
      <CustomerCard
        customer={{ ...ANNA, orderCount: 5 }}
        onChangeClick={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("anna@example.se · 5 ordrar")).toBeTruthy();
  });

  it("CC7 — selected state click on Byt triggers onChangeClick", () => {
    const onChangeClick = vi.fn();
    render(
      <CustomerCard
        customer={ANNA}
        onChangeClick={onChangeClick}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Byt" }));
    expect(onChangeClick).toHaveBeenCalledTimes(1);
  });

  it("CC8 — selected state click on X (Ta bort kund) triggers onClear", () => {
    const onClear = vi.fn();
    render(
      <CustomerCard
        customer={ANNA}
        onChangeClick={() => {}}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ta bort kund" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
