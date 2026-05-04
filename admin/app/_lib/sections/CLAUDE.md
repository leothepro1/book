# Sections — Section → Block → Element

This module owns the section/block/element model, definitions, presets, and renderers.
Loaded automatically when Claude works in `app/_lib/sections/` or
`app/(guest)/_components/sections/`.

> See also: `INVARIANTS.md` in this directory for the hard render-pipeline rules.

---

## Section builder model

Section — top-level layout unit
Block — groups content inside a section
Element — smallest renderable unit

Sections can have multiple presets with their own renderers.

### Two section types

1. **Free sections** — home page only, tenant can add/remove/reorder freely
2. **Locked sections** — platform-owned, bound to a specific page

Locked section rules:
- scope: "locked", lockedTo: PageId in SectionDefinition
- locked: true, blocks: [] on SectionInstance — no tree structure
- Auto-seeded on first editor load for that page
- editableFields: string[] is the platform-admin contract
- DetailPanel renders ONLY controls in editableFields — generic, no
  section-specific conditionals in shared code
- Tenant can toggle visibility but cannot delete, add, or reorder
- Hidden from section picker — cannot be manually added
- visibleWhen: { key, value } on SettingsField controls conditional
  field visibility (e.g. tab labels hidden when layout === "list")

### Standalone elements

Elements can be placed directly in the page tree without a parent section.
Under the hood, they are wrapped in a SectionInstance with
`definitionId: "__standalone"` — invisible to the user.

- `createStandaloneSection()` in mutations.ts creates the wrapper
- Zero padding, no section styling — renders "naked"
- In editor: flat row (no chevron), shows element icon/name
- Color scheme selector appears on element panel (not section)
- DnD works automatically (it's a real SectionInstance)

---

## Creating section definitions — complete pattern

Every new section follows this exact structure. Copy an existing
definition (e.g. accordion.ts) and adapt.

### File structure

```
app/_lib/sections/definitions/{section-name}.ts    ← definition + registration
app/(guest)/_components/sections/renderers/
  {SectionName}Renderer.tsx                         ← React component (client)
  {section-name}-renderer.css                       ← CSS (BEM: .s-{name})
```

### SectionDefinition fields

```typescript
{
  id: string,                    // kebab-case, unique
  version: "1.0.0",
  name: string,                  // Swedish UI label
  description: string,           // for picker tooltip
  category: "hero" | "navigation" | "content" | "media" | "utility",
  tags: string[],                // searchable keywords
  thumbnail: "",                 // URL for picker
  scope: "free" | "locked",     // free = tenant can add/remove

  settingsSchema: SettingField[],     // section-level controls
  settingDefaults: Record<string, unknown>,

  presets: SectionPreset[],           // min 1, first is default
  createDefault: () => Omit<SectionInstance, "id" | "sortOrder">,
}
```

Register at end of file: `registerSectionDefinition(mySection);`

### SectionPreset fields

```typescript
{
  key: string,                   // unique within section
  version: "1.0.0",
  name: string,                  // Swedish
  description: string,
  thumbnail: "",
  cssClass: "s-{sectionId}--{presetKey}",  // BEM convention

  blockTypes: BlockTypeDefinition[],  // min 1
  minBlocks: number,
  maxBlocks: number,             // -1 = unlimited

  settingsSchema: SettingField[],     // preset-specific controls
  settingDefaults: Record<string, unknown>,

  changeStrategy: "reset" | "migrate" | "preserve_compatible",
  migrations: {},

  createDefaultBlocks: () => Omit<BlockInstance, "id">[],
}
```

### BlockTypeDefinition → SlotDefinition → Elements

```typescript
// Block type
{
  type: string,                  // unique within preset
  version: "1.0.0",
  name: string,  description: string,  icon: string,
  slots: SlotDefinition[],
  settingsSchema: [],  settingDefaults: {},
}

// Slot
{
  key: string,                   // "media" | "content" | "actions" etc.
  name: string,  description: string,
  allowedElements: ElementType[],
  minElements: number,  maxElements: number,  // -1 = unlimited
  defaultElements: Omit<ElementInstance, "id">[],  // id: "" → generated
}
```

### Color scheme rules — NEVER violate

1. **NEVER hardcode hex colors** in renderers — always use CSS variables
2. Color ownership lives at section level (`section.colorSchemeId`)
3. Standalone elements get their own colorSchemeId on the wrapper section
4. Available CSS variables from color scheme:
   - `var(--background)` — section/card background
   - `var(--text)` — primary text color
   - `var(--button-bg)` — solid button background
   - `var(--button-fg)` — solid button label
   - `var(--outline-btn)` — outline button border + text
   - `var(--outline-btn-label)` — outline button label
5. Derived colors use `color-mix()`:
   `color-mix(in srgb, var(--text) 12%, transparent)` for borders
   `color-mix(in srgb, var(--text) 4%, var(--background))` for tinted bg
6. Renderers receive `colorScheme` in props but should NOT read it
   directly — use the CSS variables that SectionItem applies

### Typography rules

1. Use `clamp()` for responsive sizing:
   `clamp(1.5rem, 1.25rem + 1vw, 2rem)` — never fixed px for headings
2. Font families via CSS variables:
   - `var(--font-heading)` — headings
   - `var(--font-body)` — body text
   - `var(--font-button, var(--font-heading, inherit))` — buttons
3. Text color: always `var(--text)`, never hardcoded

### Renderer component pattern

```typescript
"use client";  // REQUIRED — renderers use hooks

export function MyRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;
  // ...render using CSS variables, never hardcoded colors
}
```

Renderers receive fully resolved, validated data via `SectionRendererProps`.
They never contain fallback logic or default handling.

### SettingField types available

text, textarea, richtext, image, color, select, segmented,
toggle, number, range, url, link, cornerRadius, weightRange,
markers, mapPicker, video, imageList, layoutPicker, menuPicker

Key field props: key, type, label, default, options (for select/segmented),
min/max/step (for range), group (visual divider), hidden, hideLabel,
visibleWhen: { key, value } (conditional visibility), translatable

### Registration checklist

1. Create definition file in `definitions/`
2. Register with `registerSectionDefinition()`
3. Create renderer in `renderers/`
4. Create CSS file with BEM classes `.s-{name}`
5. Import CSS in renderer
6. All colors via CSS variables — zero hardcoded values
7. All text sizes via clamp() or design tokens
8. Test: add section in editor, verify preview renders correctly

---

## ID conventions

```
sec_${timestamp}_${random}   — sections
blk_${timestamp}_${random}   — blocks
elm_${timestamp}_${random}   — elements
```

---

## Color scheme system

Shopify-style. Defined globally by tenant.

Semantic tokens: background, text, solidButtonBackground,
solidButtonLabel, outlineButton, outlineButtonLabel

Sections assign a color scheme.
Renderer maps tokens to CSS variables: --background, --text, --button-bg, --button-fg
Elements inherit — elements do NOT own their own colors.
Color ownership lives at the section level.
Referenced schemes cannot be deleted.

---

## Where this domain plugs into the platform

- **Editor surface** renders these definitions — see `app/(editor)/CLAUDE.md`
- **Booking-engine surface** renders via `themes/engine.tsx` — see `app/(guest)/CLAUDE.md`
- **Translation system** walks section content via `traversal.ts` —
  marking a `SettingField` with `translatable: false` excludes it.
  See `_lib/translations/CLAUDE.md`.
- **TenantConfig + page registry** wraps section instances —
  see `_lib/pages/CLAUDE.md`.
