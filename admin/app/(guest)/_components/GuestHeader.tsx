"use client";

import type { TenantConfig, MenuConfig } from "../_lib/tenant/types";
import { HEADER_DEFAULTS } from "../_lib/tenant/types";
import type { ColorScheme } from "@/app/_lib/color-schemes/types";
import { Fragment, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { resolvePageIdFromPathname, getPageLayout, getPageHeader } from "@/app/_lib/pages";
import { SUPPORTED_LOCALES } from "@/app/_lib/translations/locales";
import { LanguagePanel, useLanguagePanel } from "./shared/LanguagePanel";
import { CartHeaderButton } from "./CartHeaderButton";
import "./guest-header.css";

// ─── Logo ────────────────────────────────────────────────────

function LogoPlaceholder({ width }: { width: number }) {
  return (
    <div
      style={{ width, height: 28, cursor: "pointer" }}
      className="rounded-md border border-[var(--border)] bg-white/5"
      aria-label="Logo placeholder"
    />
  );
}

function HeaderLogo({ logoUrl, logoWidth }: { logoUrl?: string; logoWidth?: number }) {
  const w = logoWidth ?? 120;
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="Logo" style={{ width: w, height: "auto", cursor: "pointer" }} />;
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text)] hover:bg-white/5 cursor-pointer"
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
          "--menu-font-color": "#222",
        } as React.CSSProperties;
      case "accent":
        return {
          "--menu-font-family": "var(--font-button, var(--font-body))",
          "--menu-font-size": "15px",
          "--menu-font-weight": "400",
          "--menu-font-color": buttonBg ?? "#222",
        } as React.CSSProperties;
      default: // "body"
        return {
          "--menu-font-family": "var(--font-body)",
          "--menu-font-size": "15px",
          "--menu-font-weight": "400",
          "--menu-font-color": "#222",
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

  // Language panel state (shared hook)
  const { langOpen, toggleLang: rawToggleLang, closeLang, langAnchorRef } = useLanguagePanel();

  const toggleMenu = useCallback(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
    closeLang();
    setMenuOpen((prev) => !prev);
  }, [closeLang]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleLang = useCallback(() => {
    setMenuOpen(false);
    rawToggleLang();
  }, [rawToggleLang]);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Early returns (after all hooks)
  if (!pageLayout.header) return null;

  const headerStyle: React.CSSProperties = {
    ...schemeCssVars,
    ...(hdr.showDivider
      ? { borderBottom: `1px solid var(--header-divider, color-mix(in srgb, var(--text) 12%, transparent))` }
      : { borderBottom: "none" }),
  };

  const headerInnerStyle: React.CSSProperties = {
    paddingTop: hdr.paddingTop,
    paddingBottom: hdr.paddingBottom,
    paddingLeft: hdr.paddingLeft,
    paddingRight: hdr.paddingRight,
  };

  const isCenter = hdr.logoPosition === "center";

  // Menu button: shows "menu" when closed, "close" when open (mobile only)
  const menuButton = showMenu ? (
    <span key="menu-btn" className="desktop-nav-hide">
      <HeaderIconButton
        icon={<HeaderSymbol name={menuOpen ? "close" : "menu"} />}
        label={menuOpen ? "Stäng meny" : "Öppna meny"}
        onClick={toggleMenu}
      />
    </span>
  ) : null;

  // Desktop inline nav (horizontal menu items)
  const desktopNavStyle = useMemo((): React.CSSProperties => {
    const menuFont = hdr.menuFont ?? "body";
    switch (menuFont) {
      case "heading":
        return { fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 700 };
      case "accent":
        return { fontFamily: "var(--font-button, var(--font-body))", fontSize: 14, fontWeight: 450 };
      default:
        return { fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 450 };
    }
  }, [hdr.menuFont]);

  const desktopNav = showMenu && headerMenu ? (
    <nav className="desktop-nav" style={desktopNavStyle}>
      {headerMenu.items.map((item) => (
        <a key={item.id} href={item.url} className="desktop-nav__item">
          {item.label}
        </a>
      ))}
    </nav>
  ) : null;

  const currentLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === currentLocale);
  const langButton = showLanguageSwitcher ? (
    <div className="lang-anchor" ref={langAnchorRef}>
      <HeaderIconButton
        icon={<HeaderSymbol name="language" />}
        label={currentLocaleInfo?.nativeName ?? "Språk"}
        onClick={toggleLang}
      />
      <LanguagePanel
        open={langOpen}
        onClose={closeLang}
        currentLocale={currentLocale}
        primaryLocale={primaryLocale}
        publishedLocales={publishedLocales}
        showFlags={showFlags}
        pathname={pathname}
      />
    </div>
  ) : null;

  // Compute button placement for left and right slots
  const leftButtons: React.ReactNode[] = [];
  const rightButtons: React.ReactNode[] = [];

  if (isCenter) {
    // Center layout: menu picks a side, lang takes the opposite
    if (menuButton) {
      (menuPos === "left" ? leftButtons : rightButtons).push(<Fragment key="menu">{menuButton}</Fragment>);
      if (langButton) {
        (menuPos === "left" ? rightButtons : leftButtons).push(<Fragment key="lang">{langButton}</Fragment>);
      }
    } else if (langButton) {
      (langPos === "left" ? leftButtons : rightButtons).push(<Fragment key="lang">{langButton}</Fragment>);
    }
  } else {
    // Left layout: logo always left, menu can be left (before logo) or right
    if (menuButton && menuPos === "left") leftButtons.push(<Fragment key="menu">{menuButton}</Fragment>);
    if (menuButton && menuPos === "right") rightButtons.push(<Fragment key="menu">{menuButton}</Fragment>);
    if (langButton) rightButtons.push(<Fragment key="lang">{langButton}</Fragment>);
  }

  // Cart button — always last on the right, only visible when items in cart
  rightButtons.push(<Fragment key="cart"><CartHeaderButton tenantId={config.tenantId} /></Fragment>);

  return (
    <>
      <header
        ref={headerRef}
        className="relative z-30 bg-[var(--background)]"
        style={headerStyle}
      >
        <div className="g-header-inner mx-auto flex items-center justify-between" style={headerInnerStyle}>
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
                {desktopNav}
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

      {/* LanguagePanel is now rendered inside the lang-anchor wrapper */}
    </>
  );
}
