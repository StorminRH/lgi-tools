// Wrapper around `tsx src/db/migrate.ts` for Vercel's vercel-build step.
//
// Runs migrations ONLY when VERCEL_ENV is 'production' — i.e. the deploy
// to main. Preview deployments (PR builds) skip the migration entirely
// because the project's Vercel ↔ Neon integration does not currently
// isolate preview deploys to their own database branch, so running
// `pnpm db:migrate` from a preview would silently apply schema changes
// to prod.
//
// On a local `pnpm build`, VERCEL_ENV is unset and this script is a
// no-op (local dev runs `pnpm db:migrate` explicitly).

const env = process.env.VERCEL_ENV;

if (env !== 'production') {
  console.log(`Skipping migrations (VERCEL_ENV=${env ?? 'unset'} — only run on production deploys).`);
  process.exit(0);
}

// Avoid top-level await — tsx's CJS transform on Vercel rejects it.
import('./migrate').catch((err) => {
  console.error(err);
  process.exit(1);
});
