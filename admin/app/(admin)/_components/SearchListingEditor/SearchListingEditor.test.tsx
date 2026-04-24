/**
 * Tests for SearchListingEditor.
 *
 * Mocks the server action (`previewSeoAction`) so the debounced
 * refresh is controllable + assertable. `vi.useFakeTimers()` drives
 * the 300ms debounce in-test.
 *
 * ── M6.5 context ────────────────────────────────────────────────
 * Every test passes `parentTitle` + `parentDescription` — the raw
 * parent-form values that drive AUTO-mode rendering. When the test
 * doesn't care about the auto/user split, `parentTitle ===
 * override.title` and `parentDescription === override.description`,
 * which keeps behaviour identical to the M6.4 semantics.
 *
 * Dedicated describe blocks at the bottom exercise the M6.5
 * auto-follow transitions.
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
 * Helper: spread this onto <SearchListingEditor /> when the test
 * doesn't care about the auto/user/override distinction — all three
 * carry the same value so behaviour is identical to pre-M6.5.
 */
function mirroredProps(title: string, description: string, slug: string) {
  return {
    value: { title, description, slug },
    override: { title, description },
    parentTitle: title,
    parentDescription: description,
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
        {...mirroredProps("", "", "stuga-bjork")}
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
        {...mirroredProps("", "", "stuga-bjork")}
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
        {...mirroredProps("", "", "stuga-bjork")}
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

describe("SearchListingEditor — URL input", () => {
  it("read-only with the M11-deferral tooltip", () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        {...mirroredProps("", "", "stuga-bjork")}
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

describe("SearchListingEditor — debounced preview refresh", () => {
  it("calls previewSeoAction once after the debounce window settles", async () => {
    render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        {...mirroredProps("Titel", "Beskrivning", "stuga-bjork")}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(previewSeoAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(previewSeoAction).toHaveBeenCalledTimes(1);
  });

  it("collapses rapid successive re-renders into a single server call", async () => {
    const first = mirroredProps("Ti", "", "stuga-bjork");
    const { rerender } = render(
      <SearchListingEditor
        resourceType="accommodation"
        entityId="acc_1"
        {...first}
        onChange={() => {}}
        initialPreview={initialPreviewStub()}
      />,
    );

    for (let i = 0; i < 5; i++) {
      const pass = mirroredProps(`Titel${i}`, "", "stuga-bjork");
      rerender(
        <SearchListingEditor
          resourceType="accommodation"
          entityId="acc_1"
          {...pass}
          onChange={() => {}}
          initialPreview={initialPreviewStub()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }

    expect(previewSeoAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

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
        {...mirroredProps("", "", "ny-produkt")}
        onChange={() => {}}
        initialPreview={{
          title: "Ny produkt | Apelviken",
          description: "",
          displayUrl: "apelviken-x.rutgr.com › shop › products › ny-produkt",
          faviconUrl: null,
        }}
      />,
    );

    expect(screen.getByText("Sökmotorlistning")).not.toBeNull();
    expect(screen.getByText("Ny produkt | Apelviken")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(previewSeoAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(previewSeoAction).mock.calls[0][0];
    expect(call.entityId).toBeNull();
    expect(call.resourceType).toBe("product");
  });
});

// ── M6.5: genuine auto-follow ─────────────────────────────────

describe("SearchListingEditor — auto-follow mount state", () => {
  it("starts in AUTO mode when override.title is empty — input shows parentTitle", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Frukost-buffé",
          description: "desc",
          slug: "frukost-buffe",
        }}
        override={{ title: "", description: "" }}
        parentTitle="Frukost-buffé"
        parentDescription="desc"
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    expect(titleInput.value).toBe("Frukost-buffé");
  });

  it("starts in USER mode when override.title is set — input shows override", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Merchant override",
          description: "",
          slug: "p",
        }}
        override={{ title: "Merchant override", description: "" }}
        parentTitle="Parent title"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    expect(titleInput.value).toBe("Merchant override");
  });
});

describe("SearchListingEditor — auto-follow transitions", () => {
  it("focusing the field in AUTO mode seeds draft from parent — input still shows parent value", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Frukost-buffé",
          description: "",
          slug: "p",
        }}
        override={{ title: "", description: "" }}
        parentTitle="Frukost-buffé"
        parentDescription=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);

    // Input still shows parent value — focus alone doesn't change
    // the visible content.
    expect(titleInput.value).toBe("Frukost-buffé");
    // Focus doesn't emit — only typing does. This matters because
    // merely tabbing into the field shouldn't dirty the form.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typing in AUTO-focused field emits onChange with the typed value", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "Frukost-buffé",
          description: "",
          slug: "p",
        }}
        override={{ title: "", description: "" }}
        parentTitle="Frukost-buffé"
        parentDescription=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, { target: { value: "Merchant custom" } });

    expect(onChange).toHaveBeenCalledWith({
      title: "Merchant custom",
      description: "",
    });
    expect(titleInput.value).toBe("Merchant custom");
  });

  it("clearing field + blurring returns to AUTO mode and emits empty string", () => {
    const onChange = vi.fn();
    // Start in USER mode with an existing override so we can observe
    // the transition back to AUTO.
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Existing", description: "", slug: "p" }}
        override={{ title: "Existing", description: "" }}
        parentTitle="Parent"
        parentDescription=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;

    // Merchant clears the field.
    fireEvent.change(titleInput, { target: { value: "" } });
    // Then blurs.
    fireEvent.blur(titleInput);

    // onChange received the final empty string so the parent's
    // seoState reflects "no override active".
    expect(onChange).toHaveBeenLastCalledWith({
      title: "",
      description: "",
    });
    // Input re-reads from parentTitle — AUTO is back.
    expect(titleInput.value).toBe("Parent");
  });

  it("blur with whitespace-only draft also returns to AUTO mode", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Existing", description: "", slug: "p" }}
        override={{ title: "Existing", description: "" }}
        parentTitle="Parent title"
        parentDescription=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.blur(titleInput);

    // The trim-based check treats whitespace as empty.
    expect(onChange).toHaveBeenLastCalledWith({
      title: "",
      description: "",
    });
    expect(titleInput.value).toBe("Parent title");
  });
});

