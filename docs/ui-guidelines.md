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

## Generated primitives target Radix 2.x — this project is on 1.4.3

The biggest source of "the class is right there and does nothing" in this codebase.
The generated files in `components/ui/` were produced for a shadcn style that
assumes **Radix 2.x**, which emits *boolean* data attributes. `package.json` pins
`radix-ui@^1.4.3`, which emits *valued* ones:

| Generated file styles on | Radix 1.4.3 actually emits |
| ------------------------ | -------------------------- |
| `data-checked` / `data-unchecked` | `data-state="checked"` / `"unchecked"` |
| `data-horizontal` / `data-vertical` | `data-orientation="horizontal"` / `"vertical"` |
| `data-active` | `data-state="active"` |

In Tailwind v4, `data-checked:` compiles to `&[data-checked]` — attribute
*presence*. Radix never sets that attribute, so the utility never applies. Nothing
errors; the element just renders unstyled.

**Known casualties:**

- `ui/switch.tsx` — the track's `data-unchecked:bg-input` never lands, so the track
  is transparent and the thumb is `bg-background`: an **invisible switch** that
  still occupies its 32px. Don't use it; use `Toggle`, which styles on
  `data-[state=on]` and `aria-pressed` (both emitted by 1.4.3) and sizes itself
  unconditionally.
- `ui/tabs.tsx` — the `data-horizontal` / `group-data-horizontal` paths don't
  resolve, so the tab list renders as an empty block. Use `toggle-group` for
  segmented switches.

**Before reaching for a primitive from `components/ui/`,** check whether its
classes depend on a boolean `data-*` variant. If they do, it will render wrong.
Prefer one that keys off `data-[state=…]` or `aria-*`.

Do **not** hand-edit the file to fix it (rule 3). The real fix is to upgrade
`radix-ui` to 2.x and re-verify every primitive — tracked separately.

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

## Theme: shadcn `mauve`, one hue, nothing else

**Never write a colour value in a component.** No hex, no `rgb()`, no `oklch()`,
no `bg-emerald-600`. Components use the tokens below; `app/globals.css` is the
only file that names a colour. That is what makes the palette replaceable — and
it has been replaced four times already.

