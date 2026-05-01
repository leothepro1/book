'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Choicebox,
  ChoiceboxGroup,
  Input,
  Menu,
  Modal,
  Spinner,
  Textarea,
  ToastProvider,
  Toggle,
  useToast,
  type ButtonSize,
  type ButtonVariant,
  type ModalVariant,
} from '@/app/(admin)/_components/ui';
import './ui-lab.css';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'accent', 'ghost', 'danger'];
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
    <ToastProvider>
      <UILabPageInner />
    </ToastProvider>
  );
}

function UILabPageInner() {
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
                <Button key={variant} variant={variant} size={size}>
                  {cap(variant)}
                </Button>
              ))}
            </ButtonRow>
          ))}
          <ButtonRow label="Loading">
            {SIZES.map((size) => (
              <Button key={size} variant="primary" size={size} loading>
                Sparar
              </Button>
            ))}
          </ButtonRow>
          <ButtonRow label="Disabled">
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} disabled>
                Disabled
              </Button>
            ))}
          </ButtonRow>
        </div>
      </Section>

      <Section title="Modal" status="in-progress">
        Tre varianter — alla delar overlay, transition, shape och
        shadow. Skillnaden ligger i scrollbeteende och footer-layout.
        <div className="ui-lab__grid">
          <ButtonRow label="Default">
            <ModalDemo variant="default" />
          </ButtonRow>
          <ButtonRow label="Sticky">
            <ModalDemo variant="sticky" />
          </ButtonRow>
          <ButtonRow label="Single button">
            <ModalDemo variant="single-button" />
          </ButtonRow>
        </div>
      </Section>

      <Section title="Spinner" status="in-progress">
        iOS-style activity indicator. 12 staplar, 1s cykel, fade
        opacity 1 → 0.15 i staggered rotation. Färgen följer{' '}
        <code>currentColor</code> — matchar all kontext utan per-
        variant overrides.
        <div className="ui-lab__grid">
          <ButtonRow label="Storlekar">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <Spinner size={48} />
          </ButtonRow>
          <ButtonRow label="Färg via currentColor">
            <span style={{ color: '#0072F5', display: 'inline-flex' }}>
              <Spinner />
            </span>
            <span style={{ color: '#DA2F35', display: 'inline-flex' }}>
              <Spinner />
            </span>
            <span style={{ color: '#171717', display: 'inline-flex' }}>
              <Spinner />
            </span>
          </ButtonRow>
        </div>
      </Section>

      <Section title="Toast" status="in-progress">
        8 varianter, gemensam chrome (radius 16, font-size 14, padding
        16, 5-stack shadow), close-knapp till höger. Coloured variants
        (success/warning/error) byter bg + fg; action-varianten har
        ingen close och ingen auto-dismiss — kräver klick på en av
        två knappar bottom-right.
        <div className="ui-lab__grid">
          <ToastTriggers />
        </div>
      </Section>

      <Section title="Checkbox" status="in-progress">
        Square checkbox med 4px radius, animerad SVG stroke-draw.
        Hover-effekt (mörkare border) gäller bara när unchecked —
        active state förblir oförändrad vid hover.
        <div className="ui-lab__grid">
          <CheckboxRow />
        </div>
      </Section>

      <Section title="Toggle" status="in-progress">
        iOS-style switch — blå on (<code>--admin-toggle-on</code>),
        grå off, vit thumb, check-ikon vid active. Två storlekar:
        <code>md</code> (43×24, default) och <code>sm</code> (36×20).
        <div className="ui-lab__grid">
          <ToggleRow label="md" size="md" />
          <ToggleRow label="sm" size="sm" />
          <ButtonRow label="Disabled">
            <Toggle checked={false} onChange={() => {}} disabled aria-label="Off disabled" />
            <Toggle checked onChange={() => {}} disabled aria-label="On disabled" />
          </ButtonRow>
        </div>
      </Section>

      <Section title="Tooltip" status="in-progress">
        Existerande tooltip-komponenten (<code>app/_components/Tooltip.tsx</code>)
        med full hover-timing — här statiskt renderad utan hover så
        designen kan granskas direkt. Mörk pill, vit text 12px, 8×8
        roterad arrow.
        <div className="ui-lab__grid">
          <ButtonRow label="Tooltip">
            <StaticTooltip label="Skapa ny produkt" placement="bottom" />
          </ButtonRow>
        </div>
      </Section>

      <Section title="Textarea" status="in-progress">
        Multi-line input. Grunden för alla framtida textareas — label,
        helpText, error och char count är sibling-concerns som
        composern äger.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <TextareaDemo />
        </div>
      </Section>

      <Section title="Choicebox" status="in-progress">
        Större tap-target än Radio/Checkbox med titel + beskrivning.
        Tre varianter: single-select (radio-grupp), multi-select
        (checkbox-grupp), och disabled state.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 480 }}>
          <ChoiceboxDemos />
        </div>
      </Section>

      <Section title="Badge" status="in-progress">
        Status-pillar för listor och detalj-vyer. Sex toner som
        täcker alla nuvarande status-färger i admin (produkter,
        ordrar, kunder).
        <div className="ui-lab__grid">
          <ButtonRow label="Tones">
            <Badge tone="success">Aktiv</Badge>
            <Badge tone="info">Utkast</Badge>
            <Badge tone="warning">Väntande</Badge>
            <Badge tone="attention">Pågående</Badge>
            <Badge tone="critical">Problem</Badge>
            <Badge tone="neutral">Arkiverad</Badge>
          </ButtonRow>
        </div>
      </Section>

      <Section title="Menu" status="in-progress">
        Action-meny som öppnas vid klick på trigger. Stänger på
        ESC, klick utanför, eller item-val. Items kan ha ikon,
        danger-tone eller disabled. <code>&lt;Menu.Divider /&gt;</code>
        för visuell separation.
        <div className="ui-lab__grid" style={{ display: 'flex', gap: 16 }}>
          <Menu trigger={<Button variant="secondary" trailingIcon="expand_more">Mer</Button>}>
            <Menu.Item onSelect={() => {}}>Redigera</Menu.Item>
            <Menu.Item onSelect={() => {}}>Duplicera</Menu.Item>
            <Menu.Item onSelect={() => {}}>Arkivera</Menu.Item>
            <Menu.Item tone="danger" onSelect={() => {}}>Ta bort</Menu.Item>
          </Menu>
          <Menu trigger={<Button variant="ghost" leadingIcon="more_horiz" aria-label="Fler val" />}>
            <Menu.Item onSelect={() => {}}>Visa</Menu.Item>
            <Menu.Item onSelect={() => {}}>Kopiera länk</Menu.Item>
            <Menu.Item disabled onSelect={() => {}}>Disabled</Menu.Item>
          </Menu>
        </div>
      </Section>

      <Section title="Input" status="in-progress">
        Single-line text input — visuellt identisk med Textarea
        (samma chrome, fokus-ring, error-halo, disabled-bg). Tre
        states: default, error, disabled.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <InputDemo />
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

