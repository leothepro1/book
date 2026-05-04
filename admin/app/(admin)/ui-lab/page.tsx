'use client';

import { useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Calendar,
  Card,
  Checkbox,
  Choicebox,
  ChoiceboxGroup,
  EmptyState,
  Input,
  Menu,
  Modal,
  Radio,
  SearchInput,
  SearchSelect,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Tabs,
  Tooltip,
  Textarea,
  ToastProvider,
  Toggle,
  useToast,
  type ButtonSize,
  type ButtonVariant,
  type DateRange,
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
          <ButtonRow label="Loading (klicka för att trigga)">
            {SIZES.map((size) => (
              <LoadingDemoButton key={size} size={size}>
                Spara
              </LoadingDemoButton>
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

      <Section title="Calendar" status="in-progress">
        Trigger formad som en input. Klick öppnar en portalerad
        månadsvy som auto-flippar drop-down/drop-up beroende på
        utrymme. Två lägen — single + range — och svenska lokalen
        bakad in via <code>Intl.DateTimeFormat</code>.
        <div className="ui-lab__grid">
          <ButtonRow label="Single date">
            <CalendarSingleDemo />
          </ButtonRow>
          <ButtonRow label="Date range">
            <CalendarRangeDemo />
          </ButtonRow>
          <ButtonRow label="Disabled">
            <Calendar mode="single" placeholder="Inaktiverad" disabled />
          </ButtonRow>
          <ButtonRow label="Min/Max bounds">
            <CalendarBoundedDemo />
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

      <Section title="SearchInput" status="in-progress">
        Sökfält. Plattformens enda input som använder en egen
        SVG-ikon (Geist-style) istället för Material Symbols. Delar
        chrome (border, fokus-ring, error-halo, hover, disabled)
        med <code>Input</code> via <code>--textarea-*</code>-tokens.
        Tre storlekar matchar <code>Input</code>:s höjder exakt
        (32 / 40 / 48).
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <SearchInputDemo />
        </div>
      </Section>

      <Section title="SearchSelect" status="in-progress">
        <code>SearchInput</code> + dropdown med predictiva träffar.
        Komponerar tre primitiver: <code>SearchInput</code> för
        chrome, <code>Checkbox</code> för multi-select, och samma
        portal-positionering / dismissal-kontrakt som{' '}
        <code>Menu</code> och <code>Calendar</code> (drop-down /
        drop-up auto-flip, stänger på scroll). Filtrering äger
        anroparen — vi tar emot redan filtrerade items.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 480 }}>
          <SearchSelectSingleDemo />
          <SearchSelectMultiDemo />
          <SearchSelectSmallDemo />
        </div>
      </Section>

      <Section title="Skeleton" status="in-progress">
        Shimmer-effekt för platshållare. Komponenten är{' '}
        <em>själva effekten</em> — dimensioner och layout sätts per
        instans. Avatar (40×40, <code>radius=&quot;full&quot;</code>) +
        innehållsblock (40px högt) bredvid varandra.
        <div className="ui-lab__grid">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={40} height={40} radius="full" />
            <Skeleton width={240} height={40} />
          </div>
        </div>
      </Section>

      <Section title="EmptyState" status="in-progress">
        Centrerad placeholder för vyer utan innehåll. Båda flavors
        delar samma slots — ikon + titel + brödtext.
        <em>Informational</em> lägger på två sm-knappar bredvid
        varandra: primary till vänster, secondary till höger, 8px
        gap. Knapp-varianterna är låsta i komponenten — alla empty
        states i admin läses som ett mönster.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 480 }}>
          <SwitchSizeRow label="Blank slate">
            <Card elevation="flat">
              <EmptyState
                icon="inbox"
                title="Inga ordrar än"
                description="Ordrar visas här när dina första gäster bokar."
              />
            </Card>
          </SwitchSizeRow>
          <SwitchSizeRow label="Informational — 1 knapp">
            <Card elevation="flat">
              <EmptyState
                icon="bookmark_added"
                title="Inga rabatter aktiva"
                description="Skapa kampanjer och rabattkoder för att driva fler bokningar under lågsäsong."
                primaryAction={{ label: 'Skapa rabatt', href: '/discounts/new' }}
              />
            </Card>
          </SwitchSizeRow>
          <SwitchSizeRow label="Informational — 2 knappar">
            <Card elevation="flat">
              <EmptyState
                icon="inventory_2"
                title="Inga produkter än"
                description="Bygg din katalog med boenden, paket eller tilläggstjänster — sedan visar du dem på din sida."
                primaryAction={{ label: 'Skapa produkt', href: '/products/new' }}
                secondaryAction={{ label: 'Läs guiden', href: '/help/products' }}
              />
            </Card>
          </SwitchSizeRow>
        </div>
      </Section>

      <Section title="Card" status="in-progress">
        Surface-container. Alla 4 varianter delar bg (#fff), radius
        (.75rem) och padding — bara <code>elevation</code> varierar:
        progressiv lyft från ren chrome (<code>flat</code>) till
        modal-likt fritt (<code>lg</code>). Default är{' '}
        <code>sm</code> (typisk standard-card-känsla). Header,
        sektioner och dividers komponerar konsumenten själv inuti.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 480 }}>
          <SwitchSizeRow label="elevation=flat">
            <Card elevation="flat">
              <strong>Flat</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--admin-text-secondary)' }}>
                Bara hairline-ringar — ingen lyft. För täta listor där
                staplade shadows skulle slåss.
              </p>
            </Card>
          </SwitchSizeRow>
          <SwitchSizeRow label="elevation=sm (default)">
            <Card elevation="sm">
              <strong>Subtle</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--admin-text-secondary)' }}>
                Standard-card-lyft. Ett 2px tight shadow + ringarna.
              </p>
            </Card>
          </SwitchSizeRow>
          <SwitchSizeRow label="elevation=md">
            <Card elevation="md">
              <strong>Floating</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--admin-text-secondary)' }}>
                4-lagers mid-distans shadow. Hover-state, flytande paneler.
              </p>
            </Card>
          </SwitchSizeRow>
          <SwitchSizeRow label="elevation=lg">
            <Card elevation="lg">
              <strong>Overlay</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--admin-text-secondary)' }}>
                5-lagers dramatiskt shadow. Modal-likt, popping cards.
              </p>
            </Card>
          </SwitchSizeRow>
        </div>
      </Section>

      <Section title="Tabs" status="in-progress">
        Horisontell tab-rad. Aktiv tab har 2px mörk underline som
        visuellt ersätter den 1px gråa regeln under hela raden via
        ett <code>-1px margin-bottom</code> per tab. Komponenten äger
        bara nav-baren — innehållet renderar konsumenten själv
        baserat på <code>value</code>. Tangentbord: ←/→ wraps,
        Home/End hoppar, disabled-tabs hoppas över. Endast aktiv tab
        ligger i tab-ordning; pilar flyttar fokus + aktiverar.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SwitchSizeRow label="Standard">
            <TabsDemo />
          </SwitchSizeRow>
          <SwitchSizeRow label="Med disabled">
            <TabsWithDisabledDemo />
          </SwitchSizeRow>
        </div>
      </Section>

      <Section title="Switch" status="in-progress">
        Segmenterad single-select. iOS-style sliding indicator —
        lyft från editorns <code>SegmentedControl</code> med
        tokeniserade färger/skuggor, tre storlekar, controlled +
        uncontrolled, riktig <code>radiogroup</code>-ARIA. Skiljer
        sig från <code>Toggle</code> som är binär on/off.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <SwitchSizeRow label="sm">
            <SwitchDemo size="sm" />
          </SwitchSizeRow>
          <SwitchSizeRow label="md">
            <SwitchDemo size="md" />
          </SwitchSizeRow>
          <SwitchSizeRow label="lg">
            <SwitchDemo size="lg" />
          </SwitchSizeRow>
          <SwitchSizeRow label="3 alternativ">
            <SwitchDemo size="md" options={[
              { value: 'day', label: 'Dag' },
              { value: 'week', label: 'Vecka' },
              { value: 'month', label: 'Månad' },
            ]} />
          </SwitchSizeRow>
          <SwitchSizeRow label="Disabled">
            <SwitchDemo size="md" disabled />
          </SwitchSizeRow>
        </div>
      </Section>

      <Section title="Slider" status="in-progress">
        Single-value horisontal range med dragbar handle.
        Lyft-och-flytta från editorns <code>FieldRange</code> —
        samma visuella kontrakt (4px track, 15px thumb, hover-halo,
        pin-tooltip), plus uncontrolled-stöd, tangentbordsnav
        (←/→/↑/↓/Home/End/PageUp/PageDown) och korrekt{' '}
        <code>role=&quot;slider&quot;</code>-ARIA. Number-input
        bredvid är opt-out via <code>showInput=&#123;false&#125;</code>.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <SwitchSizeRow label="Med input + enhet (px)">
            <SliderDemo unit="px" min={0} max={100} defaultValue={32} />
          </SwitchSizeRow>
          <SwitchSizeRow label="Utan input">
            <SliderDemo showInput={false} min={0} max={100} defaultValue={64} />
          </SwitchSizeRow>
          <SwitchSizeRow label="Procent (steg 5)">
            <SliderDemo unit="%" min={0} max={100} step={5} defaultValue={50} />
          </SwitchSizeRow>
          <SwitchSizeRow label="Disabled">
            <SliderDemo unit="px" min={0} max={100} defaultValue={40} disabled />
          </SwitchSizeRow>
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

      <Section title="Radio" status="in-progress">
        Round single-select. Speglar <code>Checkbox</code>-strukturen
        exakt — samma row, samma sm/md/lg-storlekar (16/18/22),
        samma hover-regel (bara unchecked darknar). Mörk inre dot
        som skalas in från <code>0 → 1</code> via cubic-bezier
        (samma kurva som Switch&apos;s indikator). Visuell
        referens: <code>.disc-radio</code> i rabattkods-formuläret.
        <div className="ui-lab__grid">
          <RadioGroupDemo />
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
        Tooltip primitive med full timing-modell — 200ms enter, 50ms
        scanning, 800ms same-element cooldown, 600ms click suppress,
        80ms exit grace. Auto-flip vertikalt om utrymmet tar slut.
        Mörk pill med 8×8 roterad arrow; tokeniserad så dark mode
        flippar till ljus pill med mörk text. <em>Hovra triggers
        nedan</em>.
        <div className="ui-lab__grid">
          <ButtonRow label="Top">
            <Tooltip label="Skapa ny produkt" placement="top">
              <Button variant="secondary" size="sm">Hovra</Button>
            </Tooltip>
          </ButtonRow>
          <ButtonRow label="Bottom (default)">
            <Tooltip label="Spara ändringarna">
              <Button variant="secondary" size="sm">Hovra</Button>
            </Tooltip>
          </ButtonRow>
          <ButtonRow label="På icon-only-button">
            <Tooltip label="Fler val">
              <Button variant="ghost" size="sm" leadingIcon="more_horiz" aria-label="Fler val" />
            </Tooltip>
            <Tooltip label="Ta bort">
              <Button variant="ghost" size="sm" leadingIcon="delete" aria-label="Ta bort" />
            </Tooltip>
            <Tooltip label="Duplicera">
              <Button variant="ghost" size="sm" leadingIcon="content_copy" aria-label="Duplicera" />
            </Tooltip>
          </ButtonRow>
          <ButtonRow label="På disabled (auto-detected)">
            <Tooltip label="Visas inte — barnet är disabled">
              <Button variant="primary" size="sm" disabled>Disabled</Button>
            </Tooltip>
          </ButtonRow>
          <ButtonRow label="disabled prop">
            <Tooltip label="Visas inte — disabled prop" disabled>
              <Button variant="secondary" size="sm">Hovra (visas inte)</Button>
            </Tooltip>
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
            <Badge variant="success">Aktiv</Badge>
            <Badge variant="info">Utkast</Badge>
            <Badge variant="warning">Väntande</Badge>
            <Badge variant="attention">Pågående</Badge>
            <Badge variant="critical">Problem</Badge>
            <Badge variant="neutral">Arkiverad</Badge>
          </ButtonRow>
        </div>
      </Section>

      <Section title="Banner" status="in-progress">
        Inline status-container i full bredd. Tre varianter — success
        / warning / error — delar chrome (radius, padding, font, gap)
        och skiljer sig bara i färgton. Ikon till vänster och CTA
        till höger är valfria och sätts per call-site; CTA:n
        renderas som en länk styled exakt som brödtexten med en
        underline som affordance. <code>error</code> får{' '}
        <code>role=&quot;alert&quot;</code>, övriga{' '}
        <code>role=&quot;status&quot;</code>.
        <div className="ui-lab__grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SwitchSizeRow label="Bara text">
            <Banner variant="success">Inställningarna sparades</Banner>
            <Banner variant="warning">Du närmar dig din månadsgräns</Banner>
            <Banner variant="error">Det gick inte att spara — försök igen</Banner>
          </SwitchSizeRow>
          <SwitchSizeRow label="Med ikon">
            <Banner variant="success" icon="check_circle">
              Bokningen är bekräftad
            </Banner>
            <Banner variant="warning" icon="warning">
              Tillgängligheten är låg för valt datum
            </Banner>
            <Banner variant="error" icon="error">
              Anslutningen till PMS är nere
            </Banner>
          </SwitchSizeRow>
          <SwitchSizeRow label="Med CTA">
            <Banner
              variant="success"
              cta={{ label: 'Visa orderdetaljer', href: '#order' }}
            >
              Order #1042 har skickats
            </Banner>
            <Banner
              variant="warning"
              cta={{ label: 'Uppgradera', href: '#billing' }}
            >
              Du har använt 90 % av din månadskvot
            </Banner>
            <Banner
              variant="error"
              cta={{ label: 'Lös problemet', href: '#integrations' }}
            >
              Stripe-kontot är inte aktiverat
            </Banner>
          </SwitchSizeRow>
          <SwitchSizeRow label="Ikon + CTA">
            <Banner
              variant="success"
              icon="check_circle"
              cta={{ label: 'Visa', href: '#booking' }}
            >
              Bokningen är synkad till Mews
            </Banner>
            <Banner
              variant="warning"
              icon="warning"
              cta={{ label: 'Läs mer', href: '#help' }}
            >
              Avtalet löper ut om 14 dagar
            </Banner>
            <Banner
              variant="error"
              icon="error"
              cta={{ label: 'Felsök', href: '#diagnostics' }}
            >
              Senaste betalningen misslyckades
            </Banner>
          </SwitchSizeRow>
        </div>
      </Section>

      <Section title="Menu" status="in-progress">
        Action-meny som öppnas vid klick på trigger. Stänger på
        ESC, klick utanför, eller item-val. Items kan ha ikon,
        danger-tone eller disabled. <code>&lt;Menu.Divider /&gt;</code>
        för visuell separation. <code>prefix</code> = ikon till
        vänster, <code>suffix</code> = fri ReactNode till höger
        (kortkommando, badge, ikon).
        <div className="ui-lab__grid" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Menu trigger={<Button variant="secondary" trailingIcon="expand_more">Mer</Button>}>
            <Menu.Item onSelect={() => {}}>Redigera</Menu.Item>
            <Menu.Item onSelect={() => {}}>Duplicera</Menu.Item>
            <Menu.Item onSelect={() => {}}>Arkivera</Menu.Item>
            <Menu.Item variant="danger" onSelect={() => {}}>Ta bort</Menu.Item>
          </Menu>
          <Menu trigger={<Button variant="secondary" trailingIcon="expand_more">Prefix</Button>}>
            <Menu.Item prefix="edit" onSelect={() => {}}>Redigera</Menu.Item>
            <Menu.Item prefix="content_copy" onSelect={() => {}}>Duplicera</Menu.Item>
            <Menu.Item prefix="archive" onSelect={() => {}}>Arkivera</Menu.Item>
            <Menu.Divider />
            <Menu.Item prefix="delete" variant="danger" onSelect={() => {}}>Ta bort</Menu.Item>
          </Menu>
          <Menu trigger={<Button variant="secondary" trailingIcon="expand_more">Suffix</Button>}>
            <Menu.Item suffix="⌘E" onSelect={() => {}}>Redigera</Menu.Item>
            <Menu.Item suffix="⌘D" onSelect={() => {}}>Duplicera</Menu.Item>
            <Menu.Item suffix={<Badge variant="info">Ny</Badge>} onSelect={() => {}}>Mall</Menu.Item>
            <Menu.Item suffix={<span className="material-symbols-rounded">open_in_new</span>} onSelect={() => {}}>Öppna i ny flik</Menu.Item>
          </Menu>
          <Menu trigger={<Button variant="ghost" leadingIcon="more_horiz" aria-label="Fler val" />}>
            <Menu.Item onSelect={() => {}}>Visa</Menu.Item>
            <Menu.Item onSelect={() => {}}>Kopiera länk</Menu.Item>
            <Menu.Item disabled onSelect={() => {}}>Disabled</Menu.Item>
          </Menu>
          <Menu
            size="sm"
            trigger={<Button variant="secondary" size="sm" trailingIcon="expand_more">SM</Button>}
          >
            <Menu.Item prefix="edit" onSelect={() => {}}>Redigera</Menu.Item>
            <Menu.Item prefix="content_copy" onSelect={() => {}}>Duplicera</Menu.Item>
            <Menu.Item prefix="archive" onSelect={() => {}}>Arkivera</Menu.Item>
            <Menu.Divider />
            <Menu.Item prefix="delete" variant="danger" onSelect={() => {}}>Ta bort</Menu.Item>
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

