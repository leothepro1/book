/**
 * Card-type registry
 * ------------------
 * Each CardTypeKey maps to a config that controls:
 *   - which admin panel buttons are shown (with optional icon overrides)
 *   - which layout options are available (2-3 per card type)
 *   - metadata (label, icon, colors) for the add-card modal
 *   - how an empty card is created
 *   - how the guest resolves hrefs and renders each layout
 *   - whether the card can be placed inside a category
 *
 * To add a new card type:
 *   1. Add the key to the CardTypeKey union
 *   2. Add an entry in CARD_TYPE_REGISTRY with its layouts
 *   3. Register guest renderers for each layout key in LooseCardItem
 */

import type { ReactNode } from "react";
import type { Card } from "@/app/(guest)/_lib/portal/homeLinks";

export type CardTypeKey = "link" | "text" | "header" | "document" | "faq" | "email" | "phone" | "contact";

/** Panel keys that can appear in the admin card row */
export type PanelKey = "layout" | "image" | "badge" | "schedule" | "delete";

/** A layout option available for a card type */
export type LayoutOption = {
  key: string;
  label: string;
  description: string;
  /** Preview image URL shown in the admin layout picker */
  previewImage: string;
  /** Whether this layout requires an image to look right */
  needsImage?: boolean;
  /**
   * Guest renderer key — looked up in the GUEST_LAYOUT_RENDERERS map.
   * If omitted, falls back to the built-in rendering path
   * (classic/featured/showcase).
   */
  guestRenderer?: string;
};

export type CardTypeConfig = {
  key: CardTypeKey;
  label: string;
  description: string;
  /** Which panel buttons to show in admin (order matters) */
  adminPanels: PanelKey[];
  /** Layout options for this card type (min 2, max 3) — first is the default */
  layouts: LayoutOption[];
  /** Icon shown in the add-card modal type picker */
  icon: ReactNode;
  /** Background color for the icon in the type picker */
  iconBg: string;
  /** Foreground color for the icon */
  iconColor: string;
  /** Creates an empty card of this type with the given sortOrder */
  createEmpty: (sortOrder: number) => Card;
  /** Whether this card type can be placed inside a category (default: true) */
  categoryFriendly?: boolean;
  /** Resolve the sub-text shown in the admin card row (e.g. URL, file path) */
  adminSubText?: (card: Card) => string;
  /** Placeholder shown in the admin sub-row input when empty (default: "URL") */
  adminSubPlaceholder?: string;
  /** Whether to show the editable sub-row (URL/file) in the admin card. Default true. */
  showAdminSubRow?: boolean;
  /** When set, this panel auto-opens immediately after the card is created */
  autoOpenPanel?: PanelKey;
  /** Resolve the href for the guest portal. Return undefined for non-navigable cards. */
  resolveHref?: (card: Card, token?: string) => string | undefined;
  /** Override specific panel icons for this card type */
  panelIcons?: Partial<Record<PanelKey, ReactNode>>;
  /**
   * Key for a custom layout panel component (looked up in CUSTOM_LAYOUT_PANELS
   * in HomeClient). When set, replaces the default LayoutPanelContent.
   */
  layoutPanelKey?: string;
};

const TextIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M1 5C1 3.34315 2.34315 2 4 2C5.65685 2 7 3.34315 7 5V8H1V5ZM1 9V15H0V5C0 2.79086 1.79086 1 4 1C6.20914 1 8 2.79086 8 5V15H7V9H1ZM10 11.5C10 10.1193 11.1193 9 12.5 9C13.8807 9 15 10.1193 15 11.5C15 12.8807 13.8807 14 12.5 14C11.1193 14 10 12.8807 10 11.5ZM12.5 8C13.4793 8 14.3647 8.40223 15 9.05051V8H16V11.5V15H15V13.9495C14.3647 14.5978 13.4793 15 12.5 15C10.567 15 9 13.433 9 11.5C9 9.567 10.567 8 12.5 8Z" fill="currentColor" />
  </svg>
);

