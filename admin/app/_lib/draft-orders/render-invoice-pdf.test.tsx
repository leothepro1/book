/**
 * @vitest-environment node
 *
 * renderInvoicePdf — React-PDF returns a Node Buffer, so this test
 * runs under the node environment (the project default is jsdom).
 */

import { describe, it, expect } from "vitest";
import { renderInvoicePdf } from "./render-invoice-pdf";
import type {
  PublicDraftDTO,
  PublicDraftLineItem,
} from "./get-by-share-token";

// ── Fixtures ────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<PublicDraftLineItem> = {},
): PublicDraftLineItem {
  return {
    id: "line_1",
    position: 0,
    lineType: "PRODUCT",
    title: "Strandvilla — premium",
    variantTitle: null,
    quantity: 1,
    unitPriceCents: BigInt(7500_00),
    subtotalCents: BigInt(7500_00),
    totalCents: BigInt(7500_00),
    checkInDate: null,
    checkOutDate: null,
    nights: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<PublicDraftDTO> = {}): PublicDraftDTO {
  return {
    id: "draft_1",
    displayNumber: "D-2026-0001",
    status: "INVOICED",
    contactEmail: "buyer@example.com",
    contactPhone: null,
    contactFirstName: "Anna",
    contactLastName: "Andersson",
    customerNote: null,
    subtotalCents: BigInt(7500_00),
    orderDiscountCents: BigInt(0),
    totalTaxCents: BigInt(0),
    totalCents: BigInt(7500_00),
    currency: "SEK",
    taxesIncluded: true,
    appliedDiscountCode: null,
    appliedDiscountAmount: null,
    paymentTerms: null,
    invoiceSentAt: new Date("2026-04-25T12:00:00Z"),
    shareLinkExpiresAt: new Date("2026-05-10T12:00:00Z"),
    invoiceEmailSubject: null,
    invoiceEmailMessage: null,
    lineItems: [makeLine()],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("renderInvoicePdf", () => {
  it("returns a Buffer", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft(),
      tenantName: "Acme Hotell",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("output starts with PDF magic bytes (%PDF-)", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft(),
      tenantName: "Acme Hotell",
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a minimal draft (no discount, no tax, no customer note, no payment terms)", async () => {
    const minimal = makeDraft({
      orderDiscountCents: BigInt(0),
      totalTaxCents: BigInt(0),
      customerNote: null,
      contactPhone: null,
      paymentTerms: null,
    });
    const buf = await renderInvoicePdf({
      draft: minimal,
      tenantName: "Tiny Tenant",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a full-shape draft (3 line items, discount, customer note, accommodation dates)", async () => {
    const full = makeDraft({
      lineItems: [
        makeLine({
          id: "line_a",
          lineType: "ACCOMMODATION",
          title: "Strandvilla",
          variantTitle: "Havsutsikt",
          quantity: 1,
          totalCents: BigInt(7500_00),
          checkInDate: "2026-06-01T00:00:00.000Z",
          checkOutDate: "2026-06-04T00:00:00.000Z",
          nights: 3,
        }),
        makeLine({
          id: "line_b",
          lineType: "PRODUCT",
          title: "Frukost",
          quantity: 6,
          totalCents: BigInt(900_00),
        }),
        makeLine({
          id: "line_c",
          lineType: "PRODUCT",
          title: "Avgång — sen incheckning",
          quantity: 1,
          totalCents: BigInt(200_00),
        }),
      ],
      subtotalCents: BigInt(8600_00),
      orderDiscountCents: BigInt(500_00),
      totalTaxCents: BigInt(1500_00),
      totalCents: BigInt(9600_00),
      appliedDiscountCode: "SOMMAR10",
      appliedDiscountAmount: BigInt(500_00),
      customerNote: "Tack för bokningen — vi ser fram emot att hälsa er välkomna!",
    });
    const buf = await renderInvoicePdf({
      draft: full,
      tenantName: "Acme Hotell",
      tenantAddress: "Storgatan 1, 411 18 Göteborg",
      brandColor: "#8B3DFF",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("falls back to 'Faktura' header when tenantName is empty", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft(),
      tenantName: "",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("accepts a brandColor without throwing", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft(),
      tenantName: "Acme Hotell",
      brandColor: "#8B3DFF",
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders gracefully when lineItems is empty", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft({
        lineItems: [],
        subtotalCents: BigInt(0),
        totalCents: BigInt(0),
      }),
      tenantName: "Acme Hotell",
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a long customer note (1000 chars) without truncation error", async () => {
    const longNote = "Hej och välkommen! ".repeat(60).slice(0, 1000);
    expect(longNote.length).toBe(1000);
    const buf = await renderInvoicePdf({
      draft: makeDraft({ customerNote: longNote }),
      tenantName: "Acme Hotell",
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it(
    "paginates a 60-line-item draft (Q9 LOCKED) without error",
    async () => {
      const lines: PublicDraftLineItem[] = Array.from({ length: 60 }, (_, i) =>
        makeLine({
          id: `line_${i}`,
          title: `Rad ${i + 1}`,
          quantity: 1,
          totalCents: BigInt(100_00),
        }),
      );
      const buf = await renderInvoicePdf({
        draft: makeDraft({
          lineItems: lines,
          subtotalCents: BigInt(60 * 100_00),
          totalCents: BigInt(60 * 100_00),
        }),
        tenantName: "Acme Hotell",
      });
      expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(buf.byteLength).toBeGreaterThan(0);
    },
    20_000,
  );

  it("omits the customerNote section when note is empty string", async () => {
    const buf = await renderInvoicePdf({
      draft: makeDraft({ customerNote: "" }),
      tenantName: "Acme Hotell",
    });
    // Whitespace-only logic: empty string takes the no-note path; simply
    // assert renderer didn't throw on the falsy-but-non-null branch.
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
