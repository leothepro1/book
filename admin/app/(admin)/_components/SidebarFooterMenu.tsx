'use client';

import { useEffect, useRef } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useDevClerkUser } from './DevClerkContext';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Footer "more" menu — popup anchored above the more_horiz button in the
 * sidebar footer. Mirrors the Vercel pattern: instant show/hide (no
 * transition), outside-click + Escape to close, role="menu".
 *
 * Item 1 is the Clerk-bound user row (name + email + settings icon).
 * Subsequent items are external links that open in a new tab unless
 * specified otherwise. The footer of the popup shows platform status —
 * currently mocked as "operational"; see `usePlatformStatus()` for the
 * Sentry swap point.
 */

// ── Clerk user (dev/prod split, same pattern as UserMenu.tsx) ────────────
//
// ClerkProvider is not mounted in dev (see app/layout.tsx) — calling
// Clerk hooks would throw. Bind one implementation at module load via
// the build-time IS_DEV constant; each variant calls hooks unconditionally,
// so React hook order is stable for the lifetime of the build.

type ClerkUserShape = {
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

type ClerkUserResult = {
  user: ClerkUserShape | null | undefined;
  signOut: () => void;
  openUserProfile: () => void;
};

function useClerkUserDev(): ClerkUserResult {
  const dev = useDevClerkUser();
  if (!dev) return { user: null, signOut: () => {}, openUserProfile: () => {} };
  return {
    user: {
      fullName: dev.fullName,
      firstName: dev.firstName,
      username: dev.username,
      primaryEmailAddress: dev.emailAddress ? { emailAddress: dev.emailAddress } : null,
    },
    signOut: () => {},
    openUserProfile: () => {},
  };
}

function useClerkUserProd(): ClerkUserResult {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  return { user, signOut: () => signOut(), openUserProfile: () => openUserProfile() };
}

const useClerkUser: () => ClerkUserResult = IS_DEV ? useClerkUserDev : useClerkUserProd;

// ── Platform status (mock — Sentry swap point) ───────────────────────────
//
// TODO(sentry): replace with a real status check. Suggested wiring:
//   - poll GET /api/admin/platform-status at a low cadence (e.g. 60s)
//   - status aggregates: Sentry uptime, Stripe webhook health, PMS
//     reliability engine SLOs, DB connection health, Redis reachability
//   - return 'operational' only when all dependencies are green
// The component is structured so swapping this hook's implementation is
// the only change required.

type PlatformStatusValue = 'operational' | 'degraded' | 'down';

function usePlatformStatus(): { status: PlatformStatusValue; label: string } {
  return { status: 'operational', label: 'Alla system fungerar' };
}

// ── Menu item types ──────────────────────────────────────────────────────

type LinkItem = {
  kind: 'link';
  label: string;
  icon: string;
  href: string;
  newTab?: boolean;
};

type ActionItem = {
  kind: 'action';
  label: string;
  icon: string;
  onClick: () => void;
};

type MenuItem = LinkItem | ActionItem;

// ── Component ────────────────────────────────────────────────────────────

export function SidebarFooterMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, signOut, openUserProfile } = useClerkUser();
  const menuRef = useRef<HTMLDivElement>(null);
  const status = usePlatformStatus();

  // Close on outside click + Escape. Only registered while open so we
  // don't carry global listeners for a closed menu.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const fullName = user?.fullName ?? user?.firstName ?? user?.username ?? '—';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  // Item links — placeholder hrefs, to be replaced with the real targets.
  // newTab defaults to true (most are external resources).
  const items: MenuItem[] = [
    { kind: 'link', label: 'Feedback', icon: 'open_in_new', href: '#', newTab: true },
    { kind: 'link', label: 'Startsida', icon: 'open_in_new', href: '#', newTab: true },
    { kind: 'link', label: 'Changelog', icon: 'open_in_new', href: '#', newTab: true },
    { kind: 'link', label: 'Hjälp', icon: 'open_in_new', href: '#', newTab: true },
    { kind: 'link', label: 'Docs', icon: 'open_in_new', href: '#', newTab: true },
    {
      kind: 'action',
      label: 'Logga ut',
      icon: 'logout',
      onClick: () => {
        onClose();
        signOut();
      },
    },
  ];

  return (
    <div ref={menuRef} className="sb__more-menu" role="menu">
      {/* Item 1 — Clerk user row, opens user profile */}
      <button
        type="button"
        role="menuitem"
        className="sb__more-item sb__more-item--user"
        onClick={() => {
          onClose();
          openUserProfile();
        }}
      >
        <span className="sb__more-user">
          <span className="sb__more-user-name">{fullName}</span>
          {email && <span className="sb__more-user-email">{email}</span>}
        </span>
        <span className="material-symbols-rounded sb__more-icon" aria-hidden>
          settings
        </span>
      </button>

      <div className="sb__more-divider" role="separator" />

      {items.map((item) =>
        item.kind === 'link' ? (
          <a
            key={item.label}
            role="menuitem"
            href={item.href}
            target={item.newTab ? '_blank' : undefined}
            rel={item.newTab ? 'noopener noreferrer' : undefined}
            className="sb__more-item"
            onClick={onClose}
          >
            <span className="sb__more-label">{item.label}</span>
            <span className="material-symbols-rounded sb__more-icon" aria-hidden>
              {item.icon}
            </span>
          </a>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="sb__more-item"
            onClick={item.onClick}
          >
            <span className="sb__more-label">{item.label}</span>
            <span className="material-symbols-rounded sb__more-icon" aria-hidden>
              {item.icon}
            </span>
          </button>
        ),
      )}

      {/* Footer — platform status (Sentry-bound when wired) */}
      <div className="sb__more-status" aria-live="polite">
        <span className="sb__more-status-text">
          <span className="sb__more-status-label">Plattform status</span>
          <span className="sb__more-status-value">{status.label}</span>
        </span>
        <span
          className="sb__more-status-dot"
          data-status={status.status}
          aria-hidden
        />
      </div>
    </div>
  );
}