**Never invent a colour value either.** Everything in `globals.css` is copied
from [ui.shadcn.com/colors](https://ui.shadcn.com/colors), which you can fetch
programmatically rather than eyedropper off the page:

```bash
curl -s https://ui.shadcn.com/r/colors/mauve.json   # a full theme, cssVarsV4 = OKLCH
curl -s https://ui.shadcn.com/r/colors/index.json   # every scale, every step
```

**One family — `mauve`, eleven steps.** No orange, no blue, no green, no red.
Difference is expressed as **lightness**, never as hue. If you are reaching for a
second hue, the answer is a different step on the ramp.

`--color-mauve-50 … --color-mauve-950`, plus one indirection:

```css
--color-accent-step: var(--color-mauve-600);
```

That is the accent — the active nav item, focus rings, the emphasised stat. It
exists as its own name so the accent can move up or down the ramp in one edit.

`:root` and `.dark` are shadcn's `mauve` theme verbatim, with exactly **three**
deviations, each marked `★` in the file:

1. **No red.** shadcn's `destructive` is a red; here it is the darkest step
   (mauve-900 light / mauve-200 dark), so a delete button reads as *heavy* rather
   than red.
2. **The accent step** replaces shadcn's mid-mauve `ring`, and also the stray
   blue shadcn puts in `sidebar-primary` for dark mode — a value that belongs to
   no other token in the theme.
3. **Dark chrome.** shadcn ships a *light* sidebar in light mode; here it is
   **mauve-950** in both themes, so the sidebar is literally the same surface
   whichever theme you're in.

**Layout rule: dark chrome, light content.** Sidebar is mauve-950 always;
content stays white in light mode. The accent step marks the **active** nav item
and focus rings and nothing else.

### Status without hue

With one hue, status is carried by **weight**:

| Tone | Light mode | Dark mode |
| ---- | ---------- | --------- |
| `success` | mauve-100 fill, mauve-700 text | mauve-700 fill, mauve-50 text |
| `info` | mauve-200 fill, mauve-600 text | mauve-800 fill, mauve-400 text |
| `warning` | mauve-300 fill, mauve-900 text | mauve-600 fill, mauve-50 text |
| `danger` | mauve-800 fill, mauve-50 text | mauve-200 fill, mauve-900 text |

`danger` is the inverted fill in both modes — the heaviest thing on the surface,
which is what red used to do. The ordering mirrors when the theme flips.

**This costs the at-a-glance hue cue**, and that is a real tradeoff: a failed
build no longer reads as "red" from across the room. What makes it acceptable is
that every pill in the app renders its status **as text** — `Yes`/`No`,
`SUCCESS`/`FAILED`, `Safe to Remove`/`Pending` — so no information depends on
colour alone, only scan speed. Keep it that way: never ship a pill that is colour
only.

### The tokens

| Use | Token |
| --- | ----- |
| Everything | `bg-mauve-50 … bg-mauve-950` (and `text-`, `border-`) |
| Accent | `--color-accent-step` (= mauve-600) |
| Status pills | `STATUS_TONE_CLASS` in [`lib/vm-utils.ts`](../lib/vm-utils.ts) → `bg-tone-{success,info,warning,danger}` + `text-tone-*-fg` |
| Inline grid values | `text-ink-source` (came from), `text-ink-target` (landed on), `text-ink-accent` (neutral detail) |
| Semantic fills | `bg-positive`, `bg-negative` |
| Everything else | the standard shadcn semantics — `bg-background`, `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive`, … |

`tone-*` and `ink-*` are **themed per mode** in `:root`/`.dark`, so a call site
never needs a `dark:` counterpart — that is the point of them. Reach for
`STATUS_TONE_CLASS` rather than naming greens and reds yourself; it is the shared
vocabulary across the tracker, the build history and the dashboard.

There is no `positive`/`negative` token any more — they were a green and a red,
and the palette is one hue. Use the `tone-*` pairs above, or a mauve step
directly.

### Verifying a token actually exists

A token that isn't registered in `@theme` produces **no CSS and no error** — the
element just renders unstyled. After adding one, check it compiled:

```bash
grep -c -F '.bg-your-token' $(grep -l 'sidebar-primary' .next/static/chunks/*.css | head -1)
```

### Two traps in the sidebar

1. **`--primary` is a dark mauve — the same family the sidebar is painted
   with.** Inside the sidebar, `bg-primary`/`text-primary-foreground` disappears
   into the background. Use the `--sidebar-*` tokens there
   (`bg-sidebar-primary`, `text-sidebar-foreground`, `bg-sidebar-accent`) — never
   the global ones. Same for `text-muted-foreground` and the default
   `AvatarFallback` tone: both are tuned for a light surface and wash out on the
   dark chrome.

2. **`SidebarMenuButton`'s active styling applies to every item.** The primitive
   renders `data-active={isActive}` *unconditionally*, and React stringifies a
   `data-*` `false` — so the attribute is always present as `"false"`. Tailwind's
   `data-active:` variant compiles to `[data-active]`, which tests attribute
   **presence**, so `data-active:bg-sidebar-accent` matches all of them. With the
   old near-invisible accent nobody noticed; the moment the active colour became
   distinct, the entire nav rendered filled.

   The fix in `components/layout/app-sidebar.tsx`: restate the same variant
   (`data-active:bg-transparent`) so tailwind-merge drops the primitive's rule,
   then style the real active item from React state with `!` — both selectors land
   at equal specificity, and emission order shouldn't decide the winner.

   This is the same family as the Radix boolean-attribute trap above, but a
   *different* root cause — upgrading Radix will not fix it. Don't edit
   `components/ui/sidebar.tsx` (rule 3); override in the feature component.

Chart tokens `--chart-1..5` are five widely-spaced steps of the same ramp
(mauve-900 → mauve-300 in light mode, reversed in dark). Lightness is the only
channel available, so keep series counts low — five is the practical ceiling
before adjacent steps stop being separable.

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
