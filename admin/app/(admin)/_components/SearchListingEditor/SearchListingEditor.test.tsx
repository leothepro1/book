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

/**
 * Helper: when a test doesn't care about the override/value split,
 * treat value as the override too (the pre-M6.4 semantic).
 */
function mirroredValue(title: string, description: string, slug: string) {
  return {
    value: { title, description, slug },
    override: { title, description },
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
    const { value, override } = mirroredValue("", "", "stuga-bjork");
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={value}
        override={override}
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
    const { value, override } = mirroredValue("", "", "stuga-bjork");
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={value}
        override={override}
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
    const { value, override } = mirroredValue("", "", "stuga-bjork");
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={value}
        override={override}
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
  it("populates title + description from the override prop in edit mode", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Existing title",
          description: "Existing description",
          slug: "stuga-bjork",
        }}
        override={{
          title: "Existing title",
          description: "Existing description",
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
        override={{
          title: "Old",
          description: "Keep this description",
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
        override={{
          title: "Keep this title",
          description: "Old",
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
    const { value, override } = mirroredValue("", "", "stuga-bjork");
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={value}
        override={override}
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
  it("renders counters inside the edit panel measuring the override", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={{
          title: "Hej!",
          description: "Välkommen",
          slug: "stuga-bjork",
        }}
        override={{
          title: "Hej!",
          description: "Välkommen",
        }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));

    expect(screen.getByText("4 av 70 tecken använda")).not.toBeNull();
    expect(screen.getByText("9 av 160 tecken använda")).not.toBeNull();
  });

  it("counters count override.title, NOT composed value.title", () => {
    // The merchant hasn't typed an override yet; the parent form's
    // title ("Produkttitel") is being used as the composed fallback.
    // Counter should still read 0 — merchants shouldn't see a "too
    // long!" flag just because the parent's product title is long.
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Produkttitel",
          description: "Produktbeskrivning",
          slug: "produkt",
        }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));

    expect(screen.getByText("0 av 70 tecken använda")).not.toBeNull();
    expect(screen.getByText("0 av 160 tecken använda")).not.toBeNull();
  });
});

describe("SearchListingEditor — debounced preview refresh", () => {
  it("calls previewSeoAction once after the debounce window settles", async () => {
    const { value, override } = mirroredValue(
      "Titel",
      "Beskrivning",
      "stuga-bjork",
    );
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={value}
        override={override}
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
    const firstPass = mirroredValue("Ti", "", "stuga-bjork");
    const { rerender } = render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        value={firstPass.value}
        override={firstPass.override}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    // Rapid successive re-renders with different values — simulating
    // keystrokes every 50ms.
    for (let i = 0; i < 5; i++) {
      const pass = mirroredValue(`Titel${i}`, "", "stuga-bjork");
      rerender(
        <SearchListingEditor
          resourceType="accommodation"
          entityId="acc_1"
          value={pass.value}
          override={pass.override}
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

    // Single settled call after the final keystroke, carrying the
    // composed value — same shape the engine will render.
    expect(previewSeoAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    expect(call.overrides).toEqual({ title: "Titel4", description: "" });
  });
});

describe("SearchListingEditor — entityId=null (/new flow)", () => {
  it("renders without error and forwards entityId=null to previewSeoAction", async () => {
    const { value, override } = mirroredValue("", "", "ny-produkt");
    render(
      <SearchListingEditor
        resourceType="product"
        entityId={null}
        value={value}
        override={override}
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

// ── M6.4: value/override split + placeholder behaviour ────────

describe("SearchListingEditor — value/override split", () => {
  it("input binds to override.title, not value.title", () => {
    // When override is empty but value (composed) is filled, the
    // input itself must be empty — merchant hasn't overridden yet.
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Parent title",
          description: "Parent description",
          slug: "prod-1",
        }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    const descInput = screen.getByLabelText(
      "Metabeskrivning",
    ) as HTMLTextAreaElement;
    expect(titleInput.value).toBe("");
    expect(descInput.value).toBe("");
  });

  it("placeholder shows value.title (composed) when override is empty", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Frukost-buffé",
          description: "Morgonens vackraste ritual.",
          slug: "frukost-buffe",
        }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    const descInput = screen.getByLabelText(
      "Metabeskrivning",
    ) as HTMLTextAreaElement;
    expect(titleInput.placeholder).toBe("Frukost-buffé");
    expect(descInput.placeholder).toBe("Morgonens vackraste ritual.");
  });

  it("placeholder falls back to static label when both override and value are empty", () => {
    // /new before typing: no override, no parent title. The editor
    // shows a resource-specific hint instead of a blank input.
    render(
      <SearchListingEditor
        resourceType="product"
        entityId={null}
        value={{ title: "", description: "", slug: "ny-produkt" }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    const descInput = screen.getByLabelText(
      "Metabeskrivning",
    ) as HTMLTextAreaElement;
    expect(titleInput.placeholder).toBe("Använd produkttiteln");
    expect(descInput.placeholder).toBe("Använd produktbeskrivningen");
  });

  it("per-resource fallback labels pick the right Swedish copy per type", () => {
    // Spot-check accommodation_category — distinct label set.
    render(
      <SearchListingEditor
        resourceType="accommodation_category"
        entityId={null}
        value={{ title: "", description: "", slug: "ny-boendekategori" }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    expect(titleInput.placeholder).toBe("Använd kategorinamnet");
  });

  it("onChange emits what the merchant typed, never the composed value", () => {
    // When the parent passes a rich composed `value` but empty
    // `override`, onChange must carry the merchant's keystrokes in
    // isolation — the save path must not accidentally persist the
    // parent title as a "merchant override."
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Parent title",
          description: "Parent description",
          slug: "prod-1",
        }}
        override={{ title: "", description: "" }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    fireEvent.change(screen.getByLabelText("Sidrubrik"), {
      target: { value: "Merchant typed" },
    });

    expect(onChange).toHaveBeenCalledWith({
      title: "Merchant typed",
      description: "", // override.description — NOT "Parent description"
    });
  });

  it("preview renders the composed value, not the raw override", () => {
    // Override empty; composed value has the parent title. The
    // preview card (SearchListingPreview) should show the composed
    // title so merchants see "what Google will render" even when the
    // override field is untouched.
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Parent title | Apelviken",
          description: "Parent description.",
          slug: "prod-1",
        }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
        initialPreview={{
          title: "Parent title | Apelviken",
          description: "Parent description.",
          displayUrl: "apelviken.rutgr.com › shop › products › prod-1",
          faviconUrl: null,
        }}
      />,
    );

    expect(screen.getByText("Parent title | Apelviken")).not.toBeNull();
    expect(screen.getByText("Parent description.")).not.toBeNull();
  });

  it("debounced refresh runs against composed value (live preview as parent types)", async () => {
    // Simulate the parent form re-rendering with a new composed
    // value as the merchant types in the entity title field. The
    // editor must re-trigger the debounce and call previewSeoAction
    // with the composed title — this is the "live preview" signal.
    const firstPass = { title: "Prod", description: "Desc", slug: "prod-1" };
    const { rerender } = render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={firstPass}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    rerender(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Product title typed", description: "Desc", slug: "prod-1" }}
        override={{ title: "", description: "" }}
        onChange={() => {}}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(previewSeoAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    expect(call.overrides).toEqual({
      title: "Product title typed",
      description: "Desc",
    });
  });
});