const ROOM_OPTIONS = [
  { id: 'cabin-s', label: 'Stuga Liten (2 personer)' },
  { id: 'cabin-m', label: 'Stuga Mellan (4 personer)' },
  { id: 'cabin-l', label: 'Stuga Stor (6 personer)' },
  { id: 'apartment', label: 'Lägenhet (4 personer)' },
  { id: 'campsite', label: 'Campingplats el-uttag' },
  { id: 'campsite-no', label: 'Campingplats utan el', disabled: true },
];

const DEFAULT_SWITCH_OPTIONS = [
  { value: 'list', label: 'Lista' },
  { value: 'grid', label: 'Rutnät' },
];

function SwitchDemo({
  size = 'md',
  options = DEFAULT_SWITCH_OPTIONS,
  disabled = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  options?: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [value, setValue] = useState(options[0]?.value ?? '');
  return (
    <Switch
      size={size}
      options={options}
      value={value}
      onChange={setValue}
      disabled={disabled}
      aria-label="Vy"
    />
  );
}

function SliderDemo({
  min = 0,
  max = 100,
  step = 1,
  unit,
  defaultValue,
  showInput = true,
  disabled = false,
}: {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  showInput?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? min);
  return (
    <Slider
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      step={step}
      unit={unit}
      showInput={showInput}
      disabled={disabled}
      aria-label="Värde"
    />
  );
}

function TabsDemo() {
  const [tab, setTab] = useState('overview');
  return (
    <Tabs
      items={[
        { id: 'overview', label: 'Översikt' },
        { id: 'orders', label: 'Ordrar' },
        { id: 'guests', label: 'Gäster' },
        { id: 'settings', label: 'Inställningar' },
      ]}
      value={tab}
      onChange={setTab}
      aria-label="Hotellsektioner"
    />
  );
}

function TabsWithDisabledDemo() {
  const [tab, setTab] = useState('a');
  return (
    <Tabs
      items={[
        { id: 'a', label: 'Allmänt' },
        { id: 'b', label: 'Avancerat' },
        { id: 'c', label: 'Premium', disabled: true },
        { id: 'd', label: 'Loggar' },
      ]}
      value={tab}
      onChange={setTab}
      aria-label="Inställningar"
    />
  );
}

function SwitchSizeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function SearchSelectSingleDemo() {
  const [value, setValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const filtered = ROOM_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(value.toLowerCase()),
  );
  const selectedLabel = ROOM_OPTIONS.find((o) => o.id === selectedId)?.label;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>
        Single — välj boende
      </span>
      <SearchSelect
        value={value}
        onChange={setValue}
        items={filtered}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setValue(ROOM_OPTIONS.find((o) => o.id === id)?.label.toString() ?? '');
        }}
        placeholder="Sök boendetyp…"
      />
      {selectedLabel && (
        <span style={{ fontSize: 12, color: 'var(--admin-text-tertiary)' }}>
          Valt: {selectedLabel}
        </span>
      )}
    </div>
  );
}

