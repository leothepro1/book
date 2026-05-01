/**
 * AccommodationCategoryForm — SearchListingEditor integration
 * tests (M6.6). Mirrors CollectionForm.seo.test.tsx structurally.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  createAccommodationCategory: vi.fn(),
  updateAccommodationCategory: vi.fn(),
  updateAccommodationCategoryAddons: vi.fn().mockResolvedValue({ ok: true }),
  searchAccommodations: vi.fn().mockResolvedValue([]),
  searchProductCollections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/(admin)/_lib/seo/previewAction", () => ({
  previewSeoAction: vi.fn().mockResolvedValue({
    ok: true,
    preview: {
      title: "Stugor | Apelviken",
      description: "Fristående boenden.",
      canonicalUrl: "https://apelviken-x.rutgr.com/stays/categories/stugor",
      displayUrl: "apelviken-x.rutgr.com › stays › categories › stugor",
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

import {
  createAccommodationCategory,
  updateAccommodationCategory,
} from "../actions";
import { previewSeoAction } from "@/app/(admin)/_lib/seo/previewAction";

import AccommodationCategoryForm from "./AccommodationCategoryForm";

// ── Fixtures ──────────────────────────────────────────────────

type ExistingCategoryStub = Parameters<
  typeof AccommodationCategoryForm
>[0]["category"];

function categoryStub(): ExistingCategoryStub {
  return {
    id: "cat_1",
    title: "Stugor",
    description: "Fristående boenden.",
    slug: "stugor",
    imageUrl: null,
    status: "ACTIVE",
    visibleInSearch: true,
    version: 1,
    items: [],
  };
}

const initialPreview = {
  title: "Stugor | Apelviken",
  description: "Fristående boenden.",
  canonicalUrl: "https://apelviken-x.rutgr.com/stays/categories/stugor",
  displayUrl: "apelviken-x.rutgr.com › stays › categories › stugor",
  ogImageUrl: null,
  faviconUrl: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createAccommodationCategory).mockReset();
  vi.mocked(createAccommodationCategory).mockResolvedValue({
    ok: true,
    data: { id: "cat_new", slug: "new-category" },
  });
  vi.mocked(updateAccommodationCategory).mockReset();
  vi.mocked(updateAccommodationCategory).mockResolvedValue({
    ok: true,
    data: { id: "cat_1", slug: "stugor", version: 2 },
  });
  vi.mocked(previewSeoAction).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────

describe("AccommodationCategoryForm — /[id] edit path", () => {
  it("renders Sökmotorlistning with initialPreview + seo prop", () => {
    render(
      <AccommodationCategoryForm
        category={categoryStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    expect(screen.getByText("Stugor | Apelviken")).not.toBeNull();
  });

  it("populates edit panel from seo prop (USER mode)", () => {
    render(
      <AccommodationCategoryForm
        category={categoryStub()}
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Stored titel");
  });

  it("includes seo in updateAccommodationCategory payload when edited", async () => {
    render(
      <AccommodationCategoryForm
        category={categoryStub()}
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

    expect(updateAccommodationCategory).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(updateAccommodationCategory).mock.calls[0];
    expect(payload.seo).toEqual({
      title: "Ny SEO-titel",
      description: "",
      noindex: false,
    });
  });
});

describe("AccommodationCategoryForm — /new create path", () => {
  it("renders with placeholder slug + empty seo", () => {
    render(<AccommodationCategoryForm initialPreview={initialPreview} />);
    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("URL-användarnamn") as HTMLInputElement).value,
    ).toBe("ny-boendekategori");
  });

  it("includes seo in createAccommodationCategory save payload", async () => {
    render(<AccommodationCategoryForm initialPreview={initialPreview} />);

    fireEvent.change(
      screen.getByPlaceholderText("T.ex. Premium stugor"),
      { target: { value: "Min nya boendetyp" } },
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, {
      target: { value: "SEO-titel för ny boendetyp" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(createAccommodationCategory).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(createAccommodationCategory).mock.calls[0];
    expect(payload.seo).toMatchObject({
      title: "SEO-titel för ny boendetyp",
    });
  });
});

describe("AccommodationCategoryForm — compose-at-parent", () => {
  it("preview reflects parent title when seoState is empty", async () => {
    render(
      <AccommodationCategoryForm
        category={categoryStub()}
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // M6.4 — editor sends `overrides` (raw user input, empty here) and
    // `entityFields` (parent fields) separately. Server composes.
    expect(previewSeoAction).toHaveBeenCalled();
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    const entityFields = call.entityFields as { title: string };
    expect(entityFields.title).toBe("Stugor");
  });

  it("preview reflects SEO override when set (override wins)", async () => {
    render(
      <AccommodationCategoryForm
        category={categoryStub()}
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
