import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sql/ holds manual Supabase SQL Editor scripts only — it is not part of the
  // Next.js app and should never be bundled or traced.
  outputFileTracingExcludes: {
    "**/*": ["./sql/**"],
  },
};

export default nextConfig;
