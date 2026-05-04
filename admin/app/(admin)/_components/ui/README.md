# Admin UI Component Library

The contract for `app/(admin)/_components/ui/`. This document is the
single source of truth for how admin UI components are built, named,
styled, and migrated. Read this end-to-end before opening a promotion
PR. If a rule here conflicts with what you're about to write, don't
write it — open a discussion to update the contract first.

Status: **Phase 1 in progress.** No components yet. Phase 1 promotion
order is locked: Button → TextInput → Textarea → Checkbox → Toggle.

---

## 1. Location and file structure

- Path: `app/(admin)/_components/ui/`
- Each component is co-located:

  ```
  ui/
    Button.tsx
    Button.css
    Button.test.tsx
  ```

- Importing:

  ```ts
  import { Button, TextField } from '@/app/(admin)/_components/ui';
  ```

- The barrel file `ui/index.ts` re-exports every component
  alphabetically. Add the export in the same PR that introduces the
  component — never separately.
- BEM class prefix: `.ui-<name>` (e.g. `.ui-btn`, `.ui-text-field__input`,
  `.ui-text-field--error`). Component CSS lives in its own `.css`
  file; never use Tailwind utility classes for component-internal
  styling, never inline `style={{ … }}` for design (only for
  computed positioning).

---

## 2. API conventions

### 2.1 Composite-first (Polaris-pattern)

Phase 1 components are **composite**: a single component owns label,
input, helpText, and error. There is no separate `<Field>` wrapper.

```jsx
<TextField
  label="Tenantnamn"
  helpText="Visas i emails och offentliga sidor."
  error={errors.name}
  required
/>
```

If a future case genuinely needs an unwrapped input (e.g. a custom
table-cell layout), split that single component into a compound API
at that point — never pre-split.

### 2.2 Common field props

Field-shaped components (Input, Textarea, Checkbox, Toggle, Calendar, …)
share this optional base:

```ts
type FieldBaseProps = {
  label?: ReactNode;                   // composite-mode label
  helpText?: ReactNode;                // descriptive text below control
  error?: ReactNode;                   // overrides helpText, implies invalid
  required?: boolean;                  // visual asterisk + aria-required
  disabled?: boolean;                  // visual + native disabled
  id?: string;                         // auto-generated if omitted
  name?: string;                       // form name
};
```

Input and Textarea use these props **optionally** to switch between
two render modes:

  - **Bare** — when no `label`/`helpText`/`error` is passed. Renders
    just the underlying `<input>` / `<textarea>`. Use this in table
    cells, custom row layouts, or wherever the page already provides
    label chrome.
  - **Composite** — when any of `label`, `helpText`, or `error` is
    passed. Renders a wrapping `<div className="ui-field">` with the
    label above the control and helper or error text below. The
    control's `id`, `aria-describedby`, and `aria-invalid` are wired
    automatically.

`error` accepts `ReactNode` (not just `string`) so messages can include
links or formatting:
`error={<>Pris saknas — <a href="/help/pricing">se prissättning</a></>}`

### 2.2.1 Width contract

Every form-field primitive defaults to `width: 100%` of its container.
This is the implicit contract — composing layouts (grid, flex, card)
control how wide a field becomes; the field itself never imposes an
intrinsic width. Components in this category:

  - `Input` — bare or composite; both default to 100%
  - `Textarea` — bare or composite; both default to 100%
  - `Calendar` — trigger expands to container; popover is fixed-width

Components that DON'T expand to 100% (intrinsic width):

  - `Button`, `Badge`, `Spinner`, `Toggle`, `Checkbox` — sized to
    their content; wrap in a flex/grid container or set
    `width: 100%` via `className` to expand

### 2.2.2 Variant vocabulary

The colour/intent prop is `variant` everywhere — `Button`, `Badge`,
`Toast`, `Menu.Item`, etc. Never `tone`, never `kind`, never
`appearance`. Components that don't have semantic colour variants
(Spinner, Modal, Calendar) simply omit the prop.

### 2.2.3 Size vocabulary

Components that vary in size accept `size: 'sm' | 'md' | 'lg'` —
`Button`, `Calendar`, `Checkbox`, `Input`, `Textarea`, `Toggle`.
The shared `Size` type is exported from `index.ts` for consumers
that need to forward the value. Components without sizing
(`Badge`, `Menu`, `Modal`, `Spinner`, `Toast`) intentionally omit
the prop — their visual is intrinsic to their content/use case.

### 2.3 TypeScript: discriminated unions, no spread

Variants are discriminated unions, not `variant?: string`:

```ts
type ButtonProps =
  | ({ variant: 'primary' } & ButtonBase)
  | ({ variant: 'danger' } & ButtonBase & { confirmLabel?: string })
  | ({ variant: 'ghost' } & ButtonBase);
```

