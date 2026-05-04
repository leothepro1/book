# Visual editor surface — `(editor)`

The admin-side WYSIWYG editor. Tenants compose their booking-engine
storefront here. Lives at `rutgr.com/editor[/<pageId>]`.

> See also: `_lib/sections/CLAUDE.md` for the section/block/element model
> the editor manipulates, and `_lib/pages/CLAUDE.md` for TenantConfig.

---

## Three-pane shell

```
┌─────────────────────────────────────────────────────────────┐
│ EditorHeader            (page picker · device · publish)    │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│  Rail    │       Canvas                 │     Detail        │
│  (left)  │   (live preview iframe)      │    panel          │
│          │                              │   (right)         │
│ Sections │                              │                   │
│ tree     │                              │                   │
│          │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
                                          ↑
                          PublishBar (bottom): Save · Publish · Discard
```

Files:
- `EditorShell.tsx` — overall layout
- `EditorRail.tsx` — left rail (Sidhuvud / Mall / Sidfot tree)
- `EditorCanvas.tsx` — live preview (postMessage → guest iframe)
- `EditorPanel.tsx` — right panel router (DetailPanel | SettingsPanel)
- `EditorPublishBar.tsx` — draft/published state
- `EditorClient.tsx` — top-level client component (orchestrates the above)
- `EditorContext.tsx` — `PreviewContext` (config) + `EditorContext` (selection, undo)
- `[[...pageId]]/page.tsx` — the route entry

---

## State model

`PreviewContext.config` is the **single source of truth** for editor
state. It holds the unpublished `TenantConfig`. Every edit flows through:

```
pushUndo(snapshot) → updateConfig(patch) → saveDraft() (debounced)
```

Undo snapshots are page-scoped (separate stack per pageId) to prevent
multi-tab overwrite. Save fires to `/api/tenant/draft-config` with the
current `settingsVersion` for optimistic locking.

`configChannel` (in `_lib/translations/`) bridges PreviewContext and the
TranslationPanel — see `translations/CLAUDE.md`.

---

## Field components

`fields/` contains the SettingField renderers — one per `SettingField.type`:

  Field*: text · textarea · richtext · color · select · segmented ·
          toggle · number · range · url · link · cornerRadius ·
          weightRange · markers · mapPicker · video · imageList ·
          layoutPicker · menuPicker · accommodationPicker ·
          collectionPicker · productPicker · fontPicker · image

Adding a new SettingField type requires:
1. Add to the `SettingField` union in `_lib/sections/types.ts`
2. Create `fields/Field<Name>.tsx`
3. Wire into the `DetailPanel` field router

The DetailPanel renders ONLY controls in `editableFields` for locked
sections (the `editableFields` contract — see `_lib/sections/CLAUDE.md`).

---

## Panels

`panels/`:
- `DetailPanel.tsx` — section/block/element detail editing
- `SettingsPanel.tsx` — page-level + tenant-level settings
- `SectionsPanel.tsx` — left-rail section tree
- `ColorSchemeSelect.tsx` + `ColorTokenField.tsx` — color scheme editor
- `PageResourcePicker.tsx` + `PickerModal.tsx` — entity picker (accommodation, product, etc.)
- `picker-previews.ts` — live preview thumbnails

---

## Live preview pipeline

The canvas iframe loads `/preview` (a separate route group, not `(guest)`).
Editor pushes config updates via `postMessage`. Preview app subscribes,
re-renders. SSE fallback at `/api/tenant/preview-stream` for cross-tab.

---

## Hooks

`hooks/` — small custom hooks shared across panels:
- `useDebouncedSave`, `useUndo`, `useSelection`, etc.

---

## Publish flow

```
Save draft     → POST /api/tenant/draft-config (debounced 500ms)
Publish        → POST /api/tenant/publish
                 (atomic: writes settings, bumps settingsVersion,
                  cleans orphan translations, calls revalidateTag)
Discard        → reset draft to last published config
```

Optimistic locking on publish: `If-Match: settingsVersion` header.
409 on mismatch → user sees "someone else published, refresh".

---

## Editor invariants — never violate

1. `PreviewContext.config` is the single source of editor truth — never read directly from DB while editing
2. `pushUndo → updateConfig → saveDraft` is the only mutation pipeline
3. Undo stacks are page-scoped — never global
4. DetailPanel respects `editableFields` for locked sections — no section-specific conditionals in shared code
5. Save uses `settingsVersion` for optimistic locking — never blind writes
6. Live preview communicates via `postMessage` — never share React state across iframe boundary
7. Field components are 1:1 with `SettingField.type` — never inline rendering in panels
8. Adding a SettingField type requires the union update + Field component + DetailPanel routing
9. Editor never writes published config — only `/api/tenant/publish` does that
10. SectionErrorBoundary wraps the canvas preview — editor never crashes from a bad section render
