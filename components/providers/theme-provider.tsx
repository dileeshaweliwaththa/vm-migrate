'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

// App-wide theme provider (light / dark / system) backed by next-themes.
// next-themes toggles the `class` on <html>, which drives the .dark tokens in
// globals.css. Not a UI component library — it does not violate the
// shadcn-only rule.
export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
