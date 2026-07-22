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
