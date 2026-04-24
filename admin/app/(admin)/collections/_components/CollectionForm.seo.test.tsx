/**
 * CollectionForm — SearchListingEditor integration tests (M6.6)
 *
 * Mirrors ProductForm.seo.test.tsx structurally — same assertions
 * per resource: card renders with initialPreview, edit-panel seeded
 * from seo prop, edits flow into createCollection/updateCollection
 * payload, compose-at-parent behaves on /edit.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/_lib/products", () => ({
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  searchProducts: vi.fn().mockResolvedValue([]),
  listCollections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/(admin)/_lib/seo/previewAction", () => ({
  previewSeoAction: vi.fn().mockResolvedValue({
    ok: true,
    preview: {
      title: "Mat & Dryck | Apelviken",
      description: "Kvällar med vin.",
      canonicalUrl: "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
      displayUrl: "apelviken-x.rutgr.com › shop › collections › mat-och-dryck",
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

import { createCollection, updateCollection } from "@/app/_lib/products";
import { previewSeoAction } from "@/app/(admin)/_lib/seo/previewAction";

import CollectionForm from "./CollectionForm";

// ── Fixtures ──────────────────────────────────────────────────

type ExistingCollectionStub = Parameters<typeof CollectionForm>[0]["collection"];

function collectionStub(): ExistingCollectionStub {
  return {
    id: "col_1",
    title: "Mat & Dryck",
    description: "Kvällar med vin.",
    slug: "mat-och-dryck",
    imageUrl: null,
    status: "ACTIVE",
    items: [],
  };
}

const initialPreview = {
  title: "Mat & Dryck | Apelviken",
  description: "Kvällar med vin.",
  canonicalUrl: "https://apelviken-x.rutgr.com/shop/collections/mat-och-dryck",
  displayUrl: "apelviken-x.rutgr.com › shop › collections › mat-och-dryck",
  ogImageUrl: null,
  faviconUrl: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createCollection).mockReset();
  vi.mocked(createCollection).mockResolvedValue({
    ok: true,
    data: { id: "col_new", slug: "new-collection" },
  });
  vi.mocked(updateCollection).mockReset();
  vi.mocked(updateCollection).mockResolvedValue({
    ok: true,
    data: { id: "col_1", slug: "mat-och-dryck", version: 2 },
  });
  vi.mocked(previewSeoAction).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────

describe("CollectionForm — /[id] edit path", () => {
  it("renders Sökmotorlistning with initialPreview + seo prop", () => {
    render(
      <CollectionForm
        collection={collectionStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    expect(screen.getByText("Mat & Dryck | Apelviken")).not.toBeNull();
  });

  it("populates edit panel from seo prop (USER mode)", () => {
    render(
      <CollectionForm
        collection={collectionStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Stored titel");
  });

  it("includes seo in updateCollection payload when edited", async () => {
    render(
      <CollectionForm
        collection={collectionStub()}
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, { target: { value: "Ny SEO-titel" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(updateCollection).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateCollection).mock.calls[0];
    expect(payload.seo).toEqual({
      title: "Ny SEO-titel",
      description: "",
    });
  });
});

describe("CollectionForm — /new create path", () => {
  it("renders with placeholder slug + empty seo", () => {
    render(<CollectionForm initialPreview={initialPreview} />);
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("URL-användarnamn") as HTMLInputElement).value,
    ).toBe("ny-produktserie");
  });

  it("includes seo in createCollection save payload", async () => {
    render(<CollectionForm initialPreview={initialPreview} />);

    // Set the parent title so Zod's min(1) accepts the save.
    fireEvent.change(
      screen.getByPlaceholderText("T.ex. Mat & Dryck"),
      { target: { value: "Min nya produktserie" } },
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, {
      target: { value: "SEO-titel för ny produktserie" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(createCollection).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(createCollection).mock.calls[0];
    expect(payload.seo).toMatchObject({
      title: "SEO-titel för ny produktserie",
    });
  });
});

describe("CollectionForm — compose-at-parent", () => {
  it("preview reflects parent title when seoState is empty", async () => {
    render(
      <CollectionForm
        collection={collectionStub()}
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(previewSeoAction).toHaveBeenCalled();
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    const overrides = call.overrides as { title: string };
    expect(overrides.title).toBe("Mat & Dryck");
  });

  it("preview reflects SEO override when typed (override wins)", async () => {
    render(
      <CollectionForm
        collection={collectionStub()}
        seo={{ title: "Custom SEO title", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(previewSeoAction).toHaveBeenCalled();
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    const overrides = call.overrides as { title: string };
    expect(overrides.title).toBe("Custom SEO title");
  });
});
