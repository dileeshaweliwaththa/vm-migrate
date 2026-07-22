function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: requireEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
  ),
} as const;
