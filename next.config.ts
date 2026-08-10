import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone — a self-contained server.js plus only the node_modules
  // it actually traced. This is what makes the Docker runtime image small and
  // lets it run without `npm`, a lockfile, or a dependency install at all.
  // See docs/deployment.md.
  output: "standalone",

  // supabase/ holds CLI migration files and config only — it is not part of the
  // Next.js app and should never be bundled or traced.
  outputFileTracingExcludes: {
    "**/*": ["./supabase/**"],
  },

  // Response headers that cost nothing and close off whole classes of attack on
  // an internal tool. Deliberately *not* a full CSP: script-src would need a
  // nonce threaded through the app, and a broken CSP is worse than none. See
  // docs/security.md § Browser hardening for what a real CSP would take.
  //
  // frame-ancestors is doubled with X-Frame-Options because the two are read by
  // different browsers/versions, and this app has admin-only destructive actions
  // (purge, clear trash, replace-all import) that a clickjack could drive.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