function InputDemo() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  return (
    <>
      <InputSizeRow label="sm">
        <Input size="sm" aria-label="Default sm" placeholder="Skriv…" value={a} onChange={setA} />
        <Input size="sm" aria-label="Error sm" value="Fel" onChange={() => {}} invalid />
        <Input size="sm" aria-label="Disabled sm" disabled defaultValue="Låst" />
      </InputSizeRow>
      <InputSizeRow label="md">
        <Input size="md" aria-label="Default md" placeholder="Skriv…" value={b} onChange={setB} />
        <Input size="md" aria-label="Error md" value="Fel" onChange={() => {}} invalid />
        <Input size="md" aria-label="Disabled md" disabled defaultValue="Låst" />
      </InputSizeRow>
      <InputSizeRow label="lg">
        <Input size="lg" aria-label="Default lg" placeholder="Skriv…" value={c} onChange={setC} />
        <Input size="lg" aria-label="Error lg" value="Fel" onChange={() => {}} invalid />
        <Input size="lg" aria-label="Disabled lg" disabled defaultValue="Låst" />
      </InputSizeRow>
    </>
  );
}

function InputSizeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>
        {label}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function TextareaDemo() {
  const [val, setVal] = useState('');
  return (
    <>
      <Textarea
        aria-label="Default"
        placeholder="Beskriv din produkt…"
        value={val}
        onChange={setVal}
      />
      <Textarea
        aria-label="Error"
        value="Bara 3"
        onChange={() => {}}
        invalid
      />
      <Textarea
        aria-label="Disabled"
        disabled
        defaultValue="Det här fältet är låst."
      />
    </>
  );
}

