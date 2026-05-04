import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("../../invoice.css", () => ({}));

const { default: CancelledPage } = await import("./page");

describe("InvoiceCancelledPage", () => {
  it("renders cancellation notice and link back to invoice", async () => {
    const ui = await CancelledPage({
      params: Promise.resolve({ token: "tok_abc" }),
    });
    render(ui);
    expect(screen.getByText("Betalningen avbröts")).toBeTruthy();
    expect(screen.getByText("Inget belopp har dragits")).toBeTruthy();
    const link = screen.getByText("Tillbaka till fakturan").closest("a");
    expect(link?.getAttribute("href")).toBe("/invoice/tok_abc");
  });
});
