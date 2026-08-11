// Shared neutraliser for `SidebarMenuButton`'s phantom active state.
//
// The primitive renders `data-active={isActive}` **unconditionally**, and React
// stringifies a `data-*` `false` — so the attribute is always present as
// `"false"`. Tailwind's `data-active:` variant compiles to `[data-active]`, which
// tests attribute *presence*, so the variant's
// `data-active:bg-sidebar-accent data-active:font-medium
//  data-active:text-sidebar-accent-foreground`
// applies to every button in the sidebar — the logo lockup and the account menu
// included, neither of which is ever "active".
//
// Restating the same variants lets tailwind-merge drop the primitive's versions
// (same class group, same variant, so last one wins). Kept in one module because
// three call sites need it and a copy that drifts fails **silently** — the button
// just renders permanently filled.
//
// This is the same family as the Radix boolean-attribute traps in
// docs/ui-guidelines.md, but a different root cause: it is the primitive's own
// JSX, so upgrading Radix will not fix it. Don't patch components/ui/sidebar.tsx
// (UI guidelines rule 3) — override at the call site.
export const NEVER_ACTIVE =
  'data-active:bg-transparent data-active:font-normal data-active:text-sidebar-foreground';
