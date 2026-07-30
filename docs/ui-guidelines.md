# UI Guidelines: shadcn/ui Only

All UI primitives in this project come from **shadcn/ui**. Never hand-roll a
primitive (button, input, dialog, card, dropdown, etc.) with raw HTML +
Tailwind when a shadcn equivalent exists.

## Rules

1. **Check `components/ui/` first.** Before writing any markup, see if the
   primitive already exists there (e.g. `components/ui/input.tsx`). The
   starter ships with `button`, `card`, `input`, and `label`.
2. **If it doesn't exist, install it via the shadcn CLI:**
   ```bash
   npx shadcn@latest add <component>
   ```
   This respects the config in `components.json` (style: `radix-nova`,
   base color: `neutral`, icons: `lucide-react`, aliases: `@/components`,
   `@/components/ui`, `@/lib`, `@/hooks`). Do not manually copy-paste
   component source from the shadcn docs — always use the CLI so the file
   lands in `components/ui/` with the correct imports and styling tokens.
3. **Never edit generated files in `components/ui/` to add feature-specific
   logic.** Compose them instead — wrap/extend in your feature component
   (e.g. `components/auth/login-page.tsx`), don't modify
   `components/ui/input.tsx` itself.
4. **Icons come from `lucide-react`** (the configured `iconLibrary`), not
   any other icon set.
5. **Styling**: use Tailwind utility classes plus the `cn()` helper from
   `@/lib/utils` for conditional classes, matching the pattern already used
   in `components/ui/*`. Use the existing CSS variable–based theme tokens
   (`bg-background`, `text-foreground`, `border-input`, etc.) rather than
   hardcoded colors.
6. **No other component libraries.** Don't introduce MUI, Chakra,
   Ant Design, react-bootstrap, etc.
7. **Override a responsive utility at the same breakpoint it was set.** See
   below — this one silently doesn't work if you get it wrong.

## Overriding widths on a primitive (a real trap)

`components/ui/dialog.tsx` sets **`sm:max-w-sm`** on `DialogContent`. Passing an
unprefixed `max-w-4xl` through `className` does **nothing** above 640px: both
utilities have the same specificity, Tailwind emits `sm:` variants *after* base
utilities, so the primitive's `sm:max-w-sm` wins and the dialog renders 384px
wide. `cn()`/tailwind-merge can't save you either — it treats `max-w-4xl` and
`sm:max-w-sm` as different keys (different variant) and keeps both.

**Always match the breakpoint:**

```tsx
<DialogContent className="sm:max-w-5xl">   {/* ✅ replaces sm:max-w-sm */}
<DialogContent className="max-w-5xl">      {/* ❌ silently ignored ≥640px */}
```

The same reasoning applies to any generated primitive that sets a responsive
utility — check the primitive's own classes before overriding. Editing the file in
`components/ui/` to "fix" it is not the answer (rule 3).

## Three more silent traps in dialogs

**`Textarea` sizes itself to its content.** `components/ui/textarea.tsx` sets
**`field-sizing-content`**, so the control grows to fit what's in it. Give it
`wrap="off"` and it grows as wide as the longest line — enough to push a dialog
past its own `max-w` and give the whole thing a horizontal scrollbar. For a
fixed-size scrollable box, override it:

```tsx
<Textarea className="field-sizing-fixed h-32 w-full min-w-0 overflow-auto" wrap="off" />
```

**Don't put `overflow-y-auto` on `DialogContent`.** Per CSS, if one axis isn't
`visible` the other computes to `auto`, so `overflow-y-auto` silently enables
*horizontal* scrolling too. The close button is `absolute right-2` against the
padding box, so the moment the dialog scrolls sideways the button drifts off with
it. Let each inner region scroll instead — a bounded list wrapper
(`max-h-* overflow-auto`), the paste box, and so on.

**`DialogContent` is a `grid`.** Its children are grid items with
`min-width: auto`, so they refuse to shrink below their content's min-content
width — a wide table (`min-w-[36rem]`) or an unwrapped textarea stretches the
dialog from the inside. Put `min-w-0` on the wrapper so `overflow-auto` on the
inner scroll container actually does its job.

## Where shadcn fits in the architecture

shadcn primitives live in `components/ui/` and are pure presentational
building blocks — they sit at the bottom of the **UI layer** described in
[architecture.md](./architecture.md). Feature components
(`components/auth/...`, and future `components/<feature>/...`) compose shadcn
primitives, receive all data via props, and fire callback props for actions.
They must not import from `services/` or `repositories/` — that data flows in
through the **hook layer** as described in the architecture doc.

## Workflow checklist for any UI change

1. Identify the layer the new code belongs to (routing / UI / hook /
   service / repository) per [architecture.md](./architecture.md).
2. For any new visual primitive, install it with
   `npx shadcn@latest add <component>` rather than writing it by hand.
3. Compose feature components from shadcn primitives.
4. Run `npm run build` and confirm there are zero TypeScript errors.
5. Run `npm run lint` and fix any issues.
