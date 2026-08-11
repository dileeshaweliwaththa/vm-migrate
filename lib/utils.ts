import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The design system's type scale, registered in Tailwind's `--text-*` namespace
// in app/globals.css. Kept here as one list so the two can be compared at a
// glance — a name in globals.css that is missing here silently misbehaves.
const FONT_SIZES = [
  "headline-xl",
  "headline-lg",
  "headline-md",
  "body-md",
  "body-sm",
  "label-mono",
  "label-caps",
] as const

// tailwind-merge has to be told about custom `text-*` sizes, and getting this
// wrong fails **silently in two directions**:
//
//  1. It can't tell `text-label-caps` from a *colour*, so `text-{size}` was
//     resolved into the `text-color` group. `cn('text-foreground', 'text-label-caps')`
//     dropped `text-foreground` — a real colour class, removed without a warning.
//  2. Because it also didn't recognise them as font sizes, a primitive's own size
//     survived the merge: `cn('text-xs font-medium', 'text-label-caps')` kept
//     *both* sizes, leaving CSS emission order to pick the winner rather than the
//     call site.
//
// Registering them in the `font-size` group fixes both: the custom name now
// replaces `text-xs` / `text-sm` / `text-lg` the way any built-in size would, and
// it stops shadowing text colours.
//
// A `--text-*` entry carries its own line-height, weight and tracking, so a
// primitive's `leading-*` / `font-*` / `tracking-*` still wins where it sets one
// (they are separate class groups, and `font-weight` in particular resolves
// through `--tw-font-weight`). Restate those at the call site when the design's
// value has to hold — see the note on `[&_th]:font-bold` in
// components/environments/environments-section.tsx.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