export const CARD_TYPE_REGISTRY: Record<CardTypeKey, CardTypeConfig> = {
  link: {
    key: "link",
    label: "Länk",
    description: "Öppnar en URL",
    adminPanels: ["layout", "image", "badge", "schedule"],
    categoryFriendly: true,
    layouts: [
      {
        key: "showcase",
        label: "Classic",
        description: "Full image with title beneath — clean, editorial look.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        needsImage: true,
      },
      {
        key: "featured",
        label: "Featured",
        description: "Make your link stand out with a larger, more attractive display.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-classic-featured.c4a5e9d6.webp",
        needsImage: true,
      },
      {
        key: "classic",
        label: "Compact",
        description: "Efficient, direct and compact.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
      },
    ],
    iconBg: "#0061EF",
    iconColor: "rgba(255,255,255,0.85)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.99 17.5h1.51c3.02 0 5.5-2.47 5.5-5.5 0-3.02-2.47-5.5-5.5-5.5h-1.51M9 6.5H7.5A5.51 5.51 0 0 0 2 12c0 3.02 2.47 5.5 5.5 5.5H9M8 12h8"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "link",
      type: "link",
      url: "",
      openMode: "external",
    }),
    adminSubText: (card) => (card as any).url ?? "",
    resolveHref: (card) => (card as any).url || undefined,
  },

  email: {
    key: "email",
    label: "Email",
    description: "Öppnar enhetens e-postklient",
    adminPanels: ["layout", "image", "badge", "schedule"],
    categoryFriendly: true,
    layouts: [
      {
        key: "showcase",
        label: "Classic",
        description: "Full image with title beneath — clean, editorial look.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        needsImage: true,
      },
      {
        key: "featured",
        label: "Featured",
        description: "Make your link stand out with a larger, more attractive display.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-classic-featured.c4a5e9d6.webp",
        needsImage: true,
      },
      {
        key: "classic",
        label: "Compact",
        description: "Efficient, direct and compact.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
      },
    ],
    iconBg: "#E67E22",
    iconColor: "rgba(255,255,255,0.9)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 7l8 5 8-5M4 7v10h16V7M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "email",
      type: "email",
      email: "",
      openMode: "external",
    }),
    adminSubText: (card) => (card as any).email ?? "",
    adminSubPlaceholder: "Email",
    resolveHref: (card) => {
      const email = (card as any).email;
      return email ? `mailto:${email}` : undefined;
    },
  },

  phone: {
    key: "phone",
    label: "Telefon",
    description: "Ringer ett telefonnummer",
    adminPanels: ["layout", "image", "badge", "schedule"],
    categoryFriendly: true,
    layouts: [
      {
        key: "showcase",
        label: "Classic",
        description: "Full image with title beneath — clean, editorial look.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        needsImage: true,
      },
      {
        key: "featured",
        label: "Featured",
        description: "Make your link stand out with a larger, more attractive display.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-classic-featured.c4a5e9d6.webp",
        needsImage: true,
      },
      {
        key: "classic",
        label: "Compact",
        description: "Efficient, direct and compact.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
      },
    ],
    iconBg: "#27AE60",
    iconColor: "rgba(255,255,255,0.9)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.43a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68a2 2 0 0 1 1.72 2.03Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "phone",
      type: "phone",
      phone: "",
      openMode: "external",
    }),
    adminSubText: (card) => (card as any).phone ?? "",
    adminSubPlaceholder: "Telefonnummer",
    resolveHref: (card) => {
      const phone = (card as any).phone;
      return phone ? `tel:${phone}` : undefined;
    },
  },

  text: {
    key: "text",
    label: "Text",
    description: "Visa text för gäster",
    adminPanels: ["layout", "image", "schedule"],
    categoryFriendly: true,
    layoutPanelKey: "text",
    panelIcons: { layout: TextIcon },
    layouts: [
      {
        key: "classic",
        label: "Classic",
        description: "Standard text card.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        guestRenderer: "text-classic",
      },
      {
        key: "compact",
        label: "Compact",
        description: "Kortare, mer kompakt text.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-classic-featured.c4a5e9d6.webp",
        guestRenderer: "text-compact",
      },
    ],
    iconBg: "#1A1A1A",
    iconColor: "rgba(255,255,255,0.85)",
    icon: TextIcon,
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "text",
      type: "text",
    }),
    showAdminSubRow: false,
    autoOpenPanel: "layout",
    resolveHref: () => undefined,
  },

  header: {
    key: "header",
    label: "Rubrik",
    description: "Sektionsrubrik",
    adminPanels: ["delete"],
    categoryFriendly: false,
    layouts: [
      {
        key: "default",
        label: "Default",
        description: "Centrerad rubrik.",
        previewImage: "",
        guestRenderer: "header-default",
      },
    ],
    iconBg: "#444",
    iconColor: "rgba(255,255,255,0.85)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 5V19M20 5V19M4 12H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "header",
      type: "header",
    }),
    showAdminSubRow: false,
    resolveHref: () => undefined,
  },

  document: {
    key: "document",
    label: "Dokument",
    description: "Visa en PDF-fil",
    adminPanels: ["layout", "image", "badge", "schedule"],
    categoryFriendly: true,
    layoutPanelKey: "document",
    panelIcons: {
      layout: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M8.33365 0.5C8.5821 0.5 8.7835 0.701408 8.7835 0.949858V4.13881C8.7835 4.23094 8.8201 4.3193 8.88525 4.38445C8.9504 4.44959 9.03875 4.48619 9.13089 4.48619H12.3198C12.5683 4.48619 12.7697 4.6876 12.7697 4.93605C12.7697 5.1845 12.5683 5.38591 12.3198 5.38591H9.13089C8.80013 5.38591 8.48293 5.25452 8.24906 5.02064C8.01518 4.78676 7.88379 4.46956 7.88379 4.13881V0.949858C7.88379 0.701408 8.0852 0.5 8.33365 0.5Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M2.75283 1.39972C2.44926 1.39972 2.15812 1.52031 1.94346 1.73497C1.72881 1.94962 1.60821 2.24076 1.60821 2.54433V8.125C1.60821 8.37345 1.4068 8.57486 1.15835 8.57486C0.909904 8.57486 0.708496 8.37345 0.708496 8.125V2.54433C0.708496 2.00214 0.923881 1.48216 1.30727 1.09877C1.69065 0.715384 2.21064 0.5 2.75283 0.5H8.3335C8.45281 0.5 8.56723 0.547396 8.6516 0.63176L12.6378 4.61795C12.7222 4.70232 12.7695 4.81674 12.7695 4.93605V8.125C12.7695 8.37345 12.5681 8.57486 12.3197 8.57486C12.0712 8.57486 11.8698 8.37345 11.8698 8.125V5.12239L8.14716 1.39972H2.75283Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M0.708496 10.5167C0.708496 10.2683 0.909904 10.0669 1.15835 10.0669H2.35421C2.79068 10.0669 3.20928 10.2402 3.51791 10.5489C3.82654 10.8575 3.99993 11.2761 3.99993 11.7126C3.99993 12.149 3.82654 12.5676 3.51791 12.8763C3.20928 13.1849 2.79068 13.3583 2.35421 13.3583H1.60821V15.3001C1.60821 15.5486 1.4068 15.75 1.15835 15.75C0.909904 15.75 0.708496 15.5486 0.708496 15.3001V10.5167ZM1.60821 12.4586H2.35421C2.55206 12.4586 2.74181 12.38 2.88171 12.2401C3.02162 12.1002 3.10021 11.9104 3.10021 11.7126C3.10021 11.5147 3.02161 11.325 2.88171 11.1851C2.74181 11.0452 2.55206 10.9666 2.35421 10.9666H1.60821V12.4586Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M10.2754 12.9084C10.2754 12.66 10.4768 12.4586 10.7252 12.4586H12.3197C12.5682 12.4586 12.7696 12.66 12.7696 12.9084C12.7696 13.1569 12.5682 13.3583 12.3197 13.3583H10.7252C10.4768 13.3583 10.2754 13.1569 10.2754 12.9084Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M10.2754 10.5167C10.2754 10.2683 10.4768 10.0669 10.7252 10.0669H13.117C13.3654 10.0669 13.5668 10.2683 13.5668 10.5167C13.5668 10.7652 13.3654 10.9666 13.117 10.9666H11.1751V15.3001C11.1751 15.5486 10.9737 15.75 10.7252 15.75C10.4768 15.75 10.2754 15.5486 10.2754 15.3001V10.5167Z" fill="currentColor" />
          <path fillRule="evenodd" clipRule="evenodd" d="M5.49194 10.5167C5.49194 10.2683 5.69335 10.0669 5.9418 10.0669H6.73904C7.28123 10.0669 7.80121 10.2822 8.1846 10.6656C8.56799 11.049 8.78337 11.569 8.78337 12.1112V13.7057C8.78337 14.2479 8.56799 14.7678 8.1846 15.1512C7.80121 15.5346 7.28123 15.75 6.73904 15.75H5.9418C5.69335 15.75 5.49194 15.5486 5.49194 15.3001V10.5167ZM6.39166 10.9666V14.8503H6.73904C7.04261 14.8503 7.33375 14.7297 7.54841 14.515C7.76306 14.3004 7.88366 14.0092 7.88366 13.7057V12.1112C7.88366 11.8076 7.76306 11.5165 7.54841 11.3018C7.33375 11.0872 7.04261 10.9666 6.73904 10.9666H6.39166Z" fill="currentColor" />
        </svg>
      ),
    },
    layouts: [
      {
        key: "classic",
        label: "Classic",
        description: "Standard kort med brödtext-typsnitt.",
        previewImage: "",
        guestRenderer: "doc-classic",
      },
      {
        key: "compact",
        label: "Compact",
        description: "Kort med rubrik-typsnitt.",
        previewImage: "",
        guestRenderer: "doc-compact",
      },
    ],
    iconBg: "#E74C3C",
    iconColor: "rgba(255,255,255,0.9)",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M2.75283 1.39972C2.44926 1.39972 2.15812 1.52031 1.94346 1.73497C1.72881 1.94962 1.60821 2.24076 1.60821 2.54433V8.125C1.60821 8.37345 1.4068 8.57486 1.15835 8.57486C0.909904 8.57486 0.708496 8.37345 0.708496 8.125V2.54433C0.708496 2.00214 0.923881 1.48216 1.30727 1.09877C1.69065 0.715384 2.21064 0.5 2.75283 0.5H8.3335C8.45281 0.5 8.56723 0.547396 8.6516 0.63176L12.6378 4.61795C12.7222 4.70232 12.7695 4.81674 12.7695 4.93605V8.125C12.7695 8.37345 12.5681 8.57486 12.3197 8.57486C12.0712 8.57486 11.8698 8.37345 11.8698 8.125V5.12239L8.14716 1.39972H2.75283Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M0.708496 10.5167C0.708496 10.2683 0.909904 10.0669 1.15835 10.0669H2.35421C2.79068 10.0669 3.20928 10.2402 3.51791 10.5489C3.82654 10.8575 3.99993 11.2761 3.99993 11.7126C3.99993 12.149 3.82654 12.5676 3.51791 12.8763C3.20928 13.1849 2.79068 13.3583 2.35421 13.3583H1.60821V15.3001C1.60821 15.5486 1.4068 15.75 1.15835 15.75C0.909904 15.75 0.708496 15.5486 0.708496 15.3001V10.5167Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.49194 10.5167C5.49194 10.2683 5.69335 10.0669 5.9418 10.0669H6.73904C7.28123 10.0669 7.80121 10.2822 8.1846 10.6656C8.56799 11.049 8.78337 11.569 8.78337 12.1112V13.7057C8.78337 14.2479 8.56799 14.7678 8.1846 15.1512C7.80121 15.5346 7.28123 15.75 6.73904 15.75H5.9418C5.69335 15.75 5.49194 15.5486 5.49194 15.3001V10.5167Z" fill="currentColor" />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.2754 10.5167C10.2754 10.2683 10.4768 10.0669 10.7252 10.0669H13.117C13.3654 10.0669 13.5668 10.2683 13.5668 10.5167C13.5668 10.7652 13.3654 10.9666 13.117 10.9666H11.1751V15.3001C11.1751 15.5486 10.9737 15.75 10.7252 15.75C10.4768 15.75 10.2754 15.5486 10.2754 15.3001V10.5167Z" fill="currentColor" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "document",
      type: "document",
    }),
    showAdminSubRow: false,
    autoOpenPanel: "layout",
    resolveHref: () => undefined,
  },

  faq: {
    key: "faq",
    label: "FAQs",
    description: "Vanliga frågor och svar",
    adminPanels: ["layout", "image", "schedule"],
    categoryFriendly: true,
    layoutPanelKey: "faq",
    panelIcons: {
      layout: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm7.75-3c-.35 0-.68.12-.91.32A.9.9 0 0 0 6.5 6h-1c0-.56.26-1.07.69-1.44A2.4 2.4 0 0 1 7.75 4h.5c.57 0 1.14.2 1.56.56.43.36.69.87.69 1.43a2 2 0 0 1-.33 1.2 2.2 2.2 0 0 1-.58.53 4.93 4.93 0 0 1-.32.2l-.02.01h-.01L9 7.5l.24.44-.03.01c-.19.09-.37.27-.51.55a2.43 2.43 0 0 0-.2.52V9h-1v-.02a.73.73 0 0 1 0-.09l.05-.2c.04-.15.11-.36.25-.64.22-.44.55-.8.97-1a3.34 3.34 0 0 0 .56-.41 1 1 0 0 0 .17-.61V6a.9.9 0 0 0-.34-.68A1.4 1.4 0 0 0 8.25 5h-.5ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        </svg>
      ),
    },
    layouts: [
      {
        key: "classic",
        label: "Classic",
        description: "Standard FAQ-kort.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-frequently-asked-questions-featured.55329b02.webp",
        guestRenderer: "faq-classic",
      },
      {
        key: "compact",
        label: "Compact",
        description: "Kompakt FAQ-kort.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-frequently-asked-questions-stack.f9bba02a.webp",
        guestRenderer: "faq-compact",
      },
    ],
    iconBg: "#8B5CF6",
    iconColor: "rgba(255,255,255,0.9)",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm7.75-3c-.35 0-.68.12-.91.32A.9.9 0 0 0 6.5 6h-1c0-.56.26-1.07.69-1.44A2.4 2.4 0 0 1 7.75 4h.5c.57 0 1.14.2 1.56.56.43.36.69.87.69 1.43a2 2 0 0 1-.33 1.2 2.2 2.2 0 0 1-.58.53 4.93 4.93 0 0 1-.32.2l-.02.01h-.01L9 7.5l.24.44-.03.01c-.19.09-.37.27-.51.55a2.43 2.43 0 0 0-.2.52V9h-1v-.02a.73.73 0 0 1 0-.09l.05-.2c.04-.15.11-.36.25-.64.22-.44.55-.8.97-1a3.34 3.34 0 0 0 .56-.41 1 1 0 0 0 .17-.61V6a.9.9 0 0 0-.34-.68A1.4 1.4 0 0 0 8.25 5h-.5ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "faq",
      type: "faq",
    }),
    showAdminSubRow: false,
    autoOpenPanel: "layout",
    resolveHref: () => undefined,
  },

  contact: {
    key: "contact",
    label: "Kontaktuppgifter",
    description: "Visa kontaktinformation",
    adminPanels: ["layout", "image", "schedule"],
    categoryFriendly: true,
    layoutPanelKey: "contact",
    panelIcons: {
      layout: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M0 .5.5 0h15l.5.5v15l-.5.5H.5l-.5-.5V.5ZM1 1v14h14V1H1Zm7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM3.5 9l-.5.5V14h1v-4h8v4h1V9.5l-.5-.5h-9Z" />
        </svg>
      ),
    },
    layouts: [
      {
        key: "compact",
        label: "Compact",
        description: "Efficient, direct and compact.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        guestRenderer: "contact-compact",
      },
      {
        key: "classic",
        label: "Classic",
        description: "Full-width inline contact details.",
        previewImage: "https://assets.production.linktr.ee/mfe-link-editor/latest/images/visual-link-preview-text-and-media-featured-text.eb566b94.webp",
        guestRenderer: "contact-classic",
      },
    ],
    iconBg: "#3498DB",
    iconColor: "rgba(255,255,255,0.9)",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M0 .5.5 0h15l.5.5v15l-.5.5H.5l-.5-.5V.5ZM1 1v14h14V1H1Zm7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM3.5 9l-.5.5V14h1v-4h8v4h1V9.5l-.5-.5h-9Z" />
      </svg>
    ),
    createEmpty: (sortOrder) => ({
      id: `card_${Date.now()}`,
      sortOrder,
      isActive: true,
      title: "",
      description: "",
      cardType: "contact",
      type: "contact",
    }),
    showAdminSubRow: false,
    autoOpenPanel: "layout",
    resolveHref: () => undefined,
  },
};

/** Ordered list of card types shown in the add-card modal */
export const CARD_TYPE_LIST: CardTypeConfig[] = Object.values(CARD_TYPE_REGISTRY);

export function getCardTypeConfig(key: CardTypeKey | undefined): CardTypeConfig {
  if (key && key in CARD_TYPE_REGISTRY) return CARD_TYPE_REGISTRY[key];
  return CARD_TYPE_REGISTRY.link;
}

/** Get the default layout key for a card type */
export function getDefaultLayoutKey(key: CardTypeKey | undefined): string {
  return getCardTypeConfig(key).layouts[0].key;
}

/** Check if a card (by its cardType) can be placed inside a category */
export function isCategoryFriendly(cardType: CardTypeKey | undefined): boolean {
  return getCardTypeConfig(cardType).categoryFriendly !== false;
}
