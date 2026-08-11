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
- `ui/separator.tsx` — carries **all** of its sizing on
  `data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch`,
  while the primitive emits only `data-orientation`. So a `Separator` is
  **zero-area**: it mounts, occupies nothing, and shows nothing. `className="h-4"`
  on a vertical one is *not* enough — the **width** is the part the primitive was
  supposed to supply, which is why this reads as "the divider just isn't there"
  rather than as a sizing bug. Pass the missing axis explicitly:

  ```tsx
  <Separator orientation="vertical" className="h-4 w-px" />   {/* ✅ */}
  <Separator className="h-px w-full" />                       {/* ✅ horizontal */}
  <Separator orientation="vertical" className="h-4" />        {/* ❌ invisible */}
  ```

  `SidebarSeparator` in `ui/sidebar.tsx` wraps the same primitive and inherits the
  same problem.

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

## The same trap at page level — `min-w-0` on the app shell

`SidebarProvider` renders a flex row and `SidebarInset` is its flex child, so
`SidebarInset` also defaults to **`min-width: auto`**. Any wide descendant — the
tracker's `min-w-[1800px]` table — then widens the whole page instead of scrolling
inside its own `overflow-x-auto` container.

The visible symptom is not a stray scrollbar. It is that **`sticky` stops
working**: `sticky top-0` pins on the vertical axis only, so once the *body*
scrolls horizontally the top bar and the page header slide off to the left with
the content. That is what "the title goes out of scope when scrolled right" means.

`app/(protected)/(app)/layout.tsx` passes `min-w-0` to `SidebarInset`, and
`vm-tracker.tsx` puts it on its own `<main>` too. **Both are required** — the
constraint has to hold at every flex level between the shell and the scroll
container, because one unconstrained ancestor is enough to push the page wide.

When adding a page with a wide table: put the width floor on the `<Table>`, wrap
it in `overflow-x-auto`, and make sure every flex ancestor up to `SidebarInset`
carries `min-w-0`. Block wrappers (`mx-auto w-full max-w-7xl`) are fine as-is —
this only bites flex and grid items.

## Theme: "Kinetic Slate"

**Never write a colour value in a component.** No hex, no `rgb()`, no `oklch()`,
no `bg-emerald-600`. Components use the tokens below; `app/globals.css` is the
only file that names a colour. That is what makes the palette replaceable — and
it has been replaced five times already.

**Never invent a colour value either.** The palette is the **Kinetic Slate**
design system, read from Stitch rather than eyedropped off a screenshot:

```bash
# Any read-only tool works: get_project, list_screens, get_screen,
# list_design_systems. `theme.namedColors` and `theme.designMd` are the palette.
curl -sS -X POST https://stitch.googleapis.com/mcp \
  -H "X-Goog-Api-Key: $STITCH_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_design_systems",
       "arguments":{"projectId":"11781340808558879699"}}}'
```

The system is seeded from Tailwind's own scales — `#0f172a` (slate-900),
`#64748b` (slate-500), `#3b82f6` (blue-500), `#10b981` (emerald-500) — so the
structural ramp is Tailwind `slate` verbatim, and the brief's own callouts
(`#e2e8f0` card borders, `#cbd5e1` hover borders, `#94a3b8` scrollbar thumbs) are
three of its steps.

### Three hues, each with a job

This is the big change from the palette this replaced, which was a single hue
(mauve) where every distinction was carried by **lightness**. Hue is now
load-bearing:

| Hue | Token | Used for |
| --- | ----- | -------- |
| **slate** | `--color-steel-50 … 950` | every structural surface, border, neutral text |
| **blue** | `--color-accent-step` (#0058be) | the **active** state — current nav item, focus rings, live dots |
| **status** | `--tone-*`, `--positive`, `--destructive` | status pills only: green / amber / red |

`--color-accent-step` is the one indirection: it exists as its own name so the
accent can move in a single edit. It marks the active nav item and focus rings
and **nothing else** — reach for a step of `steel-*` for any other emphasis.

Red is back (`--destructive` = the system's `error`), so a delete no longer has
to be carried by weight alone. Green is `--positive`.

**The safety property that makes hue acceptable: every status pill still renders
its status as text** — `SUCCESS`/`FAILED`, `Yes`/`No`, `Safe to Remove`/`Pending`.
Never ship a pill that is colour alone.

### The ramp is named `steel`, not `slate`

`--color-steel-*` holds Tailwind's `slate` values but is deliberately not called
`slate`: that name would shadow Tailwind's built-in scale, and the ramp keeps one
stable name across future palette swaps. `components/vms/vm-row.tsx` is the main
consumer — the tracker's expanded-row band is `bg-steel-800` with `text-steel-*`
on top.

### Layout rule: dark chrome, light content

The sidebar is `#131b2e` (`primary-container`) in **both** themes — it is
literally the same panel whichever theme you are in. This is the design's own
call, not a local deviation: *"the vertical sidebar uses a dark theme even in the
Light Mode system to create clear structural separation."* Content stays white on
a blue-tinted `#f8f9ff` canvas in light mode.

### Status tones

| Tone | Light mode | Dark mode |
| ---- | ---------- | --------- |
| `success` | `#e6f4ea` fill, `#137333` text | `tertiary-fixed-dim` text on an 18% mix of itself |
| `info` | `surface-variant` fill, `on-secondary-fixed-variant` text | `secondary-fixed-dim` text on an 18% mix |
| `warning` | `#fff8e1` fill, `#b08d00` text | Amber 200 text on an 18% mix |
| `danger` | `error-container` fill, `on-error-container` text | `error-container` text on an 18% mix |

Light mode uses the design system's real container colours. Dark mode has none for
these, so the fills follow the brief's own recipe instead — *"low-opacity
backgrounds of the status colour with high-contrast text"* — via
`color-mix(in oklab, <fg> 18%, transparent)`. That keeps dark mode from inventing
four new hex values, and the weight ordering mirrors light mode.

Reach for `STATUS_TONE_CLASS` in [`lib/vm-utils.ts`](../lib/vm-utils.ts) rather
than naming tones yourself; it is the shared vocabulary across the tracker, the
build history and the dashboard. `JenkinsStatusBadge` in
`components/environments/jenkins-status.tsx` is the Jenkins-specific counterpart.

### Type: three families, one utility each

The design system's type scale is registered in Tailwind's `--text-*` namespace,
so each name compiles to a **whole style** — size, line-height, weight and
tracking together. Don't rebuild these from `text-sm font-medium tracking-wide`.

| Utility | Family | Use |
| ------- | ------ | --- |
| `text-headline-xl` + `font-display` | Hanken Grotesk 36/44 700 | page hero titles (uppercase) |
| `text-headline-lg` + `font-display` | Hanken Grotesk 24/32 600 | section headings |
| `text-headline-md` + `font-display` | Hanken Grotesk 20/28 600 | card titles |
| `text-body-md` | Inter 16/24 400 | body, nav items |
| `text-body-sm` | Inter 14/20 400 | secondary text, table cells |
| `text-label-mono` + `font-mono` | JetBrains Mono 13/16 500 | ports, IPs, domains, timestamps |
| `text-label-caps` | Hanken Grotesk 12/16 700 | column headers, badges |

`font-sans` (Inter) is on `body`, so body text needs no class. **`font-display`
and `font-mono` are separate from the size utility** — `text-headline-xl` sets
the metrics, not the family. And `text-label-caps` does **not** include
`text-transform`; Tailwind's `--text-*` modifiers cover size, height, weight and
tracking only, so add `uppercase` at the call site.

Mono is not decoration. It is for values that get **scanned in a column** —
ports, IPs, build numbers — where digit alignment is the whole point.

### Elevation: borders, not shadows

"Tonal layers and low-contrast outlines." There are only two shadows in the
system, and cards are not one of them:

- **Level 1 (cards, containers):** `border border-border` and **no shadow**.
  Depth is the tonal step between the white card and the tinted canvas. Pass
  `shadow-none` when a primitive ships `shadow-sm` (`ui/card.tsx` does).
- **Level 2 (dropdowns, popovers, the auth card):** `shadow-level-2`.
- Hover on an interactive card shifts the **border** (`hover:border-input`), not
  the shadow.
- `shadow-nav-active` is the active nav item's glow, derived from
  `--sidebar-primary` so it moves with the accent.

`--radius` is `0.5rem`, which lands the derived steps on the design's shape
language: `rounded-sm` 4px (buttons, inputs, chips — "precision-molded, not
bubbly"), `rounded-lg` 8px (cards), `rounded-full` for status pills only.

### `.canvas-grid`

The one piece of texture in the system: a 24px dot lattice at 3% opacity behind
the page, applied by the app layout as an inset `pointer-events-none` overlay.
It is what keeps the flat, shadowless cards from floating on nothing. Content
sits in a `relative z-10` sibling above it.

### The tokens

| Use | Token |
| --- | ----- |
| Everything structural | `bg-steel-50 … bg-steel-950` (and `text-`, `border-`) |
| Accent (active state only) | `--color-accent-step` → `bg-accent-step`, and `--ring` |
| Success | `text-positive` / `bg-positive` |
| Status pills | `STATUS_TONE_CLASS` → `bg-tone-{success,info,warning,danger}` + `text-tone-*-fg` |
| Inline grid values | `text-ink-source` (came from), `text-ink-target` (landed on), `text-ink-accent` (a detail) |
| Everything else | standard shadcn semantics — `bg-background`, `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive`, … |

`tone-*` and `ink-*` are **themed per mode** in `:root`/`.dark`, so a call site
never needs a `dark:` counterpart — that is the point of them.

**`--secondary` is not the accent.** In shadcn's vocabulary `secondary` is a
muted *fill* (secondary buttons, the JENKINS badge); the design system's own
`secondary` is the blue accent and lives in `--color-accent-step`. Don't cross
those two.

### Verifying a token actually exists

A token that isn't registered in `@theme` produces **no CSS and no error** — the
element just renders unstyled. After adding one, check it compiled:

```bash
grep -c -F '.bg-your-token' $(grep -l 'sidebar-primary' .next/static/chunks/*.css | head -1)
```

### Two traps in the sidebar

1. **`--primary` is a deep slate — the same family the sidebar is painted with.**
   Inside the sidebar, `bg-primary`/`text-primary-foreground` disappears into the
   background. Use the `--sidebar-*` tokens there (`bg-sidebar-primary`,
   `text-sidebar-foreground`, `bg-sidebar-accent`) — never the global ones. Same
   for `text-muted-foreground` and the default `AvatarFallback` tone: both are
   tuned for a light surface and wash out on the dark chrome.

2. **`SidebarMenuButton`'s active styling applies to every button.** The primitive
   renders `data-active={isActive}` *unconditionally*, and React stringifies a
   `data-*` `false` — so the attribute is always present as `"false"`. Tailwind's
   `data-active:` variant compiles to `[data-active]`, which tests attribute
   **presence**, so the variant's
   `data-active:bg-sidebar-accent data-active:font-medium
   data-active:text-sidebar-accent-foreground` matches all of them. With the old
   near-invisible accent nobody noticed; the moment the active colour became
   distinct, the entire nav rendered filled.

   This hits **every** `SidebarMenuButton`, not just nav items — including the two
   that can never be active: the logo lockup and the account menu. Both rendered
   permanently filled.

   The fix is [`components/layout/sidebar-item-styles.ts`](../components/layout/sidebar-item-styles.ts),
   which exports one `NEVER_ACTIVE` string restating those variants so
   tailwind-merge drops the primitive's versions (same class group, same variant →
   last wins). All three call sites use it; `navItemClass()` in `app-sidebar.tsx`
   layers the *real* active styling on top from React state, with `!` because both
   land at equal specificity and emission order shouldn't decide the winner. It
   lives in a shared module because a copy that drifts fails silently — the button
   just renders filled.

   This is the same family as the Radix boolean-attribute trap above, but a
   *different* root cause: it is the primitive's own JSX, so upgrading Radix will
   not fix it. Don't edit `components/ui/sidebar.tsx` (rule 3); override at the
   call site.

3. **Reach for `data-[state=open]`, never `data-open:`.** The variant string also
   carries `data-open:hover:bg-sidebar-accent`, which is dead on 1.4.3 for the
   usual reason. When a `SidebarMenuButton` is a `DropdownMenuTrigger` (the
   account menu), style its open state with `data-[state=open]:` — the valued
   attribute 1.4.3 actually emits.

The sidebar is **280px**, not the primitive's 16rem. `SidebarProvider` spreads
`style` *after* its own custom properties, so the app layout overrides
`--sidebar-width` there.

Chart tokens `--chart-1..5` now differ by **hue** first and lightness second, so
series stay separable at higher counts than the old single-ramp palette allowed.

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
