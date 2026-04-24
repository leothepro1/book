import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SearchListingPreview } from "./SearchListingPreview";

describe("SearchListingPreview", () => {
  it("renders title, derived site name, breadcrumb URL, and description", () => {
    render(
      <SearchListingPreview
        title="Stuga Björk | Apelviken"
        displayUrl="apelviken-x.rutgr.com › stays › stuga-bjork"
        description="En mysig stuga vid havet."
        faviconUrl={null}
      />,
    );

    expect(
      screen.getByText("Stuga Björk | Apelviken"),
    ).not.toBeNull();
    // Site name derived from the host's first domain segment,
    // capitalised.
    expect(screen.getByText("Apelviken-x")).not.toBeNull();
    expect(
      screen.getByText("apelviken-x.rutgr.com › stays › stuga-bjork"),
    ).not.toBeNull();
    expect(
      screen.getByText("En mysig stuga vid havet."),
    ).not.toBeNull();
  });

  it("omits the price row when `price` is undefined", () => {
    const { container } = render(
      <SearchListingPreview
        title="Stuga"
        displayUrl="apelviken-x.rutgr.com › stays › stuga"
        description="Beskrivning."
        faviconUrl={null}
      />,
    );
    expect(container.querySelector(".slp__price")).toBeNull();
  });

  it("omits the price row when `price` is null", () => {
    const { container } = render(
      <SearchListingPreview
        title="Stuga"
        displayUrl="apelviken-x.rutgr.com › stays › stuga"
        description="Beskrivning."
        faviconUrl={null}
        price={null}
      />,
    );
    expect(container.querySelector(".slp__price")).toBeNull();
  });

  it("renders the price row when `price` is provided", () => {
    render(
      <SearchListingPreview
        title="Frukost-buffé"
        displayUrl="apelviken-x.rutgr.com › shop › products › frukost-buffe"
        description="Morgonens vackraste ritual."
        faviconUrl={null}
        price="149,00 SEK"
      />,
    );
    expect(screen.getByText("149,00 SEK")).not.toBeNull();
  });

  it("uses the merchant-supplied faviconUrl via an <img>", () => {
    const { container } = render(
      <SearchListingPreview
        title="Titel"
        displayUrl="apelviken-x.rutgr.com"
        description=""
        faviconUrl="https://cdn.example.com/favicon.png"
      />,
    );
    const img = container.querySelector<HTMLImageElement>("img.slp__favicon");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(
      "https://cdn.example.com/favicon.png",
    );
  });

  it("renders the inline platform-default SVG when faviconUrl is null", () => {
    const { container } = render(
      <SearchListingPreview
        title="Titel"
        displayUrl="apelviken-x.rutgr.com"
        description=""
        faviconUrl={null}
      />,
    );
    // SVG path present, no <img> tag.
    expect(container.querySelector("svg.slp__favicon")).not.toBeNull();
    expect(container.querySelector("img.slp__favicon")).toBeNull();
  });

  it("falls back to the platform-default SVG when the <img> onError fires", () => {
    const { container } = render(
      <SearchListingPreview
        title="Titel"
        displayUrl="apelviken-x.rutgr.com"
        description=""
        faviconUrl="https://cdn.example.com/broken.png"
      />,
    );
    const img = container.querySelector<HTMLImageElement>("img.slp__favicon");
    expect(img).not.toBeNull();
    if (!img) return;
    // Simulate the browser firing `error` after the URL 404s.
    fireEvent.error(img);
    // Now the SVG fallback should be on-screen in place of the img.
    expect(container.querySelector("svg.slp__favicon")).not.toBeNull();
    expect(container.querySelector("img.slp__favicon")).toBeNull();
  });
});