function ToastTriggers() {
  const toast = useToast();
  return (
    <>
      <ButtonRow label="Default">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.show('Inställningar sparade')}
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="Multi-line">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show(
              'Det här är en längre notis som spänner över flera rader text för att visa hur radbrytning fungerar i en standard-toast.',
              { variant: 'multi-line' },
            )
          }
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="With JSX">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show(
              <>
                Produkten <strong>Apelviken Premium</strong> har sparats
                som utkast.
              </>,
              { variant: 'with-jsx' },
            )
          }
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="With link">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show(
              <>
                Bokningen är skapad.{' '}
                <a href="#order-details" onClick={(e) => e.preventDefault()}>
                  Visa orderdetaljer
                </a>
                .
              </>,
              { variant: 'with-link' },
            )
          }
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="Action">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show('Du har osparade ändringar. Vill du spara innan du fortsätter?', {
              variant: 'action',
              secondaryAction: { label: 'Avbryt', onClick: () => {} },
              primaryAction: { label: 'Spara', onClick: () => {} },
            })
          }
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="Success">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.success('Bokningen är bekräftad')}
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="Warning">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.warning('Tillgängligheten är låg')}
        >
          Visa
        </Button>
      </ButtonRow>
      <ButtonRow label="Error">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.error('Något gick fel — försök igen')}
        >
          Visa
        </Button>
      </ButtonRow>
    </>
  );
}

function ChoiceboxDemos() {
  const [single, setSingle] = useState('standard');
  const [multi, setMulti] = useState<string[]>(['breakfast']);
  return (
    <>
      <div>
        <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
          Single-select (radio)
        </span>
        <ChoiceboxGroup type="radio" value={single} onChange={setSingle} aria-label="Leveransmetod">
          <Choicebox
            value="standard"
            title="Standard"
            description="3–5 vardagar — ingen extra kostnad."
          />
          <Choicebox
            value="express"
            title="Express"
            description="Nästa dag före kl 12. + 49 kr."
          />
          <Choicebox
            value="pickup"
            title="Hämta i butik"
            description="Klart inom 1 timme. Gratis."
          />
        </ChoiceboxGroup>
      </div>

      <div>
        <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
          Multi-select (checkbox)
        </span>
        <ChoiceboxGroup type="checkbox" values={multi} onChange={setMulti} aria-label="Tillägg">
          <Choicebox
            value="breakfast"
            title="Frukost"
            description="Inkluderar buffé för alla gäster."
          />
          <Choicebox
            value="parking"
            title="Parkering"
            description="Reserverad plats vid hotellet."
          />
          <Choicebox
            value="cleaning"
            title="Daglig städning"
            description="Vardagar 09–11."
          />
        </ChoiceboxGroup>
      </div>

      <div>
        <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500, display: 'block', marginBottom: 8 }}>
          Disabled
        </span>
        <ChoiceboxGroup type="radio" value="b" onChange={() => {}} disabled aria-label="Inaktiverad grupp">
          <Choicebox value="a" title="Alternativ A" description="Hela gruppen är inaktiverad." />
          <Choicebox value="b" title="Alternativ B (vald)" description="Hela gruppen är inaktiverad." />
        </ChoiceboxGroup>
      </div>
    </>
  );
}

