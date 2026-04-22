import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("../../../_lib/logger", () => ({ log: vi.fn() }));

import type { StructuredDataObject } from "@/app/_lib/seo/types";

import { StructuredData } from "./StructuredData";

function obj(extra: Record<string, unknown> = {}): StructuredDataObject {
  return {
    "@context": "https://schema.org",
    "@type": "Thing",
    ...extra,
  };
}

describe("StructuredData", () => {
  it("renders nothing for an empty data array", () => {
    const html = renderToStaticMarkup(<StructuredData data={[]} />);
    expect(html).toBe("");
  });

  it("renders one <script> per object", () => {
    const html = renderToStaticMarkup(
      <StructuredData
        data={[obj({ name: "A" }), obj({ "@type": "Organization", name: "B" })]}
      />,
    );
    const count = (html.match(/<script /g) ?? []).length;
    expect(count).toBe(2);
  });

  it('emits type="application/ld+json"', () => {
    const html = renderToStaticMarkup(
      <StructuredData data={[obj({ name: "A" })]} />,
    );
    expect(html).toContain('type="application/ld+json"');
  });

  it("output does NOT contain a raw break-out `</script>` even when a value does", () => {
    const html = renderToStaticMarkup(
      <StructuredData
        data={[obj({ description: "Evil </script><img src=x>" })]}
      />,
    );
    // React escapes nothing inside dangerouslySetInnerHTML, so the only
    // protection is our stringifier. The payload's `<` is escaped to
    // `<`; the `>` stays literal (harmless — HTML only recognizes
    // `</tag>` from the opening `<`). Net effect: no premature close.
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("\\u003cimg");
  });

  it("skips objects where stringifyJsonLd returned empty", () => {
    // A circular ref produces "" from stringifyJsonLd → no <script>.
    const circular: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Thing",
    };
    circular.self = circular;
    const html = renderToStaticMarkup(
      <StructuredData
        data={[circular as StructuredDataObject, obj({ name: "Fine" })]}
      />,
    );
    // Exactly one script (the valid one); the circular object was skipped.
    expect((html.match(/<script /g) ?? []).length).toBe(1);
    expect(html).toContain("Fine");
  });
});
