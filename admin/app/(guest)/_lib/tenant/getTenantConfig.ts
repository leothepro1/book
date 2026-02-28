import type { ThemeConfig } from "../theme";

export async function getTenantConfig() {
  const theme: ThemeConfig = {
    colors: {
      background: "#0b1020",
      text: "#ffffff",
      buttonBg: "#ffffff",
      buttonText: "#0b1020",
    },
  };

  return {
    theme,
    home: { links: [] },
    footer: { items: [] },
    features: {},
    rules: [],
  };
}
