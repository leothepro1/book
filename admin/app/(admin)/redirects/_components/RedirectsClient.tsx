"use client";

import { useMemo, useState } from "react";

import { EditorIcon } from "@/app/_components/EditorIcon";

import "../../products/products.css";
import "./redirects.css";

// ── Props ────────────────────────────────────────────────────

export interface RedirectListItem {
  readonly id: string;
  readonly fromPath: string;
  readonly toPath: string;
  readonly statusCode: number;
  readonly hitCount: number;
  /** ISO string or null. The server serialises Date → string at the
   * page boundary so we don't ship unserialisable values into a
   * client component. */
  readonly lastHitAt: string | null;
  readonly createdAt: string;
}

interface Props {
  readonly initialRedirects: ReadonlyArray<RedirectListItem>;
}

// ── Formatting helpers ──────────────────────────────────────

const HITS_FORMATTER = new Intl.NumberFormat("sv-SE");

function formatSwedishDate(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Idag";
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ── Component ────────────────────────────────────────────────

export default function RedirectsClient({ initialRedirects }: Props) {
  const [search, setSearch] = useState("");

  // Substring filter on either path. Lowercased on both sides so
  // merchants don't have to worry about casing — the stored paths are
  // already lowercased by the redirect normaliser anyway.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialRedirects;
    return initialRedirects.filter(
      (r) =>
        r.fromPath.toLowerCase().includes(q) ||
        r.toPath.toLowerCase().includes(q),
    );
  }, [search, initialRedirects]);

  const isEmpty = initialRedirects.length === 0;
  const noMatch = !isEmpty && filtered.length === 0;

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <EditorIcon name="link" size={22} />
            URL-omdirigeringar
          </h1>
        </div>

        <div className="admin-content">
          {isEmpty ? (
            <div className="products-empty">
              <EditorIcon
                name="link"
                size={48}
                className="products-empty__icon"
              />
              <h2 className="products-empty__title">Inga omdirigeringar än</h2>
              <p className="products-empty__desc">
                Inga omdirigeringar än. De skapas automatiskt när du ändrar webbadresser på dina produkter eller boenden.
              </p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="redirects-toolbar">
                <input
                  type="search"
                  className="redirects-search"
                  placeholder="Sök på sökväg…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Sök omdirigeringar"
                />
              </div>

              {/* Header row */}
              <div className="files-column-headers redirects-row redirects-row--header">
                <div className="redirects-col redirects-col--from">
                  Från-sökväg
                </div>
                <div className="redirects-col redirects-col--to">
                  Till-sökväg
                </div>
                <div className="redirects-col redirects-col--date">
                  Skapad
                </div>
                <div className="redirects-col redirects-col--hits">
                  Använd
                </div>
              </div>

              {/* Rows */}
              {noMatch ? (
                <div className="products-empty" style={{ padding: "48px 24px" }}>
                  <p className="products-empty__desc" style={{ margin: 0 }}>
                    Inga träffar för &quot;{search}&quot;.
                  </p>
                </div>
              ) : (
                filtered.map((r) => (
                  <div key={r.id} className="redirects-row">
                    <div className="redirects-col redirects-col--from">
                      <span className="redirects-path" title={r.fromPath}>
                        {r.fromPath}
                      </span>
                    </div>
                    <div className="redirects-col redirects-col--to">
                      <span className="redirects-path" title={r.toPath}>
                        {r.toPath}
                      </span>
                    </div>
                    <div className="redirects-col redirects-col--date">
                      {formatSwedishDate(r.createdAt)}
                    </div>
                    <div className="redirects-col redirects-col--hits">
                      <div className="redirects-hits__count">
                        {HITS_FORMATTER.format(r.hitCount)} klick
                      </div>
                      <div className="redirects-hits__last">
                        {r.lastHitAt
                          ? `Senast använd: ${formatSwedishDate(r.lastHitAt)}`
                          : "Aldrig använd"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
