# Section System — Invariants

Hard rules. Not guidelines, not suggestions. Code that violates these is broken.

## Render Pipeline

1. **resolve → validate → render.** Always in this order. No exceptions.
2. **Renderers never contain fallback logic.** No default values, no `?? "fallback"`, no `|| defaultColor`. If a renderer needs a fallback, the resolve step is broken.
3. **Invalid data never reaches a renderer.** `resolveSection()` returns `null` for invalid sections. The renderer receives fully merged, validated `SectionRendererProps`.

## Actions

4. **Actions are only valid where `supportsAction: true`.** A heading element with an action is invalid. Validation rejects it.
5. **Content lives in `settings`. Behaviour lives in `action`.** Never put URLs, modal IDs, or interaction targets in settings. Never put text content, colours, or sizes in action.

## Slots

6. **Slots are the only structure for element placement.** Blocks do not have a flat `elements[]`. All elements live in named slots (`block.slots.media`, `block.slots.content`, etc.).
7. **Renderers consume slots by key.** They never iterate "all elements" — they access `slots.media.elements`, `slots.content.elements`, etc. This is deterministic layout, not guessing.

## Presets

8. **Preset switching must go through `changeStrategy`.** Never mutate blocks directly when changing presets. Always use `reset`, `migrate`, or `preserve_compatible`.
9. **Each preset does one thing well.** No preset with 25 settings. No preset with multiple layout modes baked in. If it needs a toggle to change layout, it should be two presets.
10. **Presets are templates, not themes.** Switching presets changes content structure (slots, block types, allowed elements). It is not a visual skin swap.

## Versioning

11. **All definitions carry semver versions.** `ElementDefinition.version`, `BlockTypeDefinition.version`, `SectionPreset.version`, `SectionDefinition.version`.
12. **Instances record the version they were created against.** `SectionInstance.definitionVersion` and `presetVersion`. Version mismatch = migration needed.

## Elements

13. **Keep the element library small and stable.** Six types: `heading`, `text`, `button`, `image`, `divider`, `icon`. Variation goes in presets and block types, not new elements.
14. **New element types require strong justification.** Before adding `badge`, `rating`, `avatar`, etc. — can it be achieved with existing elements + block/preset settings?

## Sections

15. **Build few, build well.** Target 3–5 section families first. Each must work in: editor, validation, rendering, preset switching, publish flow.