function CheckboxRow() {
  const [a, setA] = useState(false);
  const [b, setB] = useState(true);
  return (
    <>
      <ButtonRow label="Default">
        <Checkbox checked={a} onChange={setA} label="Kombineras med produktrabatter" />
        <Checkbox checked={b} onChange={setB} label="Kombineras med orderrabatter" />
      </ButtonRow>
      <ButtonRow label="Disabled">
        <Checkbox checked={false} onChange={() => {}} disabled label="Av (disabled)" />
        <Checkbox checked onChange={() => {}} disabled label="På (disabled)" />
      </ButtonRow>
      <ButtonRow label="Utan label">
        <Checkbox checked={false} onChange={() => {}} aria-label="Off" />
        <Checkbox checked onChange={() => {}} aria-label="On" />
      </ButtonRow>
    </>
  );
}

function ToggleRow({ label, size }: { label: string; size: 'sm' | 'md' }) {
  const [off, setOff] = useState(false);
  const [on, setOn] = useState(true);
  return (
    <ButtonRow label={label}>
      <Toggle checked={off} onChange={setOff} size={size} aria-label="Off" />
      <Toggle checked={on} onChange={setOn} size={size} aria-label="On" />
    </ButtonRow>
  );
}

/**
 * Static visual of the production Tooltip (`app/_components/Tooltip.tsx`).
 * Mirrors the inline styles in that component exactly so the design
 * here matches what the live tooltip will render — minus the portal,
 * hover timing, and click suppression. Used only for design review
 * in ui-lab. If the live Tooltip's visual changes, update both.
 */
function StaticTooltip({
  label,
  placement,
}: {
  label: string;
  placement: 'top' | 'bottom';
}) {
  const tooltipNode = (
    <div
      role="tooltip"
      style={{
        position: 'relative',
        background: '#1a1a1a',
        color: '#fff',
        fontSize: 12,
        fontWeight: 450,
        fontFamily: 'var(--admin-font)',
        lineHeight: 1,
        padding: '7px 9px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
      }}
    >
      {label}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: 8,
          height: 8,
          background: '#1a1a1a',
          borderRadius: 1,
          ...(placement === 'top' ? { bottom: -4 } : { top: -4 }),
        }}
      />
    </div>
  );

  const triggerNode = (
    <span
      style={{
        fontFamily: 'var(--admin-font)',
        fontSize: 13,
        color: 'var(--admin-text-secondary)',
        padding: '4px 8px',
        background: 'var(--admin-surface, #f5f5f5)',
        borderRadius: 4,
        border: '1px solid var(--admin-border, #ebebeb)',
      }}
    >
      Trigger
    </span>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {placement === 'top' ? tooltipNode : triggerNode}
      {placement === 'top' ? triggerNode : tooltipNode}
    </div>
  );
}

function ModalDemo({ variant }: { variant: ModalVariant }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Long body content so sticky-vs-default difference is visible.
  const bodyParagraphs = Array.from({ length: 12 }, (_, i) => (
    <p key={i}>
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
      eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Paragraf {i + 1}.
    </p>
  ));

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Öppna {variant}
      </Button>
      <Modal open={open} onClose={close} variant={variant}>
        <Modal.Header>
          {variant === 'default' && 'Default modal'}
          {variant === 'sticky' && 'Sticky header & footer'}
          {variant === 'single-button' && 'Bekräftelse'}
        </Modal.Header>
        <Modal.Body>
          {variant === 'sticky' && bodyParagraphs}
          {variant === 'default' && (
            <p>
              En kort förklaring som flödar tätt under titeln — typisk
              &quot;default&quot;-modal med informell header.
            </p>
          )}
          {variant === 'single-button' && (
            <p>
              Den här åtgärden går inte att ångra. Tryck på OK för att
              bekräfta att du har läst informationen.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          {variant === 'single-button' ? (
            <Button variant="secondary" onClick={close}>
              OK
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Avbryt
              </Button>
              <Button variant="primary" onClick={close}>
                Spara
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>
    </>
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
