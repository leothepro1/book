/**
 * Tests for SearchListingEditor.
 *
 * Mocks the server action (`previewSeoAction`) so the debounced
 * refresh is controllable + assertable. `vi.useFakeTimers()` drives
 * the 300ms debounce in-test.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_lib/seo/previewAction", () => ({
  previewSeoAction: vi.fn(),
}));

import { previewSeoAction } from "../../_lib/seo/previewAction";

import { SearchListingEditor } from "./SearchListingEditor";

// ── Fixtures ──────────────────────────────────────────────────

function initialPreviewStub() {
  return {
    title: "Stuga Björk | Apelviken",
    description: "En mysig stuga vid havet.",
    displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
    faviconUrl: null,
  };
}

function actionStub() {
  return {
    ok: true as const,
    preview: {
      title: "Stuga Björk | Apelviken",
      description: "En mysig stuga vid havet.",
      canonicalUrl: "https://apelviken-x.rutgr.com/stays/stuga-bjork",
      displayUrl: "apelviken-x.rutgr.com › stays › stuga-bjork",
      ogImageUrl: null,
      faviconUrl: null,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(previewSeoAction).mockReset();
  vi.mocked(previewSeoAction).mockResolvedValue(actionStub());
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────

describe("SearchListingEditor — pre-edit state", () => {
  it("renders the preview + pencil button, no inputs visible", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "", description: "", slug: "stuga-bjork" }}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    expect(
      screen.getByLabelText("Redigera sökmotorlistning"),
    ).not.toBeNull();
    expect(screen.queryByLabelText("Sidrubrik")).toBeNull();
    expect(screen.queryByLabelText("Metabeskrivning")).toBeNull();
  });

  it("uses initialPreview values to avoid flash of empty content", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "", description: "", slug: "stuga-bjork" }}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    expect(screen.getByText("Stuga Björk | Apelviken")).not.toBeNull();
    expect(screen.getByText("En mysig stuga vid havet.")).not.toBeNull();
  });
});

describe("SearchListingEditor — pencil toggle", () => {
  it("pencil click reveals the edit panel and hides the pencil button", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "", description: "", slug: "stuga-bjork" }}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));

    expect(screen.getByLabelText("Sidrubrik")).not.toBeNull();
    expect(screen.getByLabelText("Metabeskrivning")).not.toBeNull();
    expect(screen.getByLabelText("URL-användarnamn")).not.toBeNull();
    expect(
      screen.queryByLabelText("Redigera sökmotorlistning"),
    ).toBeNull();
  });
});

describe("SearchListingEditor — field interaction", () => {
  it("populates title + description from the value prop in edit mode", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Existing title",
          description: "Existing description",
          slug: "stuga-bjork",
        }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));

    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    const descInput = screen.getByLabelText("Metabeskrivning") as HTMLTextAreaElement;
    expect(titleInput.value).toBe("Existing title");
    expect(descInput.value).toBe("Existing description");
  });

  it("title edit emits onChange with new title and unchanged description", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Old",
          description: "Keep this description",
          slug: "stuga-bjork",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    fireEvent.change(screen.getByLabelText("Sidrubrik"), {
      target: { value: "New" },
    });

    expect(onChange).toHaveBeenCalledWith({
      title: "New",
      description: "Keep this description",
    });
  });

  it("description edit emits onChange with unchanged title and new description", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Keep this title",
          description: "Old",
          slug: "stuga-bjork",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    fireEvent.change(screen.getByLabelText("Metabeskrivning"), {
      target: { value: "New" },
    });

    expect(onChange).toHaveBeenCalledWith({
      title: "Keep this title",
      description: "New",
    });
  });

  it("URL input is read-only with the M11-deferral tooltip", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "", description: "", slug: "stuga-bjork" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const slugInput = screen.getByLabelText(
      "URL-användarnamn",
    ) as HTMLInputElement;
    expect(slugInput.readOnly).toBe(true);
    expect(slugInput.value).toBe("stuga-bjork");
    expect(slugInput.title).toContain("URL-redigering");
  });
});

describe("SearchListingEditor — character counters", () => {
  it("renders counters inside the edit panel", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Hej!",
          description: "Välkommen",
          slug: "stuga-bjork",
        }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));

    expect(screen.getByText("4 av 70 tecken använda")).not.toBeNull();
    expect(screen.getByText("9 av 160 tecken använda")).not.toBeNull();
  });
});

describe("SearchListingEditor — debounced preview refresh", () => {
  it("calls previewSeoAction once after the debounce window settles", async () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "Titel", description: "Beskrivning", slug: "stuga-bjork" }}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    // Debounce timer has NOT fired yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(previewSeoAction).not.toHaveBeenCalled();

    // Past the 300ms window — single call settles.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(previewSeoAction).toHaveBeenCalledTimes(1);
  });

  it("collapses rapid successive re-renders into a single server call", async () => {
    const { rerender } = render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{ title: "Ti", description: "", slug: "stuga-bjork" }}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    // Rapid successive re-renders with different values — simulating
    // keystrokes every 50ms.
    for (let i = 0; i < 5; i++) {
      rerender(
        <SearchListingEditor
          resourceType="accommodation"
          entityId="acc_1"
          value={{
            title: `Titel${i}`,
            description: "",
            slug: "stuga-bjork",
          }}
          onChange={() => {}}
          initialPreview={initialPreviewStub()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }

    // Still within the debounce window — no server call yet.
    expect(previewSeoAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Single settled call after the final keystroke.
    expect(previewSeoAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    expect(call.overrides).toEqual({ title: "Titel4", description: "" });
  });
});

describe("SearchListingEditor — entityId=null (/new flow)", () => {
  it("renders without error and forwards entityId=null to previewSeoAction", async () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId={null}
        value={{ title: "", description: "", slug: "ny-produkt" }}
        onChange={() => {}}
        initialPreview={{
          title: "Ny produkt | Apelviken",
          description: "",
          displayUrl: "apelviken-x.rutgr.com › shop › products › ny-produkt",
          faviconUrl: null,
        }}
      />,
    );

    // Component renders cleanly with the placeholder preview.
    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    expect(screen.getByText("Ny produkt | Apelviken")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Debounced refresh fired with entityId=null intact — the
    // widening flows all the way from props → refreshPreview →
    // previewSeoAction.
    expect(previewSeoAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    expect(call.entityId).toBeNull();
    expect(call.resourceType).toBe("product");
  });
});
