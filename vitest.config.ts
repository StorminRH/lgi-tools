import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      // fallow's `--coverage` ingests an Istanbul coverage map
      // (coverage-final.json) for exact per-function CRAP scoring and rejects
      // the v8 provider's native format, so use the istanbul provider.
      provider: 'istanbul',
      reporter: ['text', 'json'],
      reportsDirectory: './coverage',
    },
  },
});