describe("SearchListingEditor — parent prop flow", () => {
  it("parent title change propagates to the input in AUTO mode", () => {
    const { rerender } = render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Old parent", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="Old parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Old parent");

    // Simulate the parent form re-rendering with a new title as the
    // merchant types in the entity's main title field.
    rerender(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "New parent typed", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="New parent typed"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    // AUTO mode reads from the new parentTitle directly.
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("New parent typed");
  });

  it("parent title change does NOT stomp the user's draft in USER mode", () => {
    const { rerender } = render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Draft text", description: "", slug: "p" }}
        override={{ title: "Draft text", description: "" }}
        parentTitle="Old parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    expect(titleInput.value).toBe("Draft text");

    // Merchant types something in progress, modifying the draft.
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, { target: { value: "In-flight edit" } });

    // Parent re-renders with a new parent title (merchant also
    // edited the main title field) — override unchanged.
    rerender(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "In-flight edit", description: "", slug: "p" }}
        override={{ title: "In-flight edit", description: "" }}
        parentTitle="Completely different parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    // User's in-flight draft survives — parent title didn't clobber.
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("In-flight edit");
  });

  it("override prop change re-syncs local state (save/reload scenario)", () => {
    const { rerender } = render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Original", description: "", slug: "p" }}
        override={{ title: "Original", description: "" }}
        parentTitle="Parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Original");

    // Parent reloads with a different persisted override (e.g.
    // after a save roundtrip landed updated data).
    rerender(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Reloaded from DB", description: "", slug: "p" }}
        override={{ title: "Reloaded from DB", description: "" }}
        parentTitle="Parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Reloaded from DB");
  });

  it("override cleared by parent (undefined → \"\") transitions to AUTO", () => {
    const { rerender } = render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Old override", description: "", slug: "p" }}
        override={{ title: "Old override", description: "" }}
        parentTitle="Parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Old override");

    // Parent wipes the override (e.g. discard after unsaved change).
    rerender(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Parent", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="Parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    // Back to AUTO — input shows parent value again.
    expect(
      (screen.getByLabelText("Sidrubrik") as HTMLInputElement).value,
    ).toBe("Parent");
  });
});

