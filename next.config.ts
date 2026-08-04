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
};

export default nextConfig;
