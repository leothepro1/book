/**
 * Element Renderer — Maps element types to guest portal components.
 *
 * Strict contract: receives fully resolved, validated ResolvedElement.
 * Wraps ALL elements in ElementLinkWrapper for global click behavior.
 */

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { HeadingElement } from "./HeadingElement";
import { TextElement } from "./TextElement";
import { ButtonElement } from "./ButtonElement";
import { ImageElement } from "./ImageElement";
import { DividerElement } from "./DividerElement";
import { IconElement } from "./IconElement";
import { RichTextElement } from "./RichTextElement";
import { CollapsibleElement } from "./CollapsibleElement";
import { MapElement } from "./MapElement";
import { VideoElement } from "./VideoElement";
import { GalleryElement } from "./GalleryElement";
import { MenuElement } from "./MenuElement";
import { LogoElement } from "./LogoElement";
import { ElementLinkWrapper } from "./ElementLinkWrapper";

const ELEMENT_RENDERERS: Record<string, React.ComponentType<{ resolved: ResolvedElement }>> = {
  heading: HeadingElement,
  text: TextElement,
  button: ButtonElement,
  image: ImageElement,
  divider: DividerElement,
  icon: IconElement,
  richtext: RichTextElement,
  collapsible: CollapsibleElement,
  map: MapElement,
  video: VideoElement,
  gallery: GalleryElement,
  menu: MenuElement,
  logo: LogoElement,
};

export function ElementRenderer({ resolved }: { resolved: ResolvedElement }) {
  const Component = ELEMENT_RENDERERS[resolved.element.type];
  if (!Component) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[ElementRenderer] No renderer for element type "${resolved.element.type}"`);
    }
    return null;
  }

  const pt = (resolved.settings.paddingTop as number) || 0;
  const pr = (resolved.settings.paddingRight as number) || 0;
  const pb = (resolved.settings.paddingBottom as number) || 0;
  const pl = (resolved.settings.paddingLeft as number) || 0;
  const hasSpacing = pt > 0 || pr > 0 || pb > 0 || pl > 0;

  const content = (
    <ElementLinkWrapper resolved={resolved}>
      <Component resolved={resolved} />
    </ElementLinkWrapper>
  );

  if (!hasSpacing) {
    return (
      <div data-element-id={resolved.element.id}>
        {content}
      </div>
    );
  }

  return (
    <div data-element-id={resolved.element.id} style={{ padding: `${pt}px ${pr}px ${pb}px ${pl}px` }}>
      {content}
    </div>
  );
}
