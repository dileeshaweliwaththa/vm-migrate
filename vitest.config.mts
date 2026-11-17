import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for the pure logic: the rules in `services/` and the helpers in
// `lib/` that take plain values and return plain values. Nothing here renders or
// talks to Supabase, Azure or Jenkins, so the environment is plain Node. UI is
// still checked by `npm run build`, `npm run lint` and a look in the browser.
//
// Tests sit next to the file they cover, as `<name>.test.ts`.
export default defineConfig({
  resolve: {
    // The same `@/` → repo root mapping as `paths` in tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'supabase/**'],
  },
});
