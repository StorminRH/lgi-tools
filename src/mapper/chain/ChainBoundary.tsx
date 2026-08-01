'use client';

// The calm no-access boundary (contract IS-5 / DC-4, decision PD-4).
//
// Revoked-versus-empty is decided by ERROR IDENTITY, never by row counts. An authorized empty map is
// a successful subscription with zero rows and renders the plain canvas; revoked or absent access is
// a query error carrying `{ code: 'FORBIDDEN' }`, which the Convex client throws during render. The
// two states are structurally disjoint, so the calm state is correct rather than merely quiet.
//
// Every other error is rethrown so it reaches `src/app/(map)/error.tsx`. Rethrowing rather than
// pattern-matching also keeps framework control-flow signals (redirects, notFound) flowing.
//
// There is deliberately NO retry control here (contract HC-4). Recovery is by remount: the host and
// this boundary are keyed by map id, so changing the `map` query param always re-subscribes fresh. A
// claim re-granted on the SAME map is recovered by navigation or reload only — a poller would be a
// second access-shaped surface the gate already owns.
import { Component, type ReactNode } from 'react';

/**
 * True when an error is the gate's FORBIDDEN rejection.
 *
 * Duck-typed on `data.code` rather than `instanceof ConvexError`: the error crosses a serialization
 * boundary from the server, and class identity is not worth depending on for a render-path branch.
 */
export function isForbiddenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { data } = error as { data?: unknown };
  if (typeof data !== 'object' || data === null) return false;
  return (data as { code?: unknown }).code === 'FORBIDDEN';
}

/**
 * The calm state shown when the caller no longer holds access to the map.
 *
 * Carries no spinner and no retry or reload control, and does not claim prior access existed — the
 * same copy is correct for a live revocation and for a map the caller never had.
 */
export function NoMapAccess() {
  return (
    <section
      data-chain-no-access
      className="flex h-full w-full items-center justify-center px-6 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-3">
        <div className="font-data text-label uppercase tracking-eyebrow text-muted">
          Atlas · access
        </div>
        {/* Deliberately NOT uppercased, unlike other display headings: `o7` is the salute and `O7`
            is not, so the house uppercase treatment would break the word. */}
        <h2 className="font-display text-title font-bold tracking-copy text-name">
          {/* Non-breaking space so the salute can never wrap onto a line of its own. */}
          You&rsquo;ve lost access to this map&nbsp;<span className="text-isk">o7</span>
        </h2>
        <p className="text-body leading-relaxed text-text">
          Another map can be opened from the atlas or access can be restored by the
          map&rsquo;s owner.
        </p>
      </div>
    </section>
  );
}

interface ChainBoundaryProps {
  readonly children: ReactNode;
}

interface ChainBoundaryState {
  readonly error: unknown;
}

/**
 * Catches exactly the gate's FORBIDDEN rejection around the chain host and renders the calm state.
 *
 * Reset is by remount only, which is why callers key this by map id.
 */
export class ChainBoundary extends Component<ChainBoundaryProps, ChainBoundaryState> {
  override state: ChainBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ChainBoundaryState {
    return { error };
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isForbiddenError(error)) return <NoMapAccess />;
    // Not ours: hand it to the map's own recovery surface.
    throw error;
  }
}
