export type HomeLinkType =
  | "internalModule"
  | "externalUrl"
  | "phone"
  | "email"
  | "mapDirections"
  | "pdf"
  | "message";

export type IconKey =
  | "calendar"
  | "info"
  | "shopping"
  | "user"
  | "map"
  | "phone"
  | "mail"
  | "file"
  | "message";

export type InternalModuleKey =
  | "checkin"
  | "checkout"
  | "info"
  | "shop"
  | "account";

export type HomeLink = {
  id: string;
  order: number;
  isEnabled: boolean;

  label_sv: string;
  label_en: string;
  icon: IconKey;

  type: HomeLinkType;

  moduleKey?: InternalModuleKey; // internalModule
  url?: string;                  // externalUrl/pdf
  phone?: string;                // phone
  email?: string;                // email
  message_md?: string;           // message content
  visibilityRuleId?: string;     // rule binding
};

export type HomeConfig = {
  version: 1;
  links: HomeLink[];
};
