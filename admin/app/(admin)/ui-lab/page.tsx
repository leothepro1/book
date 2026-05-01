'use client';

import { Button, type ButtonSize, type ButtonVariant } from '@/app/(admin)/_components/ui';
import './ui-lab.css';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * UI Lab — internal showcase page for `_components/ui/` primitives.
 *
 * Renders every variant / size / state of each promoted component
 * side-by-side so we can review visual diffs during Phase 1 promotion
 * (lift-and-shift) without bouncing through real admin pages.
 *
 * Not linked from the sidebar — accessed by direct URL `/ui-lab`.
 * Inherits admin auth from the `(admin)` route group.
 *
 * As each component is promoted, its section here is filled in
 * during the same promotion PR (per the contract in
 * `_components/ui/README.md`, §6 PR checklist).
 */

export default function UILabPage() {
  return (
    <div className="ui-lab">
      <header className="ui-lab__header">
        <h1 className="ui-lab__title">UI Lab</h1>
        <p className="ui-lab__lede">
          Showcase för komponenter i{' '}
          <code>app/(admin)/_components/ui/</code>. Varje sektion visar
          en komponents alla varianter, storlekar och tillstånd.
          Sektioner fylls i som komponenterna promotas (Button →
          TextInput → Textarea → Checkbox → Toggle).
        </p>
      </header>

      <Section title="Button" status="in-progress">
        4 varianter · 3 storlekar · ikoner · loading · disabled · som
        både <code>&lt;button&gt;</code> och <code>&lt;Link&gt;</code>.
        <div className="ui-lab__grid">
          {SIZES.map((size) => (
            <ButtonRow key={size} label={`Size: ${size}`}>
              {VARIANTS.map((variant) => (
                <Button key={cap(variant)} variant={cap(variant)} size={size}>
                  {cap(variant)}
                </Button>
              ))}
            </ButtonRow>
          ))}
          <ButtonRow label="Med leading-ikon">
            {VARIANTS.map((variant) => (
              <Button key={cap(variant)} variant={cap(variant)} leadingIcon="add">
                Skapa
              </Button>
            ))}
          </ButtonRow>
          <ButtonRow label="Med trailing-ikon">
            {VARIANTS.map((variant) => (
              <Button key={cap(variant)} variant={cap(variant)} trailingIcon="arrow_forward">
                Nästa
              </Button>
            ))}
          </ButtonRow>
          <ButtonRow label="Loading">
            {VARIANTS.map((variant) => (
              <Button key={cap(variant)} variant={cap(variant)} loading>
                Sparar
              </Button>
            ))}
          </ButtonRow>
          <ButtonRow label="Disabled">
            {VARIANTS.map((variant) => (
              <Button key={cap(variant)} variant={cap(variant)} disabled>
                Disabled
              </Button>
            ))}
          </ButtonRow>
          <ButtonRow label="Som länk">
            <Button href="/ui-lab" variant="primary">
              Länk-knapp
            </Button>
            <Button href="/ui-lab" variant="ghost" leadingIcon="open_in_new">
              Öppna
            </Button>
          </ButtonRow>
          <ButtonRow label="Endast ikon">
            <Button variant="ghost" size="sm" leadingIcon="more_horiz" aria-label="Mer" />
            <Button variant="secondary" leadingIcon="settings" aria-label="Inställningar" />
            <Button variant="danger" size="lg" leadingIcon="delete" aria-label="Ta bort" />
          </ButtonRow>
        </div>
      </Section>

      <Section title="TextField" status="pending">
        Phase 1 PR efter Button.
      </Section>

      <Section title="Textarea" status="pending">
        Phase 1.
      </Section>

      <Section title="Checkbox" status="pending">
        Phase 1.
      </Section>

      <Section title="Toggle" status="pending">
        Phase 1 — sist p.g.a. drift mellan{' '}
        <code>base.css</code> och{' '}
        <code>_components/admin-page.css:96-106</code>.
      </Section>
    </div>
  );
}

function ButtonRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="ui-lab__grid-label">{label}</div>
      <div className="ui-lab__grid-cell">{children}</div>
    </>
  );
}

function Section({
  title,
  status,
  children,
}: {
  title: string;
  status: 'pending' | 'in-progress' | 'shipped';
  children: React.ReactNode;
}) {
  return (
    <section className="ui-lab__section">
      <header className="ui-lab__section-head">
        <h2 className="ui-lab__section-title">{title}</h2>
        <span className={`ui-lab__status ui-lab__status--${status}`}>
          {status === 'pending' ? 'Ej byggd' : status === 'in-progress' ? 'Under arbete' : 'Klar'}
        </span>
      </header>
      <div className="ui-lab__section-body">{children}</div>
    </section>
  );
}
