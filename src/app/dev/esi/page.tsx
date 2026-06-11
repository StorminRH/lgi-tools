import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/features/auth/auth';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { readEnv } from '@/lib/env';
import { SandboxHeader } from '../sandbox/_shared/sandbox-ui';
import { EsiSandboxPanel } from './esi-sandbox-panel';

async function EsiSandbox() {
  // Read the session unconditionally so the route keeps a request-time dynamic
  // hole in BOTH the production and preview builds — the build asserts one
  // render-mode classification (`partial`) for both targets, so the read must
  // happen the same way in each. The gate only *acts* on production: previews
  // stay open (anonymous shows the signed-out notice, since EVE login isn't
  // available there).
  const session = await auth.api.getSession({ headers: await headers() });
  if (readEnv('VERCEL_ENV') === 'production' && !session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }

  if (!session) {
    return (
      <p className="w-full max-w-[900px] text-[11px] text-muted">
        Signed out — sign in with a linked EVE character to exercise the
        endpoint reads. (EVE login is unavailable on preview deployments; the
        full authed pass happens on production.)
      </p>
    );
  }

  const characters = await listLinkedCharacters(session.user.id);
  return (
    <EsiSandboxPanel
      characters={characters.map((c) => {
        const health = deriveCharacterHealth({
          scope: c.scope,
          hasRefreshToken: c.hasRefreshToken,
        });
        // Client-safe projection — the raw granted-scope string never leaves
        // the server (queries.ts precedent), only what's missing from it.
        return {
          characterId: c.characterId,
          name: c.name,
          portraitUrl: c.portraitUrl,
          missingScopes: health.missingScopes,
          hasRefreshToken: c.hasRefreshToken,
        };
      })}
    />
  );
}

function EsiSandboxLoading() {
  return <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>;
}

// The 3.4.6 scope-superset proving page: reads every newly-scoped ESI endpoint
// for one of the operator's own characters through the shared gate and shows
// the raw response — body, status, and cache/rate headers — with zero
// interpretation. The trackers (3.4.7+) are written against what this page
// shows, not against guessed shapes. Admin-gated on production only, same
// pattern as /dev/sandbox.
export default function EsiSandboxPage() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20">
      <SandboxHeader
        title="ESI Endpoint Sandbox"
        subtitle="3.4.6 · raw authenticated reads through the gate · on-demand only, nothing stored"
      />
      <Suspense fallback={<EsiSandboxLoading />}>
        <EsiSandbox />
      </Suspense>
    </div>
  );
}