describe("SearchListingEditor — character counters with auto-follow", () => {
  it("counter measures parentTitle in AUTO mode", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Produkttitel", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="Produkttitel"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    // "Produkttitel" = 12 chars; counter reflects what Google sees.
    expect(screen.getByText("12 av 70 tecken använda")).not.toBeNull();
  });

  it("counter measures draft in USER mode", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Hej", description: "", slug: "p" }}
        override={{ title: "Hej", description: "" }}
        parentTitle="Any"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    // Draft ("Hej") wins over parent ("Any").
    expect(screen.getByText("3 av 70 tecken använda")).not.toBeNull();
  });
});

describe("SearchListingEditor — placeholder under auto-follow", () => {
  it("no placeholder in AUTO mode (the input already shows parent value)", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Real parent", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="Real parent"
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    expect(titleInput.placeholder).toBe("");
  });

  it("shows static fallback label when draft AND parent are empty (/new-empty)", () => {
    render(
      <SearchListingEditor
        resourceType="product"
        entityId={null}
        value={{ title: "", description: "", slug: "ny-produkt" }}
        override={{ title: "Temp", description: "Temp" }}
        parentTitle=""
        parentDescription=""
        onChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    // USER mode (override is non-empty → mount picks USER) + clear
    // the draft via change event to reach the "both empty" placeholder
    // branch.
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "" } });
    expect(titleInput.placeholder).toBe("Använd produkttiteln");
  });
});

describe("SearchListingEditor — onChange payload shape", () => {
  it("emits only the merchant-typed override (never the composed parent value)", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{ title: "Parent title", description: "", slug: "p" }}
        override={{ title: "", description: "" }}
        parentTitle="Parent title"
        parentDescription=""
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const titleInput = screen.getByLabelText("Sidrubrik") as HTMLInputElement;
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, { target: { value: "Merchant typed" } });

    expect(onChange).toHaveBeenCalledWith({
      title: "Merchant typed",
      description: "",
    });
  });
});

describe("SearchListingEditor — description field auto-follow", () => {
  it("description field follows the same AUTO→USER→AUTO pattern as title", () => {
    const onChange = vi.fn();
    render(
      <SearchListingEditor
        resourceType="product"
        entityId="prod_1"
        value={{
          title: "",
          description: "Parent description",
          slug: "p",
        }}
        override={{ title: "", description: "" }}
        parentTitle=""
        parentDescription="Parent description"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Redigera sökmotorlistning"));
    const descInput = screen.getByLabelText(
      "Metabeskrivning",
    ) as HTMLTextAreaElement;
    // AUTO mode on mount — shows parent description.
    expect(descInput.value).toBe("Parent description");

    fireEvent.focus(descInput);
    fireEvent.change(descInput, { target: { value: "Custom description" } });
    expect(onChange).toHaveBeenLastCalledWith({
      title: "",
      description: "Custom description",
    });

    // Clear + blur → back to AUTO, emit empty string.
    fireEvent.change(descInput, { target: { value: "" } });
    fireEvent.blur(descInput);
    expect(onChange).toHaveBeenLastCalledWith({
      title: "",
      description: "",
    });
    expect(descInput.value).toBe("Parent description");
  });
});
