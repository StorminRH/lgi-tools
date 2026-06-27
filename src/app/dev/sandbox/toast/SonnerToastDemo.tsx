'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { useLoadingToast } from '@/components/ui/loading-toast';
import { VariantFrame } from '../_shared/sandbox-ui';

// OOB.3.2 — the SHIPPED toast affordance, exercised through the real seam. The
// <Toaster> and LoadingToastProvider both live in the root layout now, so this
// page renders inside them — there is no local Toaster here. Everything routes
// through @/components/ui/toast (no raw `sonner` import anywhere outside that
// wrapper). The CSP/scroll probe (docs/ux-check/scripts/toast-csp-probe.mjs)
// fires the provider-driven sync, scrolls, and proves the toast stays pinned to
// the viewport (the OOB.3 scroll-detach fix) with zero CSP violations.

const BTN =
  'inline-flex items-center justify-center gap-1 font-mono text-[11px] uppercase ' +
  'tracking-[0.12em] text-isk border border-border-active bg-surface-raised px-3 py-1.5 ' +
  'rounded-[3px] cursor-pointer transition-colors hover:bg-row-hover ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-isk';

// The real global affordance: a boolean flag fed to useLoadingToast — exactly the
// LiveCharacterCard `syncing` / PricingProvider `refreshing` contract. The ambient
// LoadingToastProvider counts the token and drives ONE keyed sonner toast (loading
// on 0→1, "Synced" on →0). A toggle, so a sync stays up long enough for the probe
// (and a human) to scroll while it's on screen.
function ProviderSyncDemo() {
  const [busy, setBusy] = useState(false);
  useLoadingToast(busy);
  return (
    <button type="button" className={BTN} onClick={() => setBusy((b) => !b)}>
      {busy ? 'Stop sync' : 'Run sync'}
    </button>
  );
}

export function SonnerToastDemo() {
  return (
    <div className="w-full max-w-[1100px] grid gap-6 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      <VariantFrame
        tag="Shipped"
        title="Sync affordance (via provider)"
        notes="useLoadingToast(busy) → the ambient LoadingToastProvider drives one keyed sonner toast: loading on 0→1, 'Synced' on →0. The exact LiveCharacterCard / PricingProvider contract — toggle it, then scroll."
      >
        <div className="flex items-center justify-center py-6">
          <ProviderSyncDemo />
        </div>
      </VariantFrame>

      <VariantFrame
        tag="Shipped"
        title="One-off success / error"
        notes="Plain toast.success / toast.error via @/components/ui/toast — the general non-sync surface. Terminal-toned (isk green / red); no raw sonner import, no style attribute."
      >
        <div className="flex items-center justify-center gap-2 py-6">
          <button
            type="button"
            className={BTN}
            onClick={() => toast.success('Prices refreshed')}
          >
            Show success
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => toast.error('ESI gate unreachable')}
          >
            Show error
          </button>
        </div>
      </VariantFrame>
    </div>
  );
}