**No `...rest` spread to underlying DOM.** Every prop the consumer
can pass is explicit. This prevents leaky abstractions where callers
discover undocumented behaviour by passing arbitrary HTML attributes.

The single allowed exception is `ref`, forwarded via `forwardRef`.

### 2.4 forwardRef

Every interactive component is wrapped with `React.forwardRef` so
callers can attach a ref (focus management, scroll-into-view,
measurement). The ref points at the most useful underlying DOM
element — usually the input itself, the button, or the modal root.

(React 19 supports `ref` as a regular prop, but the codebase already
uses `forwardRef` consistently — see `MenusClient.tsx:211`. Stay with
that until a separate PR migrates everything.)

### 2.5 Controlled and uncontrolled

Where the component represents value-holding state (input, checkbox,
toggle, select) it must support both controlled and uncontrolled
usage. Match React's native pattern: `value`/`onChange` controlled,
`defaultValue`/`defaultChecked` uncontrolled. Don't invent a new
state contract.

---

## 3. Dual-emit contract (Phase 1)

Every promoted component emits BOTH the new BEM class AND the legacy
`admin-<name>` class while migration is in progress:

```jsx
<button className="ui-btn ui-btn--primary admin-btn admin-btn--accent">
```

Why: existing call-sites still rely on `.admin-btn` styles. Dual-emit
lets us promote the component without forcing a synchronous
codebase-wide migration.

### 3.1 Sunset criterion (per component)

A component's sunset PR — the PR that removes dual-emit and deletes
the legacy classes from `base.css` — may ship only when:

```bash
grep -r "admin-<name>" app/   # returns 0
```

with `<name>` being the legacy class root (e.g. `admin-btn`,
`admin-input`, `admin-toggle`). The acceptance criterion is binary:
no occurrences in `app/`, dual-emit comes off in the same PR. Until
that grep is empty, dual-emit stays on.

### 3.2 Lift-and-shift, not redesign

Promotion PRs reproduce the legacy class's visual output exactly.
Same paddings, same shadows, same hover/active timings, same focus
behaviour. **No design changes in a promotion PR.** Visual changes
ship in a separate redesign PR after the component is fully migrated
and dual-emit has sunset.

If you find yourself wanting to "tweak just one thing" while
promoting, stop. File a follow-up issue, ship the lift-and-shift,
then redesign.

---

## 4. Allowed tokens

Components in `ui/` may only reference the CSS variables listed
below, all defined in `app/(admin)/base.css`. **No hardcoded hex,
no hardcoded px for spacing/radius, no inline shadow values.**

Adding a new token requires a separate PR that updates `base.css`
and this README's table — token additions never ship inside a
component PR.

### Surface
`--admin-bg`, `--admin-surface`, `--admin-surface-hover`,
`--admin-surface-active`, `--admin-surface-muted`,
`--admin-surface-sunken`

### Text
`--admin-text`, `--admin-text-secondary`, `--admin-text-tertiary`,
`--admin-text-muted`, `--admin-text-inverse`

### Border
`--admin-border`, `--admin-border-strong`, `--admin-border-focus`

### Accent / Primary / Danger
`--admin-accent`, `--admin-accent-hover`, `--admin-accent-text`,
`--admin-primary`, `--admin-primary-hover`, `--admin-primary-text`,
`--admin-danger`, `--admin-danger-tint`

### Toggle
`--admin-toggle-on`, `--admin-toggle-off`

### Input / focus
`--admin-input-focus`, `--admin-input-focus-ring`,
`--admin-input-radius`

### Spacing (8px base, no `--space-7`)
`--space-1` (4) · `--space-2` (8) · `--space-3` (12) · `--space-4`
(16) · `--space-5` (20) · `--space-6` (24) · `--space-8` (32)

### Radius
`--radius-xs` (4) · `--radius-sm` (6) · `--radius-md` (8) ·
`--radius-lg` (10) · `--radius-xl` (12) · `--radius-2xl` (16) ·
`--radius-full` (999)

### Shadow
`--admin-shadow-sm`, `--admin-shadow-md`, `--admin-shadow-lg`,
`--admin-shadow-card`, `--shadow-dropdown`, `--shadow-modal`,
`--shadow-panel`

### Typography
`--font-xs`, `--font-sm`, `--font-md`, `--font-lg`, `--font-xl`,
`--font-2xl`, `--font-weight-normal`, `--font-weight-medium`,
`--font-weight-semibold`, `--font-weight-bold`,
`--line-height-tight`, `--line-height-normal`, `--line-height-relaxed`

### Motion
`--duration-fast`, `--duration-normal`, `--duration-slow`,
`--ease-default`, `--ease-spring`, `--ease-snappy`