function SearchSelectMultiDemo() {
  const [value, setValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filtered = ROOM_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(value.toLowerCase()),
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>
        Multi — välj flera boenden
      </span>
      <SearchSelect
        multiple
        value={value}
        onChange={setValue}
        items={filtered}
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        placeholder="Sök och kryssa…"
      />
      {selectedIds.length > 0 && (
        <span style={{ fontSize: 12, color: 'var(--admin-text-tertiary)' }}>
          {selectedIds.length} valda
        </span>
      )}
    </div>
  );
}

function SearchSelectSmallDemo() {
  const [value, setValue] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filtered = ROOM_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(value.toLowerCase()),
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>
        Small (32px) — multi
      </span>
      <SearchSelect
        size="sm"
        multiple
        value={value}
        onChange={setValue}
        items={filtered}
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        placeholder="Sök…"
      />
    </div>
  );
}

function SearchInputDemo() {
  const [a, setA] = useState('');
  const [b, setB] = useState('Förhand­sökning');
  const [c, setC] = useState('');
  return (
    <>
      <InputSizeRow label="sm">
        <SearchInput size="sm" value={a} onChange={setA} />
        <SearchInput size="sm" value={b} onChange={setB} />
        <SearchInput size="sm" disabled defaultValue="Låst" />
      </InputSizeRow>
      <InputSizeRow label="md">
        <SearchInput size="md" value={c} onChange={setC} />
        <SearchInput size="md" placeholder="Sök ordrar…" />
        <SearchInput size="md" invalid defaultValue="Fel" />
      </InputSizeRow>
      <InputSizeRow label="lg">
        <SearchInput size="lg" placeholder="Sök produkter…" />
        <SearchInput size="lg" defaultValue="Cabin" />
        <SearchInput size="lg" disabled placeholder="Sök…" />
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

function RadioGroupDemo() {
  const [discountType, setDiscountType] = useState<'percent' | 'amount' | 'free'>('percent');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  return (
    <>
      <ButtonRow label="Grupp (rabatttyp — md)">
        <Radio
          checked={discountType === 'percent'}
          onChange={() => setDiscountType('percent')}
          label="Procent"
        />
        <Radio
          checked={discountType === 'amount'}
          onChange={() => setDiscountType('amount')}
          label="Belopp"
        />
        <Radio
          checked={discountType === 'free'}
          onChange={() => setDiscountType('free')}
          label="Gratis frakt"
        />
      </ButtonRow>
      <ButtonRow label="Storlekar (sm/md/lg)">
        <Radio size="sm" checked={size === 'sm'} onChange={() => setSize('sm')} label="sm" />
        <Radio size="md" checked={size === 'md'} onChange={() => setSize('md')} label="md" />
        <Radio size="lg" checked={size === 'lg'} onChange={() => setSize('lg')} label="lg" />
      </ButtonRow>
      <ButtonRow label="Disabled">
        <Radio checked={false} onChange={() => {}} disabled label="Av (disabled)" />
        <Radio checked onChange={() => {}} disabled label="På (disabled)" />
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

function CalendarSingleDemo() {
  const [date, setDate] = useState<Date | null>(null);
  return (
    <Calendar
      mode="single"
      value={date}
      onChange={setDate}
      placeholder="Välj datum"
    />
  );
}

function CalendarRangeDemo() {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  return (
    <Calendar
      mode="range"
      value={range}
      onChange={setRange}
      placeholder="Välj datumintervall"
    />
  );
}

function CalendarBoundedDemo() {
  const today = new Date();
  const min = new Date(today);
  const max = new Date(today);
  max.setDate(max.getDate() + 14);
  const [date, setDate] = useState<Date | null>(null);
  return (
    <Calendar
      mode="single"
      value={date}
      onChange={setDate}
      placeholder="Inom 14 dagar"
      minDate={min}
      maxDate={max}
    />
  );
}

/**
 * Demo wrapper that flips a button into its loading state on click
 * and auto-reverts after `durationMs` so the CTA→spinner transition
 * can be triggered repeatedly without page reload. Used only by the
 * Loading row in the UI Lab — production buttons own their own
 * loading state via the `loading` prop.
 */
function LoadingDemoButton({
  size,
  children,
  durationMs = 2500,
}: {
  size: ButtonSize;
  children: React.ReactNode;
  durationMs?: number;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="primary"
      size={size}
      loading={loading}
      onClick={() => {
        if (loading) return;
        setLoading(true);
        window.setTimeout(() => setLoading(false), durationMs);
      }}
    >
      {children}
    </Button>
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
