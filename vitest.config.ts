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
    // Convex tests (convex/**/*.test.ts) run under the edge-runtime environment
    // via a per-file `// @vitest-environment edge-runtime` directive (convex-test
    // needs it); the default node environment stays in force for the src suite.
    // scripts/**/*.test.mjs cover the pure helpers extracted from the CLI/CI
    // scripts (arg parsing, route-key derivation, fixture canonicalisation)
    // plus durable lint-rail fixtures; entry scripts themselves run at import,
    // so only their import-safe sibling modules are unit-tested.
    include: ['src/**/*.test.ts', 'convex/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      // fallow's `--coverage` ingests an Istanbul coverage map
      // (coverage-final.json) for exact per-function CRAP scoring and rejects
      // the v8 provider's native format, so use the istanbul provider.
      provider: 'istanbul',
      reporter: ['text', 'json'],
      reportsDirectory: './coverage',
      // Generated Convex bindings carry no hand-written logic — keep them out of
      // the coverage map so they don't dilute per-function CRAP scoring. Spread
      // the defaults (node_modules, test files, …) since `exclude` replaces them.
      exclude: [...coverageConfigDefaults.exclude, 'convex/_generated/**'],
    },
  },
});