### Explicitly NOT allowed in `ui/`
`--sf-*` (editor field tokens — different abstraction layer),
`--upload-*` (one-off media tokens), `--badge-*`, `--dropdown-*`,
`--modal-*`, `--admin-tab-*` (component-specific aliases — Phase 2+
components may add their own; primitives don't use them),
`--header-height`, `--icon-btn-size` (layout-specific).

---

## 5. Accessibility baseline

Every component must satisfy this checklist before merging.

### 5.1 Semantic HTML
- Use the correct native element. `<button>` for buttons, `<input>`
  for inputs, `<label htmlFor>` for labels — never `<div role="button">`.
- Form inputs always have a real `<label>` linked via `htmlFor`/`id`,
  even when the visual label is hidden.

### 5.2 ARIA
- `aria-invalid="true"` on inputs when `error` is set.
- `aria-describedby` linking the input to its `helpText` AND `error`
  element ids (both, when both exist).
- `aria-required="true"` when `required`.
- Disabled state uses the native `disabled` attribute, not
  `aria-disabled`, so the element is removed from tab order.
- Loading state (where applicable) uses `aria-busy="true"` and
  disables interaction.

### 5.3 Keyboard
- All interactive elements reachable via Tab in logical order.
- `Enter` / `Space` activate buttons, checkboxes, toggles.
- `Escape` closes overlays / popups / cancellable flows.
- Arrow keys navigate within composite widgets (radio groups,
  segmented controls) per WAI-ARIA APG.

### 5.4 Focus management
- Focus ring is always visible. Never `outline: none` without a
  replacement that meets WCAG contrast (use
  `--admin-input-focus-ring` for inputs, `--admin-border-focus` for
  buttons; the legacy `box-shadow: 0 0 0 3px var(--admin-input-focus-ring)`
  is the established admin pattern).
- Components that take over focus (modal, drawer) trap it while
  open and restore focus to the trigger on close.

### 5.5 Color contrast
Text on surface meets WCAG AA (4.5:1 body, 3:1 large). The token
set above already passes for the standard `--admin-text` /
`--admin-surface` pairing; if you reach for a different combination,
verify with a contrast checker.

---

## 6. Per-component PR checklist

Promotion PRs (PR2 for Button, equivalent for each later primitive)
must satisfy every box before merge:

- [ ] `<Name>.tsx` created in `ui/`
- [ ] `<Name>.css` created, every value sourced from §4
- [ ] `<Name>.test.tsx` created with at minimum: render, controlled
      state, a11y attributes (use `@testing-library/react` — precedent:
      `Tabs.test.tsx`)
- [ ] `forwardRef` wired to the most useful DOM element
- [ ] Discriminated-union props for variants (no `variant: string`)
- [ ] `helpText`, `error`, `required` props (where applicable)
- [ ] No `...rest` spread onto DOM
- [ ] Exported from `ui/index.ts`
- [ ] Dual-emit class confirmed in rendered HTML
- [ ] Visual diff — screenshots **before/after** on at least one
      page where the component will be migrated. Toggle requires
      screenshots from **all** contexts where it appears, due to
      drift between `base.css` and
      `_components/admin-page.css:96-106`.
- [ ] No new tokens added (any token request → separate PR per §4)
- [ ] No design changes vs legacy class (lift-and-shift per §3.2)
- [ ] CLAUDE.md unchanged unless this PR is intentionally amending
      a documented rule

---

## 7. Phase 1 sequence (locked)

Each component goes through the full pipeline before the next
starts:

```
PR1   ui/ scaffolding — README + index.ts (this PR)
PR2   Button promoted (dual-emit on)
PR3+  Per-page Button migrations
PR-N  Button sunset — ESLint + delete .admin-btn + dual-emit off
        (acceptance: grep -r "admin-btn" app/ → 0)
————————————————————————————————————
Repeat for TextInput, Textarea, Checkbox, Toggle (in that order).
```

Toggle is last because of the drift in
`_components/admin-page.css:96-106` (12 selectors hardcoded outside
`base.css`) — it's the most complex Phase 1 migration, not the
simplest. Tackling it last lets the contract harden against the
other four first.

Out of scope for Phase 1: layout / feedback components (EmptyState,
Card, Banner, Modal, Collapse — those are Phase 2). Drawer,
Choicebox, DataTable composites are Phase 3+.

---

## 8. Out of scope permanently

Editor field components in `app/(editor)/editor/fields/` are a
**different abstraction**: descriptor-driven, schema-bound, used
inside the visual editor's `SettingField` runtime. They are not
unified with `ui/`. Don't import editor field components from
`ui/`, don't rebuild editor fields as `ui/` components, don't add
descriptor-driven props to `ui/`.

Guest-facing storefront components live in `app/(guest)/` and are
out of `ui/`'s scope. The two systems share base.css tokens but
nothing else.
