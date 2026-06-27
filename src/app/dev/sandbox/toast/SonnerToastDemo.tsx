'use client';

import { useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { VariantFrame } from '../_shared/sandbox-ui';

// OOB.3.1 — sonner proving harness. ONE <Toaster> (sonner owns a single
// position:fixed container, portaled to <body>; OOB.3.2 moves it to the root
// layout). Every trigger styles via `className` only — never a `style` attribute
// — so the house JSX-style lint ban stays satisfied; sonner's own runtime style
// injection is permitted by the post-OOB.1.1 `style-src`. Firing a toast with
// zero CSP console violations is the proof. These are the exact idioms OOB.3.2
// will build the real toast on; the in-house loading strip is untouched.

const BTN =
  'inline-flex items-center justify-center gap-1 font-mono text-[11px] uppercase ' +
  'tracking-[0.12em] text-isk border border-border-active bg-surface-raised px-3 py-1.5 ' +
  'rounded-[3px] cursor-pointer transition-colors hover:bg-row-hover ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-isk';

// The keyed "syncing → synced" affordance — the global-strip replacement pattern
// (one toast updated in place by a stable id), over a short fake sync. This is
// what the OOB.3.2 provider will call on count 0→1 then →0.
function fireSyncing() {
  const id = 'sandbox-sync';
  toast.loading('Syncing…', { id });
  setTimeout(() => toast.success('Synced', { id }), 1600);
}

// toast.promise — auto loading → success/error around a real promise.
function firePromise() {
  toast.promise(new Promise((resolve) => setTimeout(resolve, 1600)), {
    loading: 'Reconciling order book…',
    success: 'Order book reconciled',
    error: 'Reconcile failed',
  });
}

// className-only styling via sonner's `classNames` map (Tailwind + EVE tokens) —
// proves the terminal look needs no JSX `style` attribute (rgba glow is permitted;
// the lint ban is hex-only).
function fireTokenStyled() {
  toast.success('Token-styled toast', {
    unstyled: true,
    classNames: {
      toast:
        'flex items-center gap-2 rounded-[3px] border border-border-active bg-section ' +
        'px-3.5 py-2.5 font-mono text-[12px] text-isk shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]',
      title: 'text-name',
    },
  });
}

export function SonnerToastDemo() {
  // Id of the persistent toast, so a second click dismisses it by id.
  const persistentId = useRef<string | number | null>(null);

  return (
    <>
      <Toaster position="top-center" theme="dark" richColors />
      <div className="w-full max-w-[1100px] grid gap-6 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        <VariantFrame
          tag="Idiom 1"
          title="Syncing → synced (keyed)"
          notes="toast.loading(id) then toast.success({ id }) — one toast updated in place. The OOB.3.2 global-affordance pattern."
        >
          <div className="flex items-center justify-center py-6">
            <button type="button" className={BTN} onClick={fireSyncing}>
              Run sync
            </button>
          </div>
        </VariantFrame>

        <VariantFrame
          tag="Idiom 2"
          title="Promise"
          notes="toast.promise(p, { loading, success, error }) — sonner drives the transitions off the promise."
        >
          <div className="flex items-center justify-center py-6">
            <button type="button" className={BTN} onClick={firePromise}>
              Run promise
            </button>
          </div>
        </VariantFrame>

        <VariantFrame
          tag="Idiom 3"
          title="Success / error"
          notes="Plain one-off toasts (richColors). The pattern for future non-sync messages."
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

        <VariantFrame
          tag="Idiom 4"
          title="Persistent (dismiss by id)"
          notes="duration: Infinity until dismissed — models a 'stays until count→0' affordance."
        >
          <div className="flex items-center justify-center gap-2 py-6">
            <button
              type="button"
              className={BTN}
              onClick={() => {
                persistentId.current = toast('Holding live session…', {
                  duration: Infinity,
                });
              }}
            >
              Show persistent
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                if (persistentId.current !== null) toast.dismiss(persistentId.current);
              }}
            >
              Dismiss persistent
            </button>
          </div>
        </VariantFrame>

        <VariantFrame
          tag="Idiom 5"
          title="Token-styled (className only)"
          notes="unstyled + classNames (Tailwind + EVE tokens). No `style` attribute → no lint exemption."
        >
          <div className="flex items-center justify-center py-6">
            <button type="button" className={BTN} onClick={fireTokenStyled}>
              Token-styled toast
            </button>
          </div>
        </VariantFrame>
      </div>
    </>
  );
}
