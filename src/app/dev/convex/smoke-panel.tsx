'use client';

// DISPOSABLE smoke panel (3.4.3) — the only consumer of convex/smoke.ts.
// Delete together with that module when real tracker surfaces land.
//
// What it proves, live: useQuery streams `smoke.get` over the websocket (bump
// in a second window and the counter moves without a reload), and
// `viewerSubject` is the server-side ctx.auth.getUserIdentity() result — the
// Better Auth user id for a signed-in pilot, null for anonymous.

import { Authenticated, Unauthenticated, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted">{label}</span>
      <span className="font-mono text-[12px] text-name break-all">{value}</span>
    </div>
  );
}

function ConnectedPanel() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const smoke = useQuery(api.smoke.get);
  const bump = useMutation(api.smoke.bump);

  return (
    <div className="w-full max-w-[560px] border border-border bg-section rounded-[4px] p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display font-bold text-[15px] text-name tracking-[0.04em]">
          Convex reactive smoke test
        </span>
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-isk">3.4.3</span>
      </div>

      <Row
        label="Convex auth"
        value={isLoading ? 'resolving…' : isAuthenticated ? 'authenticated' : 'anonymous'}
      />
      <Row label="Counter" value={smoke === undefined ? '…' : String(smoke.counter)} />
      <Row label="Last bumped by" value={smoke?.lastBumpedBy ?? '—'} />
      <Row label="getUserIdentity().subject" value={smoke ? (smoke.viewerSubject ?? 'null') : '…'} />

      <Authenticated>
        <p className="font-mono text-[11px] leading-[1.6] text-muted">
          Signed in — the spine&apos;s JWT validated against the embedded JWKS; the subject above is
          your Better Auth user id.
        </p>
      </Authenticated>
      <Unauthenticated>
        <p className="font-mono text-[11px] leading-[1.6] text-muted">
          Anonymous — queries run without identity; bumps record as &quot;anonymous&quot;.
        </p>
      </Unauthenticated>

      <button
        type="button"
        onClick={() => void bump({})}
        className="self-start font-mono text-[11px] tracking-[0.1em] uppercase border border-border rounded-[4px] px-4 py-2 text-name hover:bg-raised cursor-pointer"
      >
        Bump counter
      </button>

      <p className="font-mono text-[10px] leading-[1.6] text-muted">
        Open this page in a second window and bump there — this one should update without a reload.
      </p>
    </div>
  );
}

export function SmokePanel() {
  // No NEXT_PUBLIC_CONVEX_URL at build time — no provider is mounted, and no
  // Convex hook may run. Plain notice instead of a crash.
  if (convexClient === null) {
    return (
      <p className="font-mono text-[11px] text-muted">
        Convex is not configured (NEXT_PUBLIC_CONVEX_URL unset) — run `npx convex dev` locally to
        provision a dev deployment.
      </p>
    );
  }
  return <ConnectedPanel />;
}
