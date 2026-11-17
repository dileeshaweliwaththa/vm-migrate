import type { Metadata } from "next";
import QueryProvider from "@/components/providers/query-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fontVariables } from "./fonts";
import "./globals.css";

// The tab name matches the sidebar wordmark's `aria-label` ("DevOps Portal"),
// not its display casing — DEVOPS is set in caps as a design treatment, and an
// all-caps tab title next to ordinary ones reads as shouting. The icon is
// `app/icon.svg`; there is no `favicon.ico`, so this is the only mark.
//
// The description is also the **link preview** in Teams and Slack, where it is
// often the only thing a colleague reads before deciding whether to click. So it
// names the three things the portal actually holds, in the sidebar's order,
// rather than describing the software.
const DESCRIPTION =
  "Upview's infrastructure in one place: the VM migration tracker, project environments and deployments, and MySQL database backups.";

// Turns `app/opengraph-image.tsx` into the absolute URL a crawler requires.
// There is one deployment, so its address is the default; `SITE_URL` overrides
// it, and is read at **build** time for statically rendered routes such as
// /login — which is where a visitor without a session lands, and therefore the
// page a link preview is generated from.
const SITE_URL = process.env.SITE_URL ?? 'https://deploy.upviewtech.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "DevOps Portal",
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'DevOps Portal',
    title: 'DevOps Portal',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DevOps Portal',
    description: DESCRIPTION,
  },
  // Internal tool behind a login: there is nothing here worth indexing, and the
  // link is shared deliberately rather than found.
  robots: { index: false, follow: false },
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
      className={`${fontVariables} h-full antialiased`}
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
