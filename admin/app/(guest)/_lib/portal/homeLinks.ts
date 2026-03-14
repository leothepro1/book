export type HomeLinkType = "internalModule" | "externalUrl" | "phone" | "email" | "mapDirections" | "pdf" | "message";

export type IconKey = "calendar" | "info" | "shopping" | "user" | "map" | "phone" | "mail" | "file" | "message";

export type InternalModuleKey = "checkin" | "checkout" | "info" | "shop" | "account";

export type HomeLink = {
  id: string;
  order: number;
  isEnabled: boolean;
  label_sv: string;
  label_en: string;
  icon: IconKey;
  type: HomeLinkType;
  moduleKey?: InternalModuleKey;
  url?: string;
  phone?: string;
  email?: string;
  message_md?: string;
  visibilityRuleId?: string;
};

export type ArchivedCard = Card & {
  archivedAt: string;      // ISO timestamp
  archivedBy?: string;     // Clerk userId
  archivedReason?: "manual" | "scheduled";
};

export type BaseCard = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  title: string;
  description: string;
  image?: string;
  badge?: string;
  ctaLabel?: string;
  /** Specialised card type key — controls admin panels and guest rendering */
  cardType?: import("@/app/_lib/cardTypes/registry").CardTypeKey;
  /** ISO 8601 timestamp — card becomes visible at this time (Europe/Stockholm) */
  scheduledShow?: string;
  /** ISO 8601 timestamp — card becomes hidden at this time (Europe/Stockholm) */
  scheduledHide?: string;
};

export type ArticleCard = BaseCard & { type: "article"; slug: string; content: string; gallery?: string[]; };
export type LinkCard = BaseCard & { type: "link"; url: string; openMode: "internal" | "iframe" | "external"; };
export type DownloadCard = BaseCard & { type: "download"; fileUrl: string; fileType: string; fileSize?: string; };
export type GalleryCard = BaseCard & { type: "gallery"; images: string[]; };
export type TextCard = BaseCard & { type: "text"; content?: string; ctaUrl?: string };
export type HeaderCard = BaseCard & { type: "header" };
export type DocumentCard = BaseCard & { type: "document"; fileUrl?: string; fileName?: string; filePublicId?: string; fileDescription?: string };
export type FaqItem = { id: string; question: string; answer: string; isActive: boolean };
export type FaqCard = BaseCard & { type: "faq"; faqs?: FaqItem[] };
export type EmailCard = BaseCard & { type: "email"; email: string; openMode: "external" };
export type PhoneCard = BaseCard & { type: "phone"; phone: string; openMode: "external" };
export type ContactCard = BaseCard & {
  type: "contact";
  contactName?: string;
  phone1Prefix?: string; phone1Number?: string;
  phone2Prefix?: string; phone2Number?: string;
  fax1Prefix?: string; fax1Number?: string;
  fax2Prefix?: string; fax2Number?: string;
  addressLine1?: string; addressLine2?: string; addressLine3?: string;
  city?: string; country?: string; state?: string; zip?: string;
  notes?: string;
};

export type CategoryLayout = "stack" | "grid" | "slider" | "showcase";

export type CategoryCard = BaseCard & {
  type: "category";
  layout: CategoryLayout;
  /** Ordered list of card IDs that belong to this category */
  cardIds: string[];
};

export type Card = ArticleCard | LinkCard | DownloadCard | GalleryCard | TextCard | HeaderCard | DocumentCard | FaqCard | EmailCard | PhoneCard | ContactCard | CategoryCard;

export type HomeConfig = {
  /**
   * Schema version.
   * 1 = original (cards + categories only)
   * 2 = sections added (cards + categories + sections)
   *
   * Version is forward-compatible: v1 configs work as v2 (sections defaults to []).
   */
  version: 1 | 2;
  links: HomeLink[];
  cards: Card[];
  /**
   * Section instances placed on the page.
   * Each section is a layout container that references cards via cardIds.
   * Sections interleave with loose cards by sortOrder.
   *
   * Added in version 2. Defaults to [] for v1 configs.
   */
  sections: import("@/app/_lib/sections/types").SectionInstance[];
  archivedCards: ArchivedCard[];
  /** @deprecated Legacy v1 field. Now stored in TenantConfig.globalHeader. Read-only for migration. */
  header?: import("@/app/(guest)/_lib/tenant/types").HeaderConfig;
  /** @deprecated Legacy v1 field. Now stored in TenantConfig.globalFooter. Read-only for migration. */
  footer?: import("@/app/(guest)/_lib/tenant/types").PageFooterConfig;
};
