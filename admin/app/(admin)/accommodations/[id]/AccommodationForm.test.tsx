/**
 * AccommodationForm — SearchListingEditor integration tests
 * ═════════════════════════════════════════════════════════
 *
 * Focused on the Batch 2 wire-in: verifies the form renders the
 * SearchListingEditor with the expected initial values, propagates
 * edits into local state, and carries the seo payload through to
 * `updateAccommodation` on save. Other form surfaces (capacity,
 * facilities, media) are out of scope for this test file.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module-boundary mocks ────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  updateAccommodation: vi.fn(),
}));

vi.mock("@/app/(admin)/accommodation-categories/actions", () => ({
  listAccommodationCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/(admin)/_lib/seo/previewAction", () => ({
  previewSeoAction: vi.fn().mockResolvedValue({
    ok: true,
    preview: {
      title: "Stuga Björk | Apelviken",
      description: "En mysig stuga vid havet.",
      canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
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

import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";

import { updateAccommodation } from "../actions";
import { previewSeoAction } from "@/app/(admin)/_lib/seo/previewAction";

import AccommodationForm from "./AccommodationForm";

// ── Fixtures ──────────────────────────────────────────────────

function accommodationStub(): ResolvedAccommodation {
  return {
    id: "acc_1",
    tenantId: "tenant_t",
    slug: "stuga-bjork",
    externalId: null,
    externalCode: null,
    pmsProvider: null,
    displayName: "Stuga Björk",
    displayDescription: "En mysig stuga vid havet.",
    accommodationType: "CABIN",
    status: "ACTIVE",
    maxGuests: 4,
    minGuests: 1,
    defaultGuests: 2,
    maxAdults: null,
    minAdults: null,
    maxChildren: null,
    minChildren: null,
    extraBeds: 0,
    roomSizeSqm: 30,
    bedrooms: 2,
    bathrooms: 1,
    basePricePerNight: 120000,
    currency: "SEK",
    taxRate: 1200,
    totalUnits: 1,
    baseAvailability: 1,
    facilities: [],
    bedConfigs: [],
    ratePlans: [],
    restrictions: [],
    media: [],
    highlights: [],
    units: [],
    categoryIds: [],
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  } as unknown as ResolvedAccommodation;
}

const initialPreview = {
  title: "Stuga Björk | Apelviken",
  description: "En mysig stuga vid havet.",
  canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
  displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
  ogImageUrl: null,
  faviconUrl: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(updateAccommodation).mockReset();
  vi.mocked(updateAccommodation).mockResolvedValue({
    ok: true,
    data: { id: "acc_1" },
  });
  vi.mocked(previewSeoAction).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────

describe("AccommodationForm — SearchListingEditor integration", () => {
  it("renders the Sökmotorlistning card seeded with the initialPreview", () => {
    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );

    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    // Preview row from initialPreview is present on first paint —
    // no flash of empty content.
    expect(screen.getByText("Stuga Björk | Apelviken")).not.toBeNull();
  });

  it("populates the edit panel inputs from the `seo` prop", () => {
    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
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

  it("submits the seo payload when the user edits and saves", async () => {
    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
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

    // Drain the SearchListingEditor debounce timer so it doesn't
    // trip over our fake clock on unmount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(updateAccommodation).toHaveBeenCalledTimes(1);
    const call = vi.mocked(updateAccommodation).mock.calls[0];
    expect(call[0]).toBe("acc_1");
    expect(call[1].seo).toEqual({
      title: "Ny SEO-titel",
      description: "Ny SEO-beskrivning",
      noindex: false,
    });
  });

  it("carries the initial seo values through to save when no edits are made", async () => {
    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
        seo={{ title: "Stored titel", description: "Stored beskrivning" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByLabelText("save"));
    });

    expect(updateAccommodation).toHaveBeenCalledTimes(1);
    const call = vi.mocked(updateAccommodation).mock.calls[0];
    expect(call[1].seo).toEqual({
      title: "Stored titel",
      description: "Stored beskrivning",
      noindex: false,
    });
  });
});

// ── M6.4: compose-at-parent behaviour ─────────────────────────

describe("AccommodationForm — compose-at-parent (M6.4)", () => {
  it("preview reflects parent accommodation name when seoState.title is empty", async () => {
    vi.mocked(previewSeoAction).mockResolvedValue({
      ok: true as const,
      preview: {
        title: "Stuga Björk | Apelviken",
        description: "En mysig stuga vid havet.",
        canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
        displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
        ogImageUrl: null,
        faviconUrl: null,
      },
    });

    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
        seo={{ title: "", description: "" }}
        initialPreview={initialPreview}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // M6.4 — editor sends `overrides` (raw user input, empty here)
    // and `entityFields` (parent fields) separately. Server composes.
    // Parent accommodation's displayName arrives via entityFields.
    expect(previewSeoAction).toHaveBeenCalled();
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    const entityFields = call.entityFields as { title: string };
    expect(entityFields.title).toBe("Stuga Björk");
  });

  it("preview reflects SEO override when typed (override wins over parent)", async () => {
    vi.mocked(previewSeoAction).mockResolvedValue({
      ok: true as const,
      preview: {
        title: "Custom SEO title",
        description: "",
        canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
        displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
        ogImageUrl: null,
        faviconUrl: null,
      },
    });

    render(
      <AccommodationForm
        accommodation={accommodationStub()}
        tenantId="tenant_t"
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
