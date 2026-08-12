import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import QueryProvider from "@/components/providers/query-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// The three faces of the "Kinetic Slate" design system, one per job — headlines,
// body, and technical metadata. All three are variable fonts, so no `weight` is
// needed and every weight the design asks for (600/700 display, 500 mono) is
// available from a single file. `--font-*` names are consumed by the
// `--font-display` / `--font-sans` / `--font-mono` theme tokens in globals.css.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// The tab name matches the sidebar wordmark's `aria-label` ("DevOps Portal"),
// not its display casing — DEVOPS is set in caps as a design treatment, and an
// all-caps tab title next to ordinary ones reads as shouting. The icon is
// `app/icon.svg`; there is no `favicon.ico`, so this is the only mark.
export const metadata: Metadata = {
  title: "DevOps Portal",
  description: "Projects, environments, deployments and the VM migration tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html>: next-themes sets the theme class on
    // the client before hydration, which would otherwise flag a mismatch.
    <html
      lang="en"
      className={`${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes into <body> before hydration, causing false mismatches. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider>
            <QueryProvider>{children}</QueryProvider>
          </TooltipProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
