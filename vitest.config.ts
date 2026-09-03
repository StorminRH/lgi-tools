import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./scripts/test-stubs/server-only.mjs', import.meta.url),
      ),
    },
  },
  test: {

    // via a per-file `// @vitest-environment edge-runtime` directive (convex-test

    include: [
      'src/**/*.test.ts',
      'convex/**/*.test.ts',
      'scripts/**/*.test.mjs',

      'e2e/**/*.test.ts',
    ],
    coverage: {

      provider: 'istanbul',
      reporter: ['text', 'json'],
      reportsDirectory: './coverage',

      exclude: [...coverageConfigDefaults.exclude, 'convex/_generated/**'],
    },
  },
});
