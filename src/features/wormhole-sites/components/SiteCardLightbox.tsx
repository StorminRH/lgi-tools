'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { Modal } from '@/components/ui/modal';
import { sitesDetailMode } from '@/lib/preferences';
import type { SiteDetail } from '../types';
import { SiteCardHeader } from './SiteCardHeader';
import { SiteDetailsBody } from './SiteDetailsBody';

// Must match the .sites-lightbox-panel transition duration in globals.css. The
// exit defers el.close() by this long so the scale-out plays before the browser
// tears down the dialog's top layer.
const LIGHTBOX_MS = 200;

// 'closed'  → dialog not shown
// 'opening' → showModal() called, waiting for the rAF that flips animOpen=true
// 'open'    → fully shown
// 'closing' → animOpen=false, exit transition playing; el.close() deferred
type Phase = 'closed' | 'opening' | 'open' | 'closing';

/**
 * Lightbox-mode expand for a catalogue site card. Rendered as a sibling of the
 * card's `<details>` (never inside it — a closed `<details>` hides its content
 * subtree, which could hide a dialog rendered within). Reads the `sitesDetailMode`
 * preference: in `expand` mode it renders nothing and the native `<details>` +
 * `LazySiteDetails` own the in-place expansion; in `lightbox` mode it intercepts
 * the summary click (cancelling the native toggle) and opens the full card —
 * header + detail body — centred over the dimmed catalogue.
 *
 * The CSP-safe enter/exit scale follows the loading-toast pattern: a `phase` ref
 * (read synchronously inside the close/cancel handlers, where a useState would be
 * stale) drives `mounted` (→ Modal showModal/close) and `animOpen` (→ the
 * [data-open] stylesheet transition), decoupled so the transform can play in both
 * directions. Esc is animated by intercepting the dialog's cancelable `cancel`
 * event rather than touching the shared Modal primitive. Honours reduced motion.
 */
export function SiteCardLightbox({ site }: { site: SiteDetail }) {
  const [mode] = usePreference(sitesDetailMode);
  const nameId = useId();

  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [animOpen, setAnimOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  const phase = useRef<Phase>('closed');
  const rafA = useRef(0);
  const rafB = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearPending = useCallback(() => {
    if (rafA.current) cancelAnimationFrame(rafA.current);
    if (rafB.current) cancelAnimationFrame(rafB.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    rafA.current = 0;
    rafB.current = 0;
    closeTimer.current = undefined;
  }, []);

  const requestOpen = useCallback(() => {
    if (phase.current === 'opening' || phase.current === 'open') return;
    clearPending(); // re-open mid-exit: kill the deferred unmount so it can't close us
    phase.current = 'opening';
    setEverOpened(true);
    setMounted(true);
    if (reduced) {
      setAnimOpen(true);
      phase.current = 'open';
      return;
    }
    // Double rAF: guarantee the closed frame paints before flipping open so the
    // scale transition has a before/after to animate between.
    rafA.current = requestAnimationFrame(() => {
      rafB.current = requestAnimationFrame(() => {
        if (phase.current !== 'opening') return; // a close landed mid-schedule
        setAnimOpen(true);
        phase.current = 'open';
      });
    });
  }, [reduced, clearPending]);

  const requestClose = useCallback(() => {
    // Idempotent: Esc/backdrop/close-button AND the `close` event from el.close()
    // all funnel here; the guard makes every redundant call a no-op.
    if (phase.current === 'closed' || phase.current === 'closing') return;
    clearPending(); // kill any in-flight open rAF (open→close race)
    phase.current = 'closing';
    setAnimOpen(false);
    closeTimer.current = setTimeout(
      () => {
        phase.current = 'closed'; // set before unmount so the close-event re-entry is a no-op
        setMounted(false);
      },
      reduced ? 0 : LIGHTBOX_MS,
    );
  }, [reduced, clearPending]);

  useEffect(() => () => clearPending(), [clearPending]);

  // Lightbox mode: a click on the card's summary opens the overlay instead of
  // expanding it in place. preventDefault cancels the native <details> toggle
  // (fires for mouse + keyboard Enter/Space). Also collapse any in-place expand
  // left over from a live switch out of expand mode.
  useEffect(() => {
    if (mode !== 'lightbox') return;
    const card = anchorRef.current?.closest('.sites-card');
    const summary = card?.querySelector<HTMLElement>('details > summary');
    const details = card?.querySelector('details');
    if (!summary) return;
    if (details?.open) details.open = false;
    const onClick = (e: Event) => {
      e.preventDefault();
      requestOpen();
    };
    summary.addEventListener('click', onClick);
    return () => summary.removeEventListener('click', onClick);
  }, [mode, requestOpen]);

  // Animate the exit on Esc: intercept the dialog's cancelable `cancel` event
  // (preventDefault stops the browser's instant close) and route to requestClose.
  // Scoped to while the dialog is shown; the panel's closest <dialog> is Modal's.
  useEffect(() => {
    if (!mounted) return;
    const dialog = panelRef.current?.closest('dialog');
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      requestClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [mounted, requestClose]);

  return (
    <span ref={anchorRef} className="contents">
      {mode === 'lightbox' && (
        <Modal
          open={mounted}
          onClose={requestClose}
          labelledBy={nameId}
          className="sites-lightbox-dialog backdrop:backdrop-blur-sm"
        >
          <div
            ref={panelRef}
            data-open={animOpen ? 'true' : 'false'}
            className="sites-lightbox-panel"
          >
            <div className="sticky top-0 z-10 flex justify-end bg-bg px-2 py-1.5">
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="font-mono text-[15px] leading-none text-muted hover:text-name px-1.5 py-0.5"
              >
                ×
              </button>
            </div>
            {everOpened && (
              <div className="sites-lightbox-zoom pb-3">
                <div className="sites-card-summary">
                  <SiteCardHeader site={site} nameId={nameId} />
                </div>
                <SiteDetailsBody site={site} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </span>
  );
}
