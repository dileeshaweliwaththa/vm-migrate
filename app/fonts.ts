import { Hanken_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';

// The three faces of the "Kinetic Slate" design system, one per job — headlines,
// body, and technical metadata. All three are variable fonts, so no `weight` is
// needed and every weight the design asks for (600/700 display, 500 mono) is
// available from a single file. `--font-*` names are consumed by the
// `--font-display` / `--font-sans` / `--font-mono` theme tokens in globals.css.
//
// Shared by the two documents the app renders: `layout.tsx` and
// `global-error.tsx`, which replaces the root layout when it fails.
const hankenGrotesk = Hanken_Grotesk({
  variable: '--font-hanken-grotesk',
  subsets: ['latin'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

// The class for `<html>`: defines the three `--font-*` variables.
export const fontVariables = `${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`;
