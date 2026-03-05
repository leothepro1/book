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
};

export type ArticleCard = BaseCard & { type: "article"; slug: string; content: string; gallery?: string[]; };
export type LinkCard = BaseCard & { type: "link"; url: string; openMode: "internal" | "iframe" | "external"; };
export type DownloadCard = BaseCard & { type: "download"; fileUrl: string; fileType: string; fileSize?: string; };
export type GalleryCard = BaseCard & { type: "gallery"; images: string[]; };

export type CategoryLayout = "stack" | "grid" | "slider" | "showcase";

export type CategoryCard = BaseCard & {
  type: "category";
  layout: CategoryLayout;
  /** Ordered list of card IDs that belong to this category */
  cardIds: string[];
};

export type Card = ArticleCard | LinkCard | DownloadCard | GalleryCard | CategoryCard;

export type HomeConfig = {
  version: 1;
  links: HomeLink[];
  cards: Card[];
  archivedCards: ArchivedCard[];
};
