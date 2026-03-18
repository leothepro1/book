"use client";

import type { TenantConfig, MenuConfig } from "../_lib/tenant/types";
import { HEADER_DEFAULTS } from "../_lib/tenant/types";
import type { ColorScheme } from "@/app/_lib/color-schemes/types";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { resolvePageIdFromPathname, getPageLayout, getPageHeader } from "@/app/_lib/pages";
import { SUPPORTED_LOCALES, getFlagUrl } from "@/app/_lib/translations/locales";
import "./guest-header.css";

// ─── Logo ────────────────────────────────────────────────────

function LogoPlaceholder({ width }: { width: number }) {
  return (
    <div
      style={{ width, height: 28 }}
      className="rounded-md border border-[var(--border)] bg-white/5"
      aria-label="Logo placeholder"
    />
  );
}

function HeaderLogo({ logoUrl, logoWidth }: { logoUrl?: string; logoWidth?: number }) {
  const w = logoWidth ?? 120;
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="Logo" style={{ width: w, height: "auto" }} />;
  }
  return <LogoPlaceholder width={w} />;
}

// ─── Icon ────────────────────────────────────────────────────

function HeaderSymbol({ name }: { name: string }) {
  return (
    <span
      className="material-symbols-rounded"
      style={{
        fontSize: 24,
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text)",
        fontVariationSettings: "'wght' 300, 'opsz' 24",
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function HeaderIconButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text)] hover:bg-white/5"
      style={{ width: "max-content", height: "max-content" }}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

// ─── Menu Panel ──────────────────────────────────────────────

function MenuPanel({
  menu,
  open,
  onClose,
  side,
  headerHeight,
  menuFont,
  config,
}: {
  menu: MenuConfig;
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  headerHeight: number;
  menuFont: "body" | "heading" | "accent";
  config: TenantConfig;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Resolve menu item font style as CSS vars
  const fontVars = useMemo((): React.CSSProperties => {
    const schemes = config.colorSchemes as ColorScheme[] | undefined;
    const headerConfig = { ...HEADER_DEFAULTS, ...getPageHeader(config) };
    const scheme = headerConfig.colorSchemeId && schemes
      ? schemes.find((s) => s.id === headerConfig.colorSchemeId)
      : undefined;
    const buttonBg = scheme?.tokens?.solidButtonBackground;

    switch (menuFont) {
      case "heading":
        return {
          "--menu-font-family": "var(--font-heading)",
          "--menu-font-size": "18px",
          "--menu-font-weight": "700",
          "--menu-font-color": "var(--text)",
        } as React.CSSProperties;
      case "accent":
        return {
          "--menu-font-family": "var(--font-button, var(--font-body))",
          "--menu-font-size": "15px",
          "--menu-font-weight": "400",
          "--menu-font-color": buttonBg ?? "var(--button-bg, var(--text))",
        } as React.CSSProperties;
      default: // "body"
        return {
          "--menu-font-family": "var(--font-body)",
          "--menu-font-size": "15px",
          "--menu-font-weight": "400",
          "--menu-font-color": "var(--text)",
        } as React.CSSProperties;
    }
  }, [menuFont, config]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`header-menu-backdrop${open ? " header-menu-backdrop--open" : ""}`}
        onClick={onClose}
      />

      {/* Panel */}
      <nav
        className={`header-menu-panel header-menu-panel--${side}${open ? " header-menu-panel--open" : ""}`}
        aria-hidden={!open}
        style={fontVars}
      >
        {/* Spacer to push content below the sticky header */}
        <div className="header-menu-panel__spacer" style={{ height: headerHeight }} />

        {/* Menu items */}
        <ul className="header-menu-panel__list">
          {menu.items.map((item) => (
            <li key={item.id}>
              <a
                href={item.url}
                className="header-menu-panel__item"
                onClick={onClose}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

// ─── Language Panel ──────────────────────────────────────────

function LanguagePanel({
  open,
  onClose,
  currentLocale,
  primaryLocale,
  publishedLocales,
  showFlags,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  currentLocale: string;
  primaryLocale: string;
  publishedLocales: string[];
  showFlags: boolean;
  pathname: string;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Drag-to-dismiss
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);

  const onDragStart = useCallback((clientY: number) => {
    isDragging.current = true;
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
    if (panelRef.current) {
      panelRef.current.style.transition = "none";
    }
  }, []);

  const onDragMove = useCallback((clientY: number) => {
    if (!isDragging.current || !panelRef.current) return;
    dragCurrentY.current = clientY;
    const delta = Math.max(0, clientY - dragStartY.current);
    panelRef.current.style.transform = `translateY(${delta}px)`;
  }, []);

  const onDragEnd = useCallback(() => {
    if (!isDragging.current || !panelRef.current) return;
    isDragging.current = false;
    const delta = dragCurrentY.current - dragStartY.current;
    panelRef.current.style.transition = "";
    panelRef.current.style.transform = "";
    if (delta > 80) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleTouchMove = (e: TouchEvent) => onDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => onDragEnd();
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientY);
    const handleMouseUp = () => onDragEnd();

    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [open, onDragMove, onDragEnd]);

  // Sort: current locale first, then alphabetical by native name
  const sortedLocales = useMemo(() => {
    const locales = publishedLocales
      .map((code) => SUPPORTED_LOCALES.find((l) => l.code === code))
      .filter(Boolean) as (typeof SUPPORTED_LOCALES)[number][];

    return locales.sort((a, b) => {
      if (a.code === currentLocale) return -1;
      if (b.code === currentLocale) return 1;
      return a.nativeName.localeCompare(b.nativeName);
    });
  }, [publishedLocales, currentLocale]);

  const handleSelect = useCallback((localeCode: string) => {
    onClose();

    // Build locale-aware URL:
    // Primary locale: /p/{token}/... (no prefix)
    // Other locales:  /{locale}/p/{token}/...
    // Preview mode:   /preview/... or /{locale}/preview/...

    // Strip existing locale prefix if present (matches /xx/p/ or /xx/preview/)
    const strippedPath = pathname.replace(/^\/[a-z]{2}(\/(?:p|preview)\/)/, "$1");

    let newPath: string;
    if (localeCode === primaryLocale) {
      newPath = strippedPath;
    } else {
      newPath = `/${localeCode}${strippedPath}`;
    }

    window.location.href = newPath;
  }, [onClose, pathname, primaryLocale]);

  return (
    <>
      <div
        className={`lang-panel-overlay${open ? " lang-panel-overlay--open" : ""}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`lang-panel${open ? " lang-panel--open" : ""}`}
        role="dialog"
        aria-modal={open}
        aria-label="Välj språk"
      >
        <div
          className="lang-panel__handle"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientY); }}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <div className="lang-panel__handle-bar" />
        </div>
        <ul className="lang-panel__list">
          {sortedLocales.map((locale) => (
            <li key={locale.code}>
              <button
                type="button"
                className="lang-panel__item"
                onClick={() => handleSelect(locale.code)}
              >
                {showFlags && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getFlagUrl(locale.country, 48)}
                    alt=""
                    className="lang-panel__flag"
                    draggable={false}
                  />
                )}
                <span className="lang-panel__label">{locale.nativeName}</span>
                {locale.code === currentLocale && (
                  <span className="material-symbols-rounded lang-panel__check" aria-hidden="true">
                    check
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// ─── Component ───────────────────────────────────────────────

export default function GuestHeader({ config }: { config: TenantConfig }) {
  const pathname = usePathname();

  const currentLocale = config._currentLocale ?? "sv";
  const primaryLocale = config._primaryLocale ?? "sv";

  const pageId = useMemo(() => resolvePageIdFromPathname(pathname), [pathname]);
  const pageLayout = useMemo(() => getPageLayout(pageId), [pageId]);

  const hdr = { ...HEADER_DEFAULTS, ...getPageHeader(config, pageId) };
  const logoUrl = config.theme?.header?.logoUrl as string | undefined;
  const logoWidth = config.theme?.header?.logoWidth as number | undefined;

  // Menu: must be set AND exist
  const headerMenu = useMemo(() => {
    if (!hdr.headerMenuId || !config.menus) return null;
    return config.menus.find((m) => m.id === hdr.headerMenuId) ?? null;
  }, [hdr.headerMenuId, config.menus]);
  const showMenu = headerMenu !== null;

  // Language switcher: must be enabled AND have at least 2 published locales
  const publishedLocales = config._publishedLocales ?? [];
  const langEnabled = hdr.showLanguageSwitcher ?? config.features?.languageSwitcherEnabled ?? false;
  const showLanguageSwitcher = langEnabled && publishedLocales.length >= 2;
  const showFlags = hdr.showFlags ?? false;

  const menuPos = hdr.menuPosition ?? "right";
  const langPos = hdr.languageSwitcherPosition ?? "right";

  // Color scheme
  const schemeCssVars = useMemo(() => {
    if (!hdr.colorSchemeId || !config.colorSchemes) return undefined;
    const scheme = (config.colorSchemes as ColorScheme[]).find((s) => s.id === hdr.colorSchemeId);
    if (!scheme) return undefined;
    const tk = scheme.tokens ?? {} as Record<string, string>;
    return {
      "--background": tk.background ?? "#ffffff",
      "--text": tk.text ?? "#000000",
      "--header-divider": tk.outlineButton ?? tk.text ?? "#000000",
    } as React.CSSProperties;
  }, [hdr.colorSchemeId, config.colorSchemes]);

  // Menu panel state
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  // Language panel state
  const [langOpen, setLangOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
    setLangOpen(false);
    setMenuOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleLang = useCallback(() => {
    setMenuOpen(false);
    setLangOpen((prev) => !prev);
  }, []);

  const closeLang = useCallback(() => setLangOpen(false), []);

  // Close all panels on navigation
  useEffect(() => {
    setMenuOpen(false);
    setLangOpen(false);
  }, [pathname]);

  // Early returns (after all hooks)
  if (!pageLayout.header) return null;

  const headerStyle: React.CSSProperties = {
    ...schemeCssVars,
    padding: `${hdr.paddingTop}px ${hdr.paddingRight}px ${hdr.paddingBottom}px ${hdr.paddingLeft}px`,
    ...(hdr.showDivider
      ? { borderBottom: `1px solid var(--header-divider, color-mix(in srgb, var(--text) 12%, transparent))` }
      : { borderBottom: "none" }),
  };

  const isCenter = hdr.logoPosition === "center";

  // Menu button: shows "menu" when closed, "close" when open
  const menuButton = showMenu ? (
    <HeaderIconButton
      icon={<HeaderSymbol name={menuOpen ? "close" : "menu"} />}
      label={menuOpen ? "Stäng meny" : "Öppna meny"}
      onClick={toggleMenu}
    />
  ) : null;

  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === currentLocale);
  const langButton = showLanguageSwitcher ? (
    <HeaderIconButton
      icon={<HeaderSymbol name="language" />}
      label={currentLocaleInfo?.nativeName ?? "Språk"}
      onClick={toggleLang}
    />
  ) : null;

  // Compute button placement for left and right slots
  const leftButtons: React.ReactNode[] = [];
  const rightButtons: React.ReactNode[] = [];

  if (isCenter) {
    // Center layout: menu picks a side, lang takes the opposite
    if (menuButton) {
      (menuPos === "left" ? leftButtons : rightButtons).push(menuButton);
      if (langButton) {
        (menuPos === "left" ? rightButtons : leftButtons).push(langButton);
      }
    } else if (langButton) {
      (langPos === "left" ? leftButtons : rightButtons).push(langButton);
    }
  } else {
    // Left layout: logo always left, menu can be left (before logo) or right
    if (menuButton && menuPos === "left") leftButtons.push(menuButton);
    if (menuButton && menuPos === "right") rightButtons.push(menuButton);
    if (langButton) rightButtons.push(langButton);
  }

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-30 bg-[var(--background)]"
        style={headerStyle}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          {isCenter ? (
            <>
              <div className="flex items-center gap-3" style={{ flex: "1 1 0", minWidth: 0 }}>
                {leftButtons}
              </div>
              <div className="flex items-center justify-center">
                <HeaderLogo logoUrl={logoUrl} logoWidth={logoWidth} />
              </div>
              <div className="flex items-center justify-end gap-3" style={{ flex: "1 1 0", minWidth: 0 }}>
                {rightButtons}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {leftButtons}
                <HeaderLogo logoUrl={logoUrl} logoWidth={logoWidth} />
              </div>
              <div className="flex items-center justify-end gap-3">
                {rightButtons}
              </div>
            </>
          )}
        </div>
      </header>

      {headerMenu && (
        <MenuPanel
          menu={headerMenu}
          open={menuOpen}
          onClose={closeMenu}
          side={menuPos}
          headerHeight={headerHeight}
          menuFont={hdr.menuFont ?? "body"}
          config={config}
        />
      )}

      {showLanguageSwitcher && (
        <LanguagePanel
          open={langOpen}
          onClose={closeLang}
          currentLocale={currentLocale}
          primaryLocale={primaryLocale}
          publishedLocales={publishedLocales}
          showFlags={showFlags}
          pathname={pathname}
        />
      )}
    </>
  );
}
