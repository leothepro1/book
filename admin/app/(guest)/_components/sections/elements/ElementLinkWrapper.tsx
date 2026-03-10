"use client";

/**
 * Element Link Wrapper — Global click behavior for all element types
 * ═══════════════════════════════════════════════════════════════
 *
 * Reads `settings.link` from any element and applies click behavior.
 * Uses the SAME MorphModal as card-types for document, contact, text.
 * Uses standard <a> tags for url, email, phone.
 *
 * If no link is set, renders children directly (no wrapper).
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import { MorphModal } from "@/app/(guest)/_components/cards/MorphModal";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type LinkData = {
  type: "url" | "document" | "email" | "phone" | "contact" | "text";
  target: string;
  payload: Record<string, unknown>;
};

type Props = {
  resolved: ResolvedElement;
  children: React.ReactNode;
};

// ═══════════════════════════════════════════════════════════════
// WRAPPER
// ═══════════════════════════════════════════════════════════════

export function ElementLinkWrapper({ resolved, children }: Props) {
  const link = resolved.settings.link as LinkData | null | undefined;

  if (!link) return <>{children}</>;

  switch (link.type) {
    case "url": {
      const p = link.payload as { href: string; openInNewTab?: boolean };
      return (
        <a
          href={p.href}
          target={p.openInNewTab ? "_blank" : undefined}
          rel={p.openInNewTab ? "noopener noreferrer" : undefined}
          style={{ color: "inherit", textDecoration: "inherit", display: "block" }}
        >
          {children}
        </a>
      );
    }

    case "email": {
      const p = link.payload as { email: string; subject?: string };
      const href = `mailto:${p.email}${p.subject ? `?subject=${encodeURIComponent(p.subject)}` : ""}`;
      return (
        <a href={href} style={{ color: "inherit", textDecoration: "inherit", display: "block" }}>
          {children}
        </a>
      );
    }

    case "phone": {
      const p = link.payload as { phone: string };
      return (
        <a href={`tel:${p.phone.replace(/\s/g, "")}`} style={{ color: "inherit", textDecoration: "inherit", display: "block" }}>
          {children}
        </a>
      );
    }

    case "document": {
      const p = link.payload as { fileUrl: string; fileName?: string; filePublicId?: string; fileDescription?: string };
      return (
        <MorphModal
          title={p.fileName || "Dokument"}
          subtitle="Dokument"
          cardContent={children}
          bodyContent={<PdfViewer fileUrl={p.fileUrl} />}
          ctaLabel="Visa"
          ctaUrl={p.fileUrl ? pdfViewerUrl(p.fileUrl) : undefined}
          footerExtra={p.fileDescription ? <p className="morph-modal__content">{p.fileDescription}</p> : undefined}
        />
      );
    }

    case "contact": {
      const p = link.payload as ContactFields;
      return (
        <MorphModal
          title={p.contactName || "Kontaktuppgifter"}
          cardContent={children}
          bodyContent={<ContactBodyContent contact={p} />}
        />
      );
    }

    case "text": {
      const p = link.payload as { title?: string; content: string };
      return (
        <MorphModal
          title={p.title || ""}
          cardContent={children}
          bodyContent={<p className="morph-modal__content">{p.content}</p>}
        />
      );
    }

    default:
      return <>{children}</>;
  }
}

// ═══════════════════════════════════════════════════════════════
// PDF VIEWER — Same pattern as DocumentCard.tsx
// ═══════════════════════════════════════════════════════════════

function pdfPageUrl(fileUrl: string, page: number): string {
  return fileUrl.replace("/upload/", `/upload/pg_${page},w_600,f_jpg/`);
}

function pdfViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=false`;
}

const MAX_PAGES = 50;

function PdfViewer({ fileUrl }: { fileUrl: string }) {
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [discovering, setDiscovering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let page = 2;

    const probe = () => {
      if (cancelled || page > MAX_PAGES) { setDiscovering(false); return; }
      const img = new Image();
      const p = page;
      img.onload = () => {
        if (cancelled) return;
        setTotalPages(p);
        page++;
        probe();
      };
      img.onerror = () => {
        if (!cancelled) setDiscovering(false);
      };
      img.src = pdfPageUrl(fileUrl, p);
    };

    probe();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pg = Number(entry.target.getAttribute("data-page"));
            if (pg) setCurrentPage(pg);
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    const imgs = pageRefs.current;
    imgs.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [totalPages]);

  const setPageRef = useCallback((page: number, el: HTMLImageElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (!fileUrl) return null;

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {totalPages > 1 && (
        <div className="pdf-viewer__counter">
          {currentPage} av {totalPages}
        </div>
      )}
      <div className="pdf-viewer__pages">
        {pages.map((pg) => (
          <img
            key={pg}
            ref={(el) => setPageRef(pg, el)}
            data-page={pg}
            src={pdfPageUrl(fileUrl, pg)}
            alt={`Sida ${pg}`}
            className="pdf-viewer__page-img"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTACT BODY — Same layout as ContactCard.tsx
// ═══════════════════════════════════════════════════════════════

type ContactFields = {
  contactName?: string;
  phone1Prefix?: string; phone1Number?: string;
  phone2Prefix?: string; phone2Number?: string;
  fax1Prefix?: string; fax1Number?: string;
  fax2Prefix?: string; fax2Number?: string;
  addressLine1?: string; addressLine2?: string;
  city?: string; country?: string; zip?: string;
  notes?: string;
};

const EmailIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM203.43,64,128,133.15,52.57,64ZM216,192H40V74.19l82.59,75.71a8,8,0,0,0,10.82,0L216,74.19V192Z" /></svg>
);
const PhoneIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06l0-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46ZM176,208A128.14,128.14,0,0,1,48,80,40.2,40.2,0,0,1,82.87,40a.61.61,0,0,0,0,.12l21,47L83.2,111.86a6.13,6.13,0,0,0-.57.77,16,16,0,0,0-1,15.7c9.06,18.53,27.73,37.06,46.46,46.11a16,16,0,0,0,15.75-1.14,8.44,8.44,0,0,0,.74-.56L168.89,152l47,21.05h0s.08,0,.11,0A40.21,40.21,0,0,1,176,208Z" /></svg>
);
const MapIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z" /></svg>
);
const ClockIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" /></svg>
);

function ContactBodyContent({ contact: c }: { contact: ContactFields }) {
  const emails: { dept?: string; email: string }[] = [];
  if (c.phone1Number) emails.push({ dept: c.phone1Prefix, email: c.phone1Number });
  if (c.phone2Number) emails.push({ dept: c.phone2Prefix, email: c.phone2Number });

  const phones: { dept?: string; phone: string }[] = [];
  if (c.fax1Number) phones.push({ dept: c.fax1Prefix, phone: c.fax1Number });
  if (c.fax2Number) phones.push({ dept: c.fax2Prefix, phone: c.fax2Number });

  const addressParts: string[] = [];
  if (c.addressLine1) addressParts.push(c.addressLine1);
  if (c.addressLine2) addressParts.push(c.addressLine2);
  const zipCity = [c.zip, c.city].filter(Boolean).join(" ");
  if (zipCity) addressParts.push(zipCity);
  if (c.country) addressParts.push(c.country);

  const hasGeneral = emails.length > 0 || phones.length > 0 || c.notes;
  const hasAddress = addressParts.length > 0;

  if (!hasGeneral && !hasAddress) return null;

  return (
    <div className="contact-body">
      {c.contactName && (
        <h2 style={{
          fontFamily: "var(--font-heading)",
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text, #1a1a1a)",
          margin: 0,
          marginTop: "1.5rem",
          lineHeight: 1.3,
          textAlign: "center",
        }}>{c.contactName}</h2>
      )}
      {hasGeneral && (
        <div className="contact-body__card">
          {emails.length > 0 && (
            <div className="contact-body__section">
              <div className="contact-body__icon">{EmailIcon}</div>
              <div className="contact-body__info">
                {emails.map((e, i) => (
                  <div key={i} className="contact-body__entry">
                    {e.dept && <span className="contact-body__dept">{e.dept}</span>}
                    <a href={`mailto:${e.email}`} className="contact-body__value">{e.email}</a>
                  </div>
                ))}
              </div>
            </div>
          )}
          {phones.length > 0 && (
            <div className="contact-body__section">
              <div className="contact-body__icon">{PhoneIcon}</div>
              <div className="contact-body__info">
                {phones.map((p, i) => (
                  <div key={i} className="contact-body__entry">
                    {p.dept && <span className="contact-body__dept">{p.dept}</span>}
                    <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="contact-body__value">{p.phone}</a>
                  </div>
                ))}
              </div>
            </div>
          )}
          {c.notes && (
            <div className="contact-body__section">
              <div className="contact-body__icon">{ClockIcon}</div>
              <div className="contact-body__info">
                <p className="contact-body__text">{c.notes}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {hasAddress && (
        <div className="contact-body__card">
          <div className="contact-body__section">
            <div className="contact-body__icon">{MapIcon}</div>
            <div className="contact-body__info">
              <p className="contact-body__text">
                {addressParts.map((line, i) => (
                  <span key={i}>{line}{i < addressParts.length - 1 && <br />}</span>
                ))}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
