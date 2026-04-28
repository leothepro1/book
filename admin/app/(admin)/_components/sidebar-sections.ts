/**
 * Sidebar drill-in section registry.
 *
 * Single source of truth for every sidebar item that hosts a sub-navigation.
 * Each section becomes a trigger row in the main sidebar (icon + label +
 * chevron-right trail). Clicking enters the drill-in: the sidebar swaps to
 * show the section's items.
 *
 * Convention: when the section has its own route (e.g. `/products`), it is
 * the FIRST item in `items` and serves as the default landing — selected
 * automatically when the user lands on that route. Reordering this array
 * is harmless; the first matching item wins.
 *
 * Icons follow Material Symbols Rounded — same vocabulary as the rest of
 * the sidebar.
 */

export type DrillInItem = {
  href: string;
  label: string;
  icon: string;
};

export type DrillInSection = {
  id: string;
  label: string;
  icon: string;
  items: DrillInItem[];
};

export const DRILL_IN_SECTIONS: DrillInSection[] = [
  {
    id: 'orders',
    label: 'Ordrar',
    icon: 'inbox',
    items: [
      { href: '/orders', label: 'Ordrar', icon: 'inbox' },
      { href: '/orders/abandoned', label: 'Övergivna kassor', icon: 'remove_shopping_cart' },
    ],
  },
  {
    id: 'customers',
    label: 'Kunder',
    icon: 'group',
    items: [
      { href: '/customers', label: 'Kunder', icon: 'group' },
      { href: '/customers/companies', label: 'Företag', icon: 'corporate_fare' },
      { href: '/customers/segments', label: 'Kundsegment', icon: 'diversity_3' },
    ],
  },
  {
    id: 'products',
    label: 'Produkter',
    icon: 'sell',
    items: [
      { href: '/products', label: 'Produkter', icon: 'sell' },
      { href: '/collections', label: 'Produktserier', icon: 'category' },
      { href: '/inventory', label: 'Lager', icon: 'inventory_2' },
      { href: '/gift-cards', label: 'Presentkort', icon: 'card_giftcard' },
    ],
  },
  {
    id: 'accommodations',
    label: 'Boenden',
    icon: 'villa',
    items: [
      { href: '/accommodations', label: 'Boenden', icon: 'villa' },
      { href: '/accommodation-categories', label: 'Boendetyper', icon: 'category' },
    ],
  },
  {
    id: 'content',
    label: 'Innehåll',
    icon: 'database',
    items: [
      { href: '/files', label: 'Filer', icon: 'folder' },
      { href: '/maps', label: 'Kartor', icon: 'map' },
      { href: '/menus', label: 'Menyer', icon: 'menu_book' },
      { href: '/redirects', label: 'URL-omdirigeringar', icon: 'swap_calls' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analys',
    icon: 'travel_explore',
    items: [
      { href: '/analytics', label: 'Analys', icon: 'travel_explore' },
      { href: '/live', label: 'Live-vy', icon: 'broadcast_on_home' },
    ],
  },
  {
    id: 'webshop',
    label: 'Webbshop',
    icon: 'storefront',
    items: [
      { href: '/store', label: 'Webbshop', icon: 'storefront' },
      { href: '/store/preferences', label: 'Preferenser', icon: 'tune' },
    ],
  },
];

/**
 * App drill-in section ids are dynamic — one per installed app that
 * declares pages. We use a single namespace prefix so route-section ids
 * (orders, products, …) and app-section ids never collide.
 */
export const APP_SECTION_PREFIX = 'app:';

export function appSectionId(appId: string): string {
  return APP_SECTION_PREFIX + appId;
}

export function parseAppSectionId(sectionId: string): string | null {
  if (!sectionId.startsWith(APP_SECTION_PREFIX)) return null;
  return sectionId.slice(APP_SECTION_PREFIX.length);
}

/** Lightweight shape used by `inferSectionFromPath` to avoid coupling to SidebarApp. */
export type SectionInferableApp = {
  appId: string;
  pages?: { slug: string }[];
};

/** Apps need ≥2 declared pages to qualify as a drill-in section. */
function appQualifiesAsSection(app: SectionInferableApp): boolean {
  return Array.isArray(app.pages) && app.pages.length >= 2;
}

/**
 * Map a pathname to the section it belongs to (or null).
 *
 * Route-based sections (orders, products, …) are checked first against
 * the static registry. If pathname is under `/apps/{appId}/...` and the
 * app has ≥2 declared pages, returns `app:{appId}`. Otherwise null.
 */
export function inferSectionFromPath(
  pathname: string,
  apps?: SectionInferableApp[],
): string | null {
  for (const section of DRILL_IN_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return section.id;
      }
    }
  }

  // App drill-in: /apps/{appId}/...  (excluding /apps and /apps/installed)
  if (apps && pathname.startsWith('/apps/')) {
    const segments = pathname.slice('/apps/'.length).split('/');
    const appId = segments[0];
    if (appId && appId !== 'installed') {
      const app = apps.find((a) => a.appId === appId);
      if (app && appQualifiesAsSection(app)) {
        return appSectionId(appId);
      }
    }
  }

  return null;
}

/** Look up a section by id. */
export function getSection(id: string): DrillInSection | undefined {
  return DRILL_IN_SECTIONS.find((s) => s.id === id);
}

/**
 * Pick the active item href for a given pathname — longest matching prefix
 * wins. Returns null when no item matches (the drill-in still renders, but
 * no row is highlighted).
 */
export function getActiveItemHref(pathname: string, items: DrillInItem[]): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (item.href.length > bestLen) {
        best = item.href;
        bestLen = item.href.length;
      }
    }
  }
  return best;
}
