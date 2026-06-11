import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession, isAdmin } from '@/features/auth/session';
import { readEnv } from '@/lib/env';
import { SmokePanel } from './smoke-panel';

async function ConvexSmoke() {
  // Read the session unconditionally so the route keeps a request-time dynamic
  // hole in BOTH the production and preview builds — the build asserts one
  // render-mode classification (`partial`) for both targets, so the read must
  // happen the same way in each. The gate only *acts* on production: previews
  // stay open so the smoke test is exercisable where EVE login isn't available.
  const session = await getSession();
  if (readEnv('VERCEL_ENV') === 'production' && !isAdmin(session)) {
    redirect('/?auth_error=admin_required');
  }

  return <SmokePanel />;
}

function ConvexSmokeLoading() {
  return <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>;
}

// Disposable Convex foundation smoke page (3.4.3) — proves the reactive
// query/mutation round-trip and the spine's JWT resolving an identity.
// Admin-gated on production only, same pattern as /dev/sandbox.
export default function ConvexSmokePage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <Suspense fallback={<ConvexSmokeLoading />}>
        <ConvexSmoke />
      </Suspense>
    </div>
  );
}
