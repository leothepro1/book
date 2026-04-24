/**
 * ProductForm — SearchListingEditor integration tests (M6.3)
 * ══════════════════════════════════════════════════════════
 *
 * Scope: verifies the SEO wire-in lands correctly on both /new and
 * /[id] paths — Sökmotorlistning card renders, props flow into the
 * editor, edits propagate, and the save payload carries `seo`
 * through to both `createProduct` and `updateProduct`. Other
 * ProductForm surfaces (variants, media, tags, collections) are out
 * of scope and covered by their own pipelines.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module-boundary mocks ────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/_lib/products", () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  archiveProduct: vi.fn(),
  deleteProduct: vi.fn(),
  effectivePrice: () => 0,
  listCollections: vi.fn().mockResolvedValue([]),
  assignProductTemplate: vi.fn(),
}));

vi.mock("@/app/_lib/products/template-actions", () => ({
  listProductTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/(admin)/_lib/seo/previewAction", () => ({
  previewSeoAction: vi.fn().mockResolvedValue({
    ok: true,
    preview: {
      title: "Frukost-buffé | Apelviken",
      description: "Morgonens vackraste ritual.",
      canonicalUrl: "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
      displayUrl: "apelviken-x.rutgr.com › shop › products › frukost-buffe",
      ogImageUrl: null,
      faviconUrl: null,
    },
  }),
}));

vi.mock("@/app/(admin)/_components/PublishBar/PublishBar", () => ({
  PublishBarUI: ({
    onPublish,
    hasUnsavedChanges,
  }: {
    onPublish: () => void;
    hasUnsavedChanges: boolean;
  }) => (
    <button
      type="button"
      onClick={onPublish}
      aria-label="save"
      data-dirty={hasUnsavedChanges}
    >
      Spara
    </button>
  ),
}));

vi.mock("@/app/(admin)/_components/MediaLibrary", () => ({
  MediaLibraryModal: () => null,
}));

vi.mock("@/app/_components/EditorIcon", () => ({
  EditorIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/app/_components/RichTextEditor", () => ({
  RichTextEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));

import { createProduct, updateProduct } from "@/app/_lib/products";

import ProductForm from "./ProductForm";

// ── Fixtures ──────────────────────────────────────────────────

type ExistingProductStub = Parameters<typeof ProductForm>[0]["product"];

function productStub(): ExistingProductStub {
  return {
    id: "prod_1",
    title: "Frukost-buffé",
    description: "Morgonens vackraste ritual.",
    slug: "frukost-buffe",
    status: "ACTIVE",
    productType: "STANDARD",
    price: 14900,
    compareAtPrice: null,
    currency: "SEK",
    taxable: true,
    trackInventory: false,
    inventoryQuantity: 0,
    continueSellingWhenOutOfStock: false,
    version: 1,
    media: [],
    options: [],
    variants: [],
    collectionItems: [],
    tags: [],
  };
}

const initialPreview = {
  title: "Frukost-buffé | Apelviken",
  description: "Morgonens vackraste ritual.",
  canonicalUrl: "https://apelviken-x.rutgr.com/shop/products/frukost-buffe",
  displayUrl: "apelviken-x.rutgr.com › shop › products › frukost-buffe",
  ogImageUrl: null,
  faviconUrl: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createProduct).mockReset();
  vi.mocked(createProduct).mockResolvedValue({
    ok: true,
    data: { id: "prod_new", slug: "new-product" },
  });
  vi.mocked(updateProduct).mockReset();
  vi.mocked(updateProduct).mockResolvedValue({
    ok: true,
    data: { id: "prod_1", slug: "frukost-buffe", version: 2 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────

describe("ProductForm — /[id] edit path", () => {
  it("renders the Sökmotorlistning card seeded with initialPreview + seo prop", () => {
    render(
      <ProductForm
        product={productStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    // Preview row from initialPreview — no flash of empty content.
    expect(screen.getByText("Frukost-buffé | Apelviken")).not.toBeNull();
  });

  it("populates the edit panel from the `seo` prop", () => {
    render(
      <ProductForm
        product={productStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Stored titel");
    expect(
      (screen.getByLabelText("Metabeskrivning") as HTMLTextAreaElement).value,
    ).toBe("Stored beskrivning");
  });

  it("passes the real product.slug to the read-only URL input", () => {
    render(
      <ProductForm
        product={productStub()}
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const slugInput = screen.getByLabelText(
      "URL-användarnamn",
    ) as HTMLInputElement;
    expect(slugInput.value).toBe("frukost-buffe");
  });

  it("includes seo in the updateProduct save payload when edited", async () => {
    render(
      <ProductForm
        product={productStub()}
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    fireEvent.change(screen.getByLabelText("Sidrubrik"), {
      target: { value: "Ny SEO-titel" },
    });
    fireEvent.change(screen.getByLabelText("Metabeskrivning"), {
      target: { value: "Ny SEO-beskrivning" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(updateProduct).toHaveBeenCalledTimes(1);
    const [id, payload] = vi.mocked(updateProduct).mock.calls[0];
    expect(id).toBe("prod_1");
    expect(payload.seo).toEqual({
      title: "Ny SEO-titel",
      description: "Ny SEO-beskrivning",
    });
  });

  it("carries stored seo values into updateProduct when no edits made", async () => {
    render(
      <ProductForm
        product={productStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(updateProduct).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateProduct).mock.calls[0];
    expect(payload.seo).toEqual({
      title: "Stored titel",
      description: "Stored beskrivning",
    });
  });
});

// ──────────────────────────────────────────────────────────────

describe("ProductForm — /new create path", () => {
  it("renders Sökmotorlistning with empty seo prop + placeholder slug", () => {
    render(<ProductForm initialPreview={initialPreview} />);
    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Metabeskrivning") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("URL-användarnamn") as HTMLInputElement).value,
    ).toBe("ny-produkt");
  });

  it("includes seo in the createProduct save payload", async () => {
    render(<ProductForm initialPreview={initialPreview} />);

    // Give the product a title so createProduct's schema (min length
    // 1) accepts the save; use the placeholder-scoped input so this
    // never collides with the Sökmotorlistning inputs below.
    fireEvent.change(
      screen.getByPlaceholderText("T.ex. Frukostbuffé"),
      { target: { value: "Min nya produkt" } },
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    fireEvent.change(screen.getByLabelText("Sidrubrik"), {
      target: { value: "SEO-titel för ny produkt" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(createProduct).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(createProduct).mock.calls[0];
    expect(payload.seo).toEqual({
      title: "SEO-titel för ny produkt",
      description: "",
    });
  });
});
