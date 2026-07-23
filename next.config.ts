import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // supabase/ holds CLI migration files and config only — it is not part of the
  // Next.js app and should never be bundled or traced.
  outputFileTracingExcludes: {
    "**/*": ["./supabase/**"],
  },
};

export default nextConfig;
