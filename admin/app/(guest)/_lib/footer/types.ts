export type FooterTabKey = "home" | "shop" | "account";

export type FooterNavItem = {
  key: FooterTabKey;
  order: number;
  isEnabled: boolean;

  label_sv: string;
  label_en: string;

  requiredFeature: "none" | "commerce" | "account";
};

export type FooterConfig = {
  version: 1;
  items: FooterNavItem[];
};
